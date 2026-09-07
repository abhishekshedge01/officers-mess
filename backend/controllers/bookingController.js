import { ObjectId } from "mongodb";
import { getDB } from "../config/db.js";
import { messIdFilter, resolveUserMessId } from "../utils/messHelper.js";
import {
  addDays,
  dateOnly,
  day as toDate,
  stayDates as dates,
  todayIndia,
  validStayRange,
  markExpiredApprovedBookingsAsNoShow,
} from "../utils/stayDates.js";
import { withFinalStay } from "../utils/finalStay.js";
import { broadcastMessEvent } from "../utils/notificationHelper.js";
import { DEFAULT_MEAL_RATES } from "../models/Room.js";

const ACTIVE_STATUSES = {
  $nin: ["REJECTED", "CANCELLED", "USER_CANCELLED", "NO_SHOW", "CHECKED_OUT"],
};
const validRange = validStayRange;
const allowedCategories = [
  "TD_OFFICER",
  "OFFICER_LEAVE",
  "OFFICER_GUEST",
  "DEPENDANT_GUEST",
];
const CATEGORY_RATES = {
  TD_OFFICER: 2800,
  OFFICER_LEAVE: 1000,
  OFFICER_GUEST: 1000,
  DEPENDANT_GUEST: 1000,
};
const memberTypes = [
  "SERVING_OFFICER",
  "RETIRED_OFFICER",
  "DEPENDANT",
  "GUEST",
];

/**
 * Checks if two date intervals [from, to) and [rangeFrom, rangeTo) overlap.
 */
const overlaps = (from, to, rangeFrom, rangeTo) => {
  const a = dateOnly(from);
  const b = dateOnly(to);
  const c = dateOnly(rangeFrom);
  const d = dateOnly(rangeTo);
  return Boolean(a && b && c && d && a < d && b > c);
};

/**
 * Standardizes member document fields.
 */
const cleanMember = (m, i) => {
  const type = memberTypes.includes(String(m?.memberType || "").toUpperCase())
    ? String(m.memberType).toUpperCase()
    : "GUEST";

  return {
    memberId: new ObjectId(),
    name: String(m?.name || "").trim(),
    age: Number(m?.age) || 0,
    gender: String(m?.gender || "").trim(),
    memberType: type,
    serviceId: String(m?.serviceId || "").trim(),
    relation: String(m?.relation || "").trim(),
    mobile: String(m?.mobile || "").trim(),
    isChild: Boolean(m?.isChild),
    isBooker: Boolean(i === 0 && m?.isBooker),
  };
};

/**
 * Evaluates room inventory and day-level unavailability for requested stay dates.
 */
const availabilityForStay = async (db, messId, checkInDate, checkOutDate) => {
  await markExpiredApprovedBookingsAsNoShow(db, messId);
  const rooms = await db
    .collection("rooms")
    .find({ messId, status: "ACTIVE" })
    .sort({ roomNumber: 1 })
    .toArray();

  const bookings = await db
    .collection("bookings")
    .find({
      messId,
      status: ACTIVE_STATUSES,
      checkInDate: { $lt: checkOutDate },
      checkOutDate: { $gt: checkInDate },
    })
    .toArray();

  const allocations = await db
    .collection("room_allocations")
    .find({
      messId,
      status: "ACTIVE",
      from: { $lt: checkOutDate },
      to: { $gt: checkInDate },
    })
    .toArray();

  const blocks = await db
    .collection("room_blocks")
    .find({
      messId,
      status: "ACTIVE",
      from: { $lt: checkOutDate },
      to: { $gt: checkInDate },
    })
    .toArray();

  const unavailable = new Map(rooms.map((r) => [r._id.toString(), new Set()]));
  const unassignedBookings = [];

  for (const b of bookings) {
    const aa = allocations.filter(
      (a) => a.bookingId.toString() === b._id.toString(),
    );
    if (aa.length) {
      for (const a of aa) {
        for (const d of dates(a.from, a.to)) {
          unavailable.get(a.roomId.toString())?.add(d);
        }
      }
    } else if (b.roomId) {
      for (const d of dates(b.checkInDate, b.checkOutDate)) {
        unavailable.get(b.roomId.toString())?.add(d);
      }
    } else {
      // Pending request not yet allotted to a specific room number
      unassignedBookings.push(b);
    }
  }

  for (const x of blocks) {
    for (const d of dates(x.from, x.to)) {
      unavailable.get(x.roomId.toString())?.add(d);
    }
  }

  // Each unassigned pending booking reserves one suitable room slot for its stay dates
  for (const pending of unassignedBookings) {
    const stayDays = dates(pending.checkInDate, pending.checkOutDate);
    const guestCount = Number(
      pending.numberOfGuests || pending.stayMembers?.length || 1,
    );

    const candidate = rooms.find((room) => {
      if (Number(room.capacity || 0) < guestCount) return false;
      const roomBusyDays = unavailable.get(room._id.toString()) || new Set();
      return stayDays.every((day) => !roomBusyDays.has(day));
    });

    if (candidate) {
      const busySet = unavailable.get(candidate._id.toString());
      for (const d of stayDays) {
        busySet.add(d);
      }
    } else {
      for (const d of stayDays) {
        const anyRoom = rooms.find((r) => {
          if (Number(r.capacity || 0) < guestCount) return false;
          return !unavailable.get(r._id.toString())?.has(d);
        });
        if (anyRoom) {
          unavailable.get(anyRoom._id.toString())?.add(d);
        }
      }
    }
  }

  const ds = dates(checkInDate, checkOutDate);
  return { rooms, unavailable, days: ds };
};

