import { ObjectId } from "mongodb";
import { getDB } from "../config/db.js";
import { stayDates as dates } from "../utils/stayDates.js";

const CATEGORY_RATES = {
  TD_OFFICER: 2800,
  OFFICER_LEAVE: 1000,
  OFFICER_GUEST: 1000,
  DEPENDANT_GUEST: 1000,
};

/**
 * Automatically find and assign best available room for an approved booking.
 *
 * @param {import('mongodb').Db} db
 * @param {Object} booking
 * @param {Object} manager
 * @returns {Promise<{roomId: ObjectId, roomNumber: string, allocationId: ObjectId}>}
 */
export const allocateApprovedBooking = async (db, booking, manager) => {
  if (!booking?.messId) {
    const error = new Error("Booking is not assigned to a mess");
    error.statusCode = 400;
    throw error;
  }

  if (!booking.checkInDate || !booking.checkOutDate) {
    const error = new Error("Booking dates are missing");
    error.statusCode = 400;
    throw error;
  }

  const messId = new ObjectId(booking.messId);
  const guestCount = Number(
    booking.numberOfGuests || booking.stayMembers?.length || 1,
  );

  // Smallest suitable room capacity first, lowest roomNumber as deterministic tie-breaker
  const rooms = await db
    .collection("rooms")
    .find({ messId, status: "ACTIVE", capacity: { $gte: guestCount } })
    .sort({ capacity: 1, roomNumber: 1 })
    .toArray();

  if (!rooms.length) {
    const error = new Error(
      "No suitable active room is available for this booking",
    );
    error.statusCode = 409;
    throw error;
  }

  const existing = await db
    .collection("room_allocations")
    .find({
      messId,
      status: "ACTIVE",
      from: { $lt: booking.checkOutDate },
      to: { $gt: booking.checkInDate },
    })
    .toArray();

  const busy = new Set();
  for (const allocation of existing) {
    for (const date of dates(allocation.from, allocation.to)) {
      busy.add(`${String(allocation.roomId)}:${date}`);
    }
  }

  const requestedDates = dates(booking.checkInDate, booking.checkOutDate);
  const chosen = rooms.find((room) =>
    requestedDates.every((date) => !busy.has(`${String(room._id)}:${date}`)),
  );

  if (!chosen) {
    const error = new Error(
      "No complete room allocation is available for the requested stay",
    );
    error.statusCode = 409;
    throw error;
  }

  // Deactivate any superseded active allocations for this booking
  await db
    .collection("room_allocations")
    .updateMany(
      { bookingId: booking._id, status: "ACTIVE" },
      { $set: { status: "REPLACED", updatedAt: new Date() } },
    );

  const nightlyRate = Number(
    CATEGORY_RATES[booking.stayCategory] ??
      chosen.rates?.[booking.stayCategory] ??
      0,
  );
  const childRate = Number(chosen.rates?.CHILD ?? 0);

  const allocation = {
    bookingId: booking._id,
    messId,
    roomId: chosen._id,
    roomNumber: chosen.roomNumber,
    from: booking.checkInDate,
    to: booking.checkOutDate,
    status: "ACTIVE",
    allocatedBy: manager?._id || manager,
    allocationMethod: "AUTO_APPROVAL",
    stayCategory: booking.stayCategory,
    nightlyRate,
    childRate,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const result = await db.collection("room_allocations").insertOne(allocation);

  return {
    roomId: chosen._id,
    roomNumber: chosen.roomNumber,
    allocationId: result.insertedId,
  };
};

/**
 * Manual/direct allocation endpoint (Mess Manager only).
 */
export const allocateBooking = async (req, res) => {
  try {
    const db = getDB();
    if (!req.user?.id || !ObjectId.isValid(req.user.id)) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const manager = await db
      .collection("users")
      .findOne({ _id: new ObjectId(req.user.id), role: "MESS_MANAGER" });

    if (!manager) {
      return res.status(404).json({ message: "Manager not found" });
    }

    const { bookingId } = req.params;
    if (!ObjectId.isValid(bookingId)) {
      return res.status(400).json({ message: "Invalid booking ID" });
    }

    const booking = await db
      .collection("bookings")
      .findOne({ _id: new ObjectId(bookingId) });
    if (!booking) {
      return res.status(404).json({ message: "Booking not found" });
    }

    if (String(booking.messId) !== String(manager.messId)) {
      return res
        .status(403)
        .json({ message: "Booking does not belong to your mess" });
    }

    const allocation = await allocateApprovedBooking(db, booking, manager);

    await db.collection("bookings").updateOne(
      { _id: booking._id },
      {
        $set: {
          roomId: allocation.roomId,
          roomNumber: allocation.roomNumber,
          allocationStatus: "ALLOCATED",
          allocationMethod: "AUTO_APPROVAL",
          updatedAt: new Date(),
        },
      },
    );

    return res.status(200).json({
      message: `Room ${allocation.roomNumber} allocated successfully`,
      allocation,
    });
  } catch (error) {
    console.error("ALLOCATE BOOKING ERROR:", error);
    return res.status(error.statusCode || 500).json({
      message: error.message || "Server error",
    });
  }
};

/**
 * Retrieve active room allocation for a given booking.
 */
export const getBookingAllocation = async (req, res) => {
  try {
    const db = getDB();
    const { bookingId } = req.params;

    if (!ObjectId.isValid(bookingId)) {
      return res.status(400).json({ message: "Invalid booking ID" });
    }

    const allocation = await db
      .collection("room_allocations")
      .findOne(
        { bookingId: new ObjectId(bookingId), status: "ACTIVE" },
        { sort: { createdAt: -1 } },
      );

    if (!allocation) {
      return res
        .status(404)
        .json({ message: "No active room allocation found" });
    }

    return res.status(200).json({ allocation });
  } catch (error) {
    console.error("GET BOOKING ALLOCATION ERROR:", error);
    return res.status(500).json({ message: error.message || "Server error" });
  }
};