/**
 * Generates final bill for a stay checkout.
 * Preserves accommodation night billing logic, child rate and extra charges.
 */
const createFinalBill = async (
  db,
  booking,
  actualCheckoutDate,
  mealInput = {},
) => {
  const existing = await db
    .collection("bills")
    .findOne({ bookingId: booking._id });
  if (existing?.paymentStatus === "PAID") return existing;

  const allocations = await db
    .collection("room_allocations")
    .find({ bookingId: booking._id, status: { $in: ["ACTIVE", "COMPLETED"] } })
    .sort({ updatedAt: -1, createdAt: -1 })
    .limit(1)
    .toArray();

  const rooms = await db
    .collection("rooms")
    .find({ _id: { $in: allocations.map((a) => a.roomId).filter(Boolean) } })
    .toArray();
  const roomMap = new Map(rooms.map((r) => [r._id.toString(), r]));

  const physicalCheckout = dateOnly(actualCheckoutDate || todayIndia());
  const billingCheckout =
    physicalCheckout <= dateOnly(booking.checkInDate)
      ? addDays(booking.checkInDate, 1)
      : physicalCheckout;
  const totalNights = Math.max(
    1,
    dates(booking.checkInDate, billingCheckout).length,
  );
  const items = [];
  let roomAmount = 0;

  if (allocations.length) {
    for (const allocation of allocations) {
      const room = roomMap.get(allocation.roomId?.toString());
      const from = allocation.from || booking.checkInDate;
      const to =
        allocation.to && allocation.to < billingCheckout
          ? allocation.to
          : billingCheckout;
      const nights = Math.max(0, dates(from, to).length);
      if (!nights) continue;

      const rate = Number(
        CATEGORY_RATES[booking.stayCategory] ??
          allocation.nightlyRate ??
          room?.rates?.[booking.stayCategory] ??
          0,
      );
      const amount = rate * nights;
      roomAmount += amount;
      items.push({
        description: `Room ${allocation.roomNumber} · ${String(booking.stayCategory).replaceAll("_", " ")}`,
        quantity: nights,
        rate,
        amount,
      });
    }
  }

  if (!allocations.length || roomAmount === 0) {
    const fallbackRoomId =
      booking.roomId || allocations.find((a) => a.roomId)?.roomId;
    const room = fallbackRoomId
      ? await db.collection("rooms").findOne({ _id: fallbackRoomId })
      : null;
    const rate = Number(
      CATEGORY_RATES[booking.stayCategory] ??
        allocations.find((a) => Number(a.nightlyRate) > 0)?.nightlyRate ??
        room?.rates?.[booking.stayCategory] ??
        0,
    );

    if (rate <= 0 && CATEGORY_RATES[booking.stayCategory]) {
      roomAmount = CATEGORY_RATES[booking.stayCategory] * totalNights;
    } else {
      roomAmount = rate * totalNights;
    }

    items.push({
      description: `Room charges · ${String(booking.stayCategory).replaceAll("_", " ")}`,
      quantity: totalNights,
      rate: rate > 0 ? rate : CATEGORY_RATES[booking.stayCategory] || 0,
      amount: roomAmount,
    });
  }

  const childCount = (booking.stayMembers || []).filter(
    (m) => m.isChild,
  ).length;
  let childAmount = 0;

  if (childCount && allocations.length) {
    for (const allocation of allocations) {
      const room = roomMap.get(allocation.roomId?.toString());
      const from = allocation.from || booking.checkInDate;
      const to =
        allocation.to && allocation.to < billingCheckout
          ? allocation.to
          : billingCheckout;
      const nights = Math.max(0, dates(from, to).length);
      const childRate = Number(allocation.childRate ?? room?.rates?.CHILD ?? 0);
      childAmount += childCount * childRate * nights;
    }

    if (childAmount > 0) {
      items.push({
        description: "Child accommodation charge",
        quantity: childCount * totalNights,
        rate: childAmount / Math.max(1, childCount * totalNights),
        amount: childAmount,
      });
    }
  }

  const extra = Array.isArray(booking.extraCharges) ? booking.extraCharges : [];
  const extraAmount = extra.reduce(
    (total, c) => total + Number(c.amount || 0),
    0,
  );
  for (const charge of extra) {
    items.push({
      description: String(charge.description || "Additional charge"),
      quantity: Number(charge.quantity || 1),
      rate: Number(charge.rate || 0),
      amount: Number(charge.amount || 0),
    });
  }

  // Messing / Meal calculation
  // Find configured meal rates from allocated room or fallback
  const primaryRoomId =
    allocations[0]?.roomId ||
    booking.roomId ||
    allocations.find((a) => a.roomId)?.roomId;
  let activeRoom = primaryRoomId
    ? roomMap.get(primaryRoomId.toString()) ||
      (await db.collection("rooms").findOne({ _id: primaryRoomId }))
    : null;

  const roomMealRates = {
    ...DEFAULT_MEAL_RATES,
    ...(activeRoom?.mealRates || {}),
  };

  const breakfastCount = Math.max(
    0,
    parseInt(
      mealInput.breakfastCount ?? mealInput.breakfast ?? mealInput.meals?.breakfast ?? 0,
      10,
    ) || 0,
  );
  const lunchCount = Math.max(
    0,
    parseInt(
      mealInput.lunchCount ?? mealInput.lunch ?? mealInput.meals?.lunch ?? 0,
      10,
    ) || 0,
  );
  const dinnerCount = Math.max(
    0,
    parseInt(
      mealInput.dinnerCount ?? mealInput.dinner ?? mealInput.meals?.dinner ?? 0,
      10,
    ) || 0,
  );

  const breakfastRate = Number(mealInput.breakfastRate ?? roomMealRates.BREAKFAST ?? DEFAULT_MEAL_RATES.BREAKFAST);
  const lunchRate = Number(mealInput.lunchRate ?? roomMealRates.LUNCH ?? DEFAULT_MEAL_RATES.LUNCH);
  const dinnerRate = Number(mealInput.dinnerRate ?? roomMealRates.DINNER ?? DEFAULT_MEAL_RATES.DINNER);

  const breakfastAmount = breakfastCount * breakfastRate;
  const lunchAmount = lunchCount * lunchRate;
  const dinnerAmount = dinnerCount * dinnerRate;
  const totalMealAmount = breakfastAmount + lunchAmount + dinnerAmount;

  if (breakfastCount > 0) {
    items.push({
      description: "Breakfast messing charge",
      quantity: breakfastCount,
      rate: breakfastRate,
      amount: breakfastAmount,
    });
  }
  if (lunchCount > 0) {
    items.push({
      description: "Lunch messing charge",
      quantity: lunchCount,
      rate: lunchRate,
      amount: lunchAmount,
    });
  }
  if (dinnerCount > 0) {
    items.push({
      description: "Dinner messing charge",
      quantity: dinnerCount,
      rate: dinnerRate,
      amount: dinnerAmount,
    });
  }

  const mealDetails = {
    breakfast: {
      count: breakfastCount,
      rate: breakfastRate,
      amount: breakfastAmount,
    },
    lunch: {
      count: lunchCount,
      rate: lunchRate,
      amount: lunchAmount,
    },
    dinner: {
      count: dinnerCount,
      rate: dinnerRate,
      amount: dinnerAmount,
    },
    totalMealAmount,
  };

  const total = roomAmount + childAmount + extraAmount + totalMealAmount;
  const now = new Date();

  const bill = {
    bookingId: booking._id,
    userId: booking.userId,
    messId: booking.messId,
    booker: booking.booker,
    stayMembers: booking.stayMembers,
    stayCategory: booking.stayCategory,
    travellingWithKid: booking.travellingWithKid,
    roomNumber: booking.roomNumber,
    checkInDate: booking.checkInDate,
    scheduledCheckOutDate: booking.checkOutDate,
    actualCheckOutDate: billingCheckout,
    physicalCheckOutDate: physicalCheckout,
    nights: totalNights,
    childCount,
    billableStayMemberCount: 1,
    extraChargesTotal: extraAmount,
    items,
    mealDetails,
    totalMealAmount,
    subtotal: total,
    tax: 0,
    totalAmount: total,
    currency: "INR",
    paymentStatus: "PENDING",
    paymentId: null,
    paidAt: null,
    invoiceNumber: null,
    receiptNumber: null,
    mealReceiptNumber: null,
    createdAt: now,
    updatedAt: now,
  };

  if (existing) {
    await db
      .collection("bills")
      .updateOne(
        { _id: existing._id, paymentStatus: { $ne: "PAID" } },
        { $set: { ...bill, _id: existing._id, updatedAt: now } },
      );
    return { ...bill, _id: existing._id };
  }

  const result = await db.collection("bills").insertOne(bill);
  return { ...bill, _id: result.insertedId };
};

/**
 * Create a new accommodation booking request.
 */
export const createBooking = async (req, res) => {
  try {
    const {
      messId,
      checkInDate,
      checkOutDate,
      stayCategory,
      travellingWithKid = false,
      stayMembers = [],
      purpose = "",
    } = req.body || {};

    if (!messId || !checkInDate || !checkOutDate || !stayCategory) {
      return res.status(400).json({
        message:
          "messId, check-in date, check-out date and stay category are required",
      });
    }
    if (!ObjectId.isValid(messId)) {
      return res.status(400).json({ message: "Invalid mess ID" });
    }
    if (!validRange(checkInDate, checkOutDate)) {
      return res.status(400).json({
        message:
          "Check-out date must be after check-in date and dates must be YYYY-MM-DD",
      });
    }
    if (dateOnly(checkInDate) < todayIndia()) {
      return res.status(400).json({
        message: "Check-in date cannot be prior to today",
      });
    }
    if (!allowedCategories.includes(stayCategory)) {
      return res.status(400).json({ message: "Invalid stay category" });
    }
    if (!Array.isArray(stayMembers) || stayMembers.length < 1) {
      return res
        .status(400)
        .json({ message: "Add at least one person who will stay in the room" });
    }

    const cleaned = stayMembers.map(cleanMember);
    if (cleaned.some((x) => !x.name)) {
      return res
        .status(400)
        .json({ message: "Every stay member must have a name" });
    }

    const kid = Boolean(travellingWithKid || cleaned.some((x) => x.isChild));
    const db = getDB();
    const messObjectId = new ObjectId(messId);
    const [mess, user] = await Promise.all([
      db.collection("messes").findOne({ _id: messObjectId, status: "ACTIVE" }),
      db.collection("users").findOne({
        _id: new ObjectId(req.user.id),
        role: "USER",
        accountStatus: "ACTIVE",
      }),
    ]);

    if (!mess)
      return res.status(404).json({ message: "Mess not found or inactive" });
    if (!user)
      return res.status(404).json({ message: "User not found or inactive" });

    const { rooms, unavailable, days } = await availabilityForStay(
      db,
      messObjectId,
      checkInDate,
      checkOutDate,
    );
    const guestCount = cleaned.length;
    const suitable = rooms.filter((r) => Number(r.capacity || 0) >= guestCount);
    if (!suitable.length) {
      return res.status(409).json({
        message: `No room can accommodate ${guestCount} staying member(s)`,
      });
    }

    const single = suitable.find((r) =>
      days.every((d) => !unavailable.get(r._id.toString()).has(d)),
    );
    if (!single) {
      return res.status(409).json({
        message:
          "The selected dates are not fully available for the requested party size",
        code: "PARTIAL_AVAILABILITY",
        partialAvailability: days.length
          ? {
              checkInDate: days[0],
              checkOutDate: days[days.length - 1],
              nights: days.length,
            }
          : null,
      });
    }

    const booker = {
      userId: user._id,
      name: user.name,
      email: user.email,
      mobile: user.mobile || "",
      serviceId: user.serviceId || "",
      rank: user.rank || "",
      role: user.role,
    };

    const booking = {
      userId: user._id,
      booker,
      stayMembers: cleaned,
      travellingWithKid: kid,
      stayCategory,
      checkInDate,
      checkOutDate,
      nights: days.length,
      messId: messObjectId,
      numberOfGuests: guestCount,
      purpose: String(purpose).trim(),
      status: "PENDING_MANAGER",
      roomId: null,
      roomNumber: null,
      allocationStatus: "PENDING",
      approval: {
        manager: { status: "PENDING", approvedBy: null, approvedAt: null },
        secretary: { status: "PENDING", approvedBy: null, approvedAt: null },
        pmc: { status: "PENDING", approvedBy: null, approvedAt: null },
      },
      extraCharges: [],
      billId: null,
      checkInAt: null,
      checkOutAt: null,
      checkoutRequestedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const result = await db.collection("bookings").insertOne(booking);
    await broadcastMessEvent(db, {
      messId: mess._id,
      userId: req.user.id,
      type: "BOOKING_CREATED",
      title: "New stay request",
      bookingId: result.insertedId,
      userMessage: `Your stay request from ${checkInDate} to ${checkOutDate} has been submitted and is waiting for Manager approval.`,
      staffMessage: `New ${stayCategory.replaceAll("_", " ").toLowerCase()} stay request submitted by ${req.user.name || "Guest"} (${checkInDate} to ${checkOutDate}).`,
      notifyUser: true,
    });

    res.status(201).json({
      message: "Stay request created successfully",
      booking: { ...booking, _id: result.insertedId },
      availability: {
        fullyAvailable: true,
        bestSingleRoom: { roomId: single._id, roomNumber: single.roomNumber },
      },
    });
  } catch (e) {
    console.error("CREATE BOOKING ERROR:", e);
    res.status(500).json({ message: "Server error" });
  }
};

/**
 * Get all stay bookings of currently authenticated user.
 */
export const getMyBookings = async (req, res) => {
  try {
    const db = getDB();
    await markExpiredApprovedBookingsAsNoShow(db);
    const bookings = await db
      .collection("bookings")
      .find({ userId: new ObjectId(req.user.id) })
      .sort({ createdAt: -1 })
      .toArray();
    res.json({ count: bookings.length, bookings });
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: "Server error" });
  }
};

/**
 * Retrieve booking details and its allocations by bookingId.
 */
export const getBookingById = async (req, res) => {
  try {
    if (!ObjectId.isValid(req.params.bookingId)) {
      return res.status(400).json({ message: "Invalid booking ID" });
    }
    const db = getDB();
    const b = await db
      .collection("bookings")
      .findOne({ _id: new ObjectId(req.params.bookingId) });
    if (!b) return res.status(404).json({ message: "Booking not found" });

    const u = await db
      .collection("users")
      .findOne({ _id: new ObjectId(req.user.id) });
    const owner = b.userId?.toString() === req.user.id;
    const same =
      ["PMC", "MESS_MANAGER", "MESS_SECRETARY"].includes(u?.role) &&
      u?.messId &&
      b.messId?.toString() === u.messId.toString();

    if (!owner && u?.role !== "ADMIN" && !same) {
      return res.status(403).json({ message: "Access denied" });
    }

    const allocations = await db
      .collection("room_allocations")
      .find({ bookingId: b._id })
      .sort({ from: 1 })
      .toArray();

    res.json({ booking: b, allocations });
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: "Server error" });
  }
};

/**
 * User cancels a stay booking request (PENDING_MANAGER or APPROVED) before check-in.
 */
export const cancelBooking = async (req, res) => {
  try {
    if (!ObjectId.isValid(req.params.bookingId)) {
      return res.status(400).json({ message: "Invalid booking ID" });
    }
    const db = getDB();
    const id = new ObjectId(req.params.bookingId);
    const reason = (req.body?.reason || req.body?.cancellationReason || "").trim();

    const booking = await db.collection("bookings").findOne({
      _id: id,
      userId: new ObjectId(req.user.id),
    });

    if (!booking) {
      return res.status(404).json({ message: "Booking not found" });
    }

    if (["CANCELLED", "USER_CANCELLED"].includes(booking.status)) {
      return res.status(400).json({ message: "Booking is already cancelled" });
    }

    if (
      ["CHECKED_IN", "CHECKOUT_REQUESTED", "CHECKED_OUT", "COMPLETED"].includes(
        booking.status,
      )
    ) {
      return res.status(400).json({
        message: "Booking cannot be cancelled after check-in or checkout",
      });
    }

    if (booking.status === "NO_SHOW") {
      return res
        .status(400)
        .json({ message: "Booking has already elapsed as No Show" });
    }

    if (!["PENDING_MANAGER", "APPROVED"].includes(booking.status)) {
      return res
        .status(400)
        .json({ message: "Booking cannot be cancelled at this stage" });
    }

    const now = new Date();
    await db.collection("bookings").updateOne(
      { _id: id },
      {
        $set: {
          status: "USER_CANCELLED",
          cancellationReason: reason || null,
          cancelledAt: now,
          updatedAt: now,
          roomId: null,
          roomNumber: null,
        },
      },
    );

    // Free up earmarked room allocation immediately so other users can book this room
    await db
      .collection("room_allocations")
      .updateMany(
        { bookingId: id, status: "ACTIVE" },
        { $set: { status: "CANCELLED", updatedAt: now } },
      );

    const reasonNote = reason ? ` Reason: ${reason}` : "";
    await broadcastMessEvent(db, {
      messId: booking.messId,
      userId: booking.userId,
      type: "BOOKING_CANCELLED",
      title: "Booking cancelled",
      bookingId: booking._id,
      userMessage: `Your booking from ${booking.checkInDate} to ${booking.checkOutDate} has been cancelled.${reasonNote}`,
      staffMessage: `Stay request for ${booking.booker?.name || "Guest"} (${booking.checkInDate} to ${booking.checkOutDate}) was cancelled by the user.${reasonNote}`,
      notifyUser: true,
    });

    res.json({
      message: "Stay booking cancelled successfully",
      status: "USER_CANCELLED",
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: "Server error" });
  }
};

/**
 * Get all mess bookings with monitored final stay metadata (Manager, Secretary, PMC).
 */
export const getMessBookings = async (req, res) => {
  try {
    const db = getDB();
    const u = await db
      .collection("users")
      .findOne({ _id: new ObjectId(req.user.id) });

    const rawMessId = await resolveUserMessId(db, u);
    if (!rawMessId)
      return res.status(400).json({ message: "No mess assigned" });

    await markExpiredApprovedBookingsAsNoShow(db, rawMessId);

    const filter = { messId: messIdFilter(rawMessId) };
    if (req.query.status) filter.status = req.query.status;

    const bookings = await db
      .collection("bookings")
      .find(filter)
      .sort({ checkInDate: 1, createdAt: -1 })
      .toArray();

    const monitoredBookings = await withFinalStay(db, bookings);
    res.json({ count: monitoredBookings.length, bookings: monitoredBookings });
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: "Server error" });
  }
};

/**
 * Check-in guest on arrival date and allocate best suitable room.
 */
export const checkIn = async (req, res) => {
  try {
    const db = getDB();
    const manager = await db.collection("users").findOne({
      _id: new ObjectId(req.user.id),
      role: "MESS_MANAGER",
    });

    if (!manager?.messId) {
      return res
        .status(403)
        .json({ message: "Manager is not assigned to a mess" });
    }
    if (!ObjectId.isValid(req.params.bookingId)) {
      return res.status(400).json({ message: "Invalid booking ID" });
    }

    const id = new ObjectId(req.params.bookingId);
    const messId = new ObjectId(manager.messId);

    const booking = await db.collection("bookings").findOne({
      _id: id,
      messId,
      status: "APPROVED",
    });

    if (!booking) {
      return res
        .status(400)
        .json({ message: "Booking must be approved before check-in" });
    }

    const bookingCheckIn = dateOnly(booking.checkInDate);
    const bookingCheckOut = dateOnly(booking.checkOutDate);
    if (!validRange(bookingCheckIn, bookingCheckOut)) {
      return res
        .status(400)
        .json({ message: "Booking has an invalid stay period" });
    }

    const today = todayIndia();
    if (today !== bookingCheckIn) {
      return res.status(400).json({
        message: `Check-in is allowed only on the guest arrival date (${bookingCheckIn})`,
      });
    }

    const guestCount = Math.max(
      1,
      Number(booking.numberOfGuests || booking.stayMembers?.length || 1),
    );
    const stayDays = dates(bookingCheckIn, bookingCheckOut);
    if (!stayDays.length) {
      return res
        .status(400)
        .json({ message: "Booking has an invalid stay period" });
    }

    const rooms = await db
      .collection("rooms")
      .find({
        messId,
        status: { $in: ["ACTIVE", "AVAILABLE"] },
        capacity: { $gte: guestCount },
      })
      .sort({ capacity: 1, roomNumber: 1 })
      .toArray();

    if (!rooms.length) {
      return res.status(409).json({
        message: `No active room has enough capacity for ${guestCount} guest(s)`,
      });
    }

    const allocations = (
      await db
        .collection("room_allocations")
        .find({ messId, status: "ACTIVE" })
        .toArray()
    ).filter((a) => overlaps(bookingCheckIn, bookingCheckOut, a.from, a.to));

    const allocationByRoom = new Map();
    for (const allocation of allocations) {
      const roomKey = allocation.roomId?.toString();
      if (!roomKey || allocation.bookingId?.toString() === id.toString())
        continue;

      const set = allocationByRoom.get(roomKey) || new Set();
      for (const date of dates(
        dateOnly(allocation.from),
        dateOnly(allocation.to),
      )) {
        set.add(date);
      }
      allocationByRoom.set(roomKey, set);
    }

    const otherBookings = (
      await db
        .collection("bookings")
        .find({ messId, _id: { $ne: id }, status: ACTIVE_STATUSES })
        .toArray()
    ).filter((other) =>
      overlaps(
        bookingCheckIn,
        bookingCheckOut,
        other.checkInDate,
        other.checkOutDate,
      ),
    );

    for (const other of otherBookings) {
      if (!other.roomId) continue;
      const roomKey = other.roomId.toString();
      const set = allocationByRoom.get(roomKey) || new Set();
      for (const date of dates(
        dateOnly(other.checkInDate),
        dateOnly(other.checkOutDate),
      )) {
        set.add(date);
      }
      allocationByRoom.set(roomKey, set);
    }

    const blocks = (
      await db
        .collection("room_blocks")
        .find({ messId, status: "ACTIVE" })
        .toArray()
    ).filter((block) =>
      overlaps(bookingCheckIn, bookingCheckOut, block.from, block.to),
    );

    for (const block of blocks) {
      const roomKey = block.roomId?.toString();
      if (!roomKey) continue;
      const set = allocationByRoom.get(roomKey) || new Set();
      for (const date of dates(dateOnly(block.from), dateOnly(block.to))) {
        set.add(date);
      }
      allocationByRoom.set(roomKey, set);
    }

    const candidates = rooms
      .filter((room) => {
        const busyDays = allocationByRoom.get(room._id.toString()) || new Set();
        return stayDays.every((date) => !busyDays.has(date));
      })
      .sort((a, b) => {
        const capacityDifference =
          Number(a.capacity || 0) - Number(b.capacity || 0);
        if (capacityDifference !== 0) return capacityDifference;
        return String(a.roomNumber).localeCompare(
          String(b.roomNumber),
          undefined,
          { numeric: true },
        );
      });

    if (!candidates.length) {
      return res.status(409).json({
        message:
          "No room is available for the guest's complete stay. Check-in cannot be completed.",
      });
    }

    const chosen = candidates[0];
    const now = new Date();

    await db
      .collection("room_allocations")
      .updateMany(
        { bookingId: id, status: "ACTIVE" },
        { $set: { status: "REPLACED", updatedAt: now } },
      );

    const allocation = {
      bookingId: id,
      messId,
      roomId: chosen._id,
      roomNumber: chosen.roomNumber,
      from: bookingCheckIn,
      to: bookingCheckOut,
      status: "ACTIVE",
      allocatedBy: manager._id,
      allocationMethod: "AUTO_CHECK_IN",
      allocationReason:
        "Best-fit room: smallest suitable capacity available for the complete stay",
      stayCategory: booking.stayCategory,
      nightlyRate: Number(
        CATEGORY_RATES[booking.stayCategory] ??
          chosen.rates?.[booking.stayCategory] ??
          0,
      ),
      childRate: Number(chosen.rates?.CHILD ?? 0),
      createdAt: now,
      updatedAt: now,
    };

    await db.collection("room_allocations").insertOne(allocation);

    const updateResult = await db.collection("bookings").updateOne(
      { _id: id, messId, status: "APPROVED" },
      {
        $set: {
          status: "CHECKED_IN",
          checkInAt: now,
          roomId: chosen._id,
          roomNumber: chosen.roomNumber,
          allocationStatus: "ALLOCATED",
          allocationMethod: "AUTO_CHECK_IN",
          updatedAt: now,
        },
      },
    );

    await broadcastMessEvent(db, {
      messId,
      userId: booking.userId,
      type: "CHECK_IN",
      title: "Guest checked in",
      bookingId: booking._id,
      userMessage: `You have been checked in to Room ${chosen.roomNumber}. Welcome to ${booking.messName || "the mess"}.`,
      staffMessage: `${booking.booker?.name || "Guest"} checked in to Room ${chosen.roomNumber}.`,
      notifyUser: true,
    });

    return res.json({
      message: `Check-in successful. Room ${chosen.roomNumber} has been automatically allotted.`,
      room: {
        roomId: chosen._id,
        roomNumber: chosen.roomNumber,
        capacity: chosen.capacity,
        roomType: chosen.roomType,
      },
      allocationMethod: "AUTO_CHECK_IN",
    });
  } catch (e) {
    console.error("CHECK-IN ERROR:", e);
    return res.status(500).json({ message: "Server error" });
  }
};

/**
 * User requests checkout after check-in.
 */
export const requestCheckout = async (req, res) => {
  try {
    if (!ObjectId.isValid(req.params.bookingId)) {
      return res.status(400).json({ message: "Invalid booking ID" });
    }
    const db = getDB();
    const id = new ObjectId(req.params.bookingId);
    const booking = await db
      .collection("bookings")
      .findOne({ _id: id, userId: new ObjectId(req.user.id) });

    if (!booking) return res.status(404).json({ message: "Booking not found" });
    if (booking.status !== "CHECKED_IN") {
      return res
        .status(400)
        .json({ message: "Checkout can be requested only after check-in" });
    }

    if (booking.checkoutRequestedAt) {
      return res
        .status(400)
        .json({ message: "Checkout request is already pending" });
    }

    const requestedAt = new Date();
    await db.collection("bookings").updateOne(
      { _id: id, userId: new ObjectId(req.user.id), status: "CHECKED_IN" },
      {
        $set: {
          status: "CHECKOUT_REQUESTED",
          checkoutRequestedAt: requestedAt,
          updatedAt: requestedAt,
        },
      },
    );

    await broadcastMessEvent(db, {
      messId: booking.messId,
      userId: booking.userId,
      type: "CHECKOUT_REQUEST",
      title: "Checkout requested",
      bookingId: booking._id,
      userMessage:
        "Your checkout request has been submitted. The Mess Manager will generate your final bill shortly.",
      staffMessage: `${booking.booker?.name || "A guest"} (Room ${booking.roomNumber || "N/A"}) has requested checkout.`,
      notifyUser: true,
    });

    res.json({ message: "Checkout request sent to the Manager" });
  } catch (e) {
    console.error("REQUEST CHECKOUT ERROR:", e);
    res.status(500).json({ message: "Server error" });
  }
};

/**
 * Mess Manager approves checkout and generates final stay bill.
 */
export const checkOut = async (req, res) => {
  try {
    const db = getDB();
    const manager = await db.collection("users").findOne({
      _id: new ObjectId(req.user.id),
      role: "MESS_MANAGER",
    });

    const rawMessId = await resolveUserMessId(db, manager);
    if (!rawMessId)
      return res
        .status(403)
        .json({ message: "Manager is not assigned to a mess" });
    if (!ObjectId.isValid(req.params.bookingId))
      return res.status(400).json({ message: "Invalid booking ID" });

    const id = new ObjectId(req.params.bookingId);
    const booking = await db.collection("bookings").findOne({
      _id: id,
      messId: messIdFilter(rawMessId),
      status: { $in: ["CHECKED_IN", "CHECKOUT_REQUESTED"] },
    });

    if (!booking)
      return res
        .status(400)
        .json({ message: "Booking is not ready for Manager checkout" });

    const today = todayIndia();
    const isRequested = booking.status === "CHECKOUT_REQUESTED";
    const reachedScheduledDate = today >= booking.checkOutDate;
    if (!isRequested && !reachedScheduledDate) {
      return res.status(400).json({
        message: `Checkout is allowed after a user request or on/after the scheduled checkout date (${booking.checkOutDate})`,
      });
    }

    const checkoutDate = today;
    const mealInput = req.body?.meals || req.body || {};
    const bill = await createFinalBill(db, booking, checkoutDate, mealInput);
    const checkoutAt = new Date();

    await db.collection("bookings").updateOne(
      { _id: booking._id },
      {
        $set: {
          status: "CHECKED_OUT",
          checkOutAt: checkoutAt,
          billId: bill._id,
          updatedAt: checkoutAt,
        },
      },
    );

    await db
      .collection("room_allocations")
      .updateMany(
        { bookingId: booking._id, status: "ACTIVE" },
        { $set: { status: "COMPLETED", updatedAt: checkoutAt } },
      );

    await broadcastMessEvent(db, {
      messId: booking.messId,
      userId: booking.userId,
      type: "FINAL_BILL",
      title: "Final bill generated",
      bookingId: booking._id,
      billId: bill._id,
      userMessage: `Your checkout is complete. Final bill amount is ₹${Number(bill.totalAmount || 0).toFixed(2)}. Please complete payment to receive your paid invoice and receipt.`,
      staffMessage: `Checkout completed and final bill of ₹${Number(bill.totalAmount || 0).toFixed(2)} generated for ${booking.booker?.name || "guest"} (Booking ${booking._id}).`,
      notifyUser: true,
    });

    res.json({ message: "Checkout approved and final bill generated", bill });
  } catch (e) {
    console.error("CHECKOUT ERROR:", e);
    res.status(500).json({ message: "Server error" });
  }
};
