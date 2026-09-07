import { ObjectId } from "mongodb";
import { getDB } from "../config/db.js";
import { DEFAULT_ROOM_RATES, DEFAULT_MEAL_RATES } from "../models/Room.js";
import { messIdFilter, resolveUserMessId } from "../utils/messHelper.js";
import {
  addDays,
  day,
  formatDay as fmt,
  stayDates as dates,
  todayIndia,
  markExpiredApprovedBookingsAsNoShow,
  validStayRange,
} from "../utils/stayDates.js";

/**
 * Fetch authenticated user to retrieve their assigned messId.
 */
const getUserMess = async (req) =>
  getDB()
    .collection("users")
    .findOne({ _id: new ObjectId(req.user.id) });

/**
 * Build map of unavailable room-date sets based on active bookings, allocations, and room blocks.
 */
const buildUnavailable = async (db, messId, checkInDate, checkOutDate) => {
  await markExpiredApprovedBookingsAsNoShow(db, messId);

  const mFilter = messIdFilter(messId);

  const rooms = await db
    .collection("rooms")
    .find({ messId: mFilter, status: "ACTIVE" })
    .sort({ roomNumber: 1 })
    .toArray();

  const bookings = await db
    .collection("bookings")
    .find({
      messId: mFilter,
      status: {
        $in: [
          "PENDING_MANAGER",
          "PENDING_SECRETARY",
          "PENDING_PMC",
          "APPROVED",
          "CHECKED_IN",
          "CHECKOUT_REQUESTED",
        ],
      },
      checkInDate: { $lt: checkOutDate },
      checkOutDate: { $gt: checkInDate },
    })
    .toArray();

  const allocations = await db
    .collection("room_allocations")
    .find({
      messId: mFilter,
      status: "ACTIVE",
      from: { $lt: checkOutDate },
      to: { $gt: checkInDate },
    })
    .toArray();

  const blocks = await db
    .collection("room_blocks")
    .find({
      messId: mFilter,
      status: "ACTIVE",
      from: { $lt: checkOutDate },
      to: { $gt: checkInDate },
    })
    .toArray();

  const unavailable = new Map(
    rooms.map((room) => [room._id.toString(), new Set()]),
  );

  // 1. Mark explicitly allocated or blocked rooms
  const unassignedBookings = [];

  for (const booking of bookings) {
    const allocationsForBooking = allocations.filter(
      (a) => a.bookingId?.toString() === booking._id.toString(),
    );

    if (allocationsForBooking.length) {
      for (const allocation of allocationsForBooking) {
        for (const date of dates(allocation.from, allocation.to)) {
          unavailable.get(allocation.roomId.toString())?.add(date);
        }
      }
    } else if (booking.roomId) {
      for (const date of dates(booking.checkInDate, booking.checkOutDate)) {
        unavailable.get(booking.roomId.toString())?.add(date);
      }
    } else {
      // Pending request not yet allotted to a specific room number
      unassignedBookings.push(booking);
    }
  }

  for (const block of blocks) {
    for (const date of dates(block.from, block.to)) {
      unavailable.get(block.roomId.toString())?.add(date);
    }
  }

  // 2. Each unassigned pending booking holds one suitable active room for its stay dates
  // so new users cannot book beyond actual capacity while awaiting manager action
  for (const pending of unassignedBookings) {
    const stayDays = dates(pending.checkInDate, pending.checkOutDate);
    const guestCount = Number(
      pending.numberOfGuests || pending.stayMembers?.length || 1,
    );

    // Find the first available room that can accommodate this pending booking
    const candidate = rooms.find((room) => {
      if (Number(room.capacity || 0) < guestCount) return false;
      const roomBusyDays = unavailable.get(room._id.toString()) || new Set();
      return stayDays.every((day) => !roomBusyDays.has(day));
    });

    if (candidate) {
      // Earmark this room's days so subsequent requests and availability queries see it as held
      const busySet = unavailable.get(candidate._id.toString());
      for (const d of stayDays) {
        busySet.add(d);
      }
    } else {
      // If no single room had the full range free, mark the days across any room with capacity
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

  return { rooms, unavailable };
};

/**
 * Create a new room in the mess (Manager only).
 */
export const createRoom = async (req, res) => {
  try {
    const db = getDB();
    const u = await getUserMess(req);

    if (!u?.messId) {
      return res
        .status(400)
        .json({ message: "Manager is not assigned to any mess" });
    }

    const {
      roomNumber,
      roomType = "STANDARD",
      capacity,
      rates = {},
      mealRates = {},
    } = req.body || {};
    const cap = Number(capacity);

    if (!roomNumber || !Number.isInteger(cap) || cap < 1) {
      return res
        .status(400)
        .json({ message: "roomNumber and valid capacity are required" });
    }

    const cleanRates = { ...DEFAULT_ROOM_RATES };
    for (const key of Object.keys(cleanRates)) {
      const n = Number(rates[key] ?? cleanRates[key]);
      if (!Number.isFinite(n) || n < 0) {
        return res.status(400).json({ message: `Invalid rate for ${key}` });
      }
      cleanRates[key] = n;
    }

    const cleanMealRates = { ...DEFAULT_MEAL_RATES };
    for (const key of Object.keys(cleanMealRates)) {
      const n = Number(mealRates[key] ?? cleanMealRates[key]);
      if (!Number.isFinite(n) || n < 0) {
        return res.status(400).json({ message: `Invalid meal rate for ${key}` });
      }
      cleanMealRates[key] = n;
    }

    const messId = new ObjectId(u.messId);
    if (
      await db
        .collection("rooms")
        .findOne({ messId, roomNumber: String(roomNumber).trim() })
    ) {
      return res
        .status(409)
        .json({ message: "Room number already exists in this mess" });
    }

    const room = {
      messId,
      roomNumber: String(roomNumber).trim(),
      roomType: String(roomType).trim().toUpperCase(),
      capacity: cap,
      rates: cleanRates,
      mealRates: cleanMealRates,
      status: "ACTIVE",
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const r = await db.collection("rooms").insertOne(room);
    return res.status(201).json({
      message: "Room created successfully",
      room: { ...room, _id: r.insertedId },
    });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ message: "Server error" });
  }
};

/**
 * Retrieve all rooms for the manager's mess.
 */
export const getRooms = async (req, res) => {
  try {
    const db = getDB();
    const u = await getUserMess(req);

    const rawMessId = await resolveUserMessId(db, u);
    if (!rawMessId) {
      return res
        .status(400)
        .json({ message: "Manager is not assigned to any mess" });
    }

    const rooms = await db
      .collection("rooms")
      .find({ messId: messIdFilter(rawMessId) })
      .sort({ roomNumber: 1 })
      .toArray();

    return res.json({
      rooms: rooms.map((room) => ({
        ...room,
        rates: { ...DEFAULT_ROOM_RATES, ...(room.rates || {}) },
        mealRates: { ...DEFAULT_MEAL_RATES, ...(room.mealRates || {}) },
      })),
    });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ message: "Server error" });
  }
};

/**
 * Update room details (roomNumber, type, capacity, rates, mealRates, status).
 */
export const updateRoom = async (req, res) => {
  try {
    const db = getDB();
    const u = await getUserMess(req);

    const rawMessId = await resolveUserMessId(db, u);
    if (!rawMessId || !ObjectId.isValid(req.params.roomId)) {
      return res.status(400).json({ message: "Invalid room" });
    }

    const id = new ObjectId(req.params.roomId);
    const room = await db
      .collection("rooms")
      .findOne({ _id: id, messId: messIdFilter(rawMessId) });

    if (!room) {
      return res.status(404).json({ message: "Room not found" });
    }

    const x = req.body || {};
    const set = { updatedAt: new Date() };

    if (x.roomNumber !== undefined) {
      set.roomNumber = String(x.roomNumber).trim();
    }
    if (x.roomType !== undefined) {
      set.roomType = String(x.roomType).trim().toUpperCase();
    }
    if (x.capacity !== undefined) {
      const n = Number(x.capacity);
      if (!Number.isInteger(n) || n < 1) {
        return res.status(400).json({ message: "Invalid capacity" });
      }
      set.capacity = n;
    }
    if (x.rates !== undefined) {
      const rates = { ...DEFAULT_ROOM_RATES, ...(room.rates || {}) };
      for (const key of Object.keys(DEFAULT_ROOM_RATES)) {
        if (x.rates[key] !== undefined) {
          const n = Number(x.rates[key]);
          if (!Number.isFinite(n) || n < 0) {
            return res.status(400).json({ message: `Invalid rate for ${key}` });
          }
          rates[key] = n;
        }
      }
      set.rates = rates;
    }
    if (x.mealRates !== undefined) {
      const mealRates = { ...DEFAULT_MEAL_RATES, ...(room.mealRates || {}) };
      for (const key of Object.keys(DEFAULT_MEAL_RATES)) {
        if (x.mealRates[key] !== undefined) {
          const n = Number(x.mealRates[key]);
          if (!Number.isFinite(n) || n < 0) {
            return res.status(400).json({ message: `Invalid meal rate for ${key}` });
          }
          mealRates[key] = n;
        }
      }
      set.mealRates = mealRates;
    }
    if (x.status !== undefined) {
      set.status = x.status;
    }

    await db.collection("rooms").updateOne({ _id: id }, { $set: set });

    return res.json({
      message: "Room updated successfully",
      room: await db.collection("rooms").findOne({ _id: id }),
    });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ message: "Server error" });
  }
};

/**
 * Check full and partial availability of rooms for given mess and stay dates.
 */
export const getAvailableRooms = async (req, res) => {
  try {
    const { messId, checkInDate, checkOutDate } = req.query;

    if (
      !ObjectId.isValid(messId) ||
      !validStayRange(checkInDate, checkOutDate)
    ) {
      return res
        .status(400)
        .json({ message: "messId, checkInDate and checkOutDate are required" });
    }

    const db = getDB();
    const m = new ObjectId(messId);
    const { rooms, unavailable } = await buildUnavailable(
      db,
      m,
      checkInDate,
      checkOutDate,
    );
    const ds = dates(checkInDate, checkOutDate);

    const result = rooms.map((room) => ({
      ...room,
      availableForEntireStay: ds.every(
        (date) => !unavailable.get(room._id.toString()).has(date),
      ),
      availableDays: ds.filter(
        (date) => !unavailable.get(room._id.toString()).has(date),
      ),
      blockedDays: ds.filter((date) =>
        unavailable.get(room._id.toString()).has(date),
      ),
    }));

    const fully = result.some((room) => room.availableForEntireStay);
    const partialRanges = [];

    for (const room of result) {
      const availableDays = unavailable.get(room._id.toString())
        ? ds.filter((date) => !unavailable.get(room._id.toString()).has(date))
        : [];

      let current = [];
      for (const date of availableDays) {
        if (!current.length) {
          current = [date];
          continue;
        }

        const expectedNext = addDays(current.at(-1), 1);
        if (date === expectedNext) {
          current.push(date);
        } else {
          partialRanges.push({
            roomId: room._id,
            roomNumber: room.roomNumber,
            checkInDate: current[0],
            checkOutDate: addDays(current.at(-1), 1),
            nights: current.length,
          });
          current = [date];
        }
      }

      if (current.length) {
        partialRanges.push({
          roomId: room._id,
          roomNumber: room.roomNumber,
          checkInDate: current[0],
          checkOutDate: addDays(current.at(-1), 1),
          nights: current.length,
        });
      }
    }

    partialRanges.sort(
      (a, b) =>
        b.nights - a.nights ||
        String(a.roomNumber).localeCompare(String(b.roomNumber), undefined, {
          numeric: true,
        }),
    );

    const longest = partialRanges[0] || null;

    return res.json({
      messId,
      checkInDate,
      checkOutDate,
      nights: ds.length,
      fullyAvailable: fully,
      partialAvailability: longest,
      partialAvailabilities: partialRanges,
      rooms: result.map((room, index) => ({
        roomId: room._id,
        availabilityLabel: room.availableForEntireStay
          ? "AVAILABLE"
          : "NOT AVAILABLE",
        capacity: room.capacity,
        availableForEntireStay: room.availableForEntireStay,
        availableDays: room.availableDays,
        blockedDays: room.blockedDays,
        index: index + 1,
      })),
    });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ message: "Server error" });
  }
};

/**
 * Generate monthly occupancy grid (days vs rooms) for mess calendar view.
 */
export const getOccupancy = async (req, res) => {
  try {
    const db = getDB();
    const u = await getUserMess(req);

    let messId = u?.messId;
    if (req.user.role === "ADMIN" && req.query.messId) {
      messId = req.query.messId;
    } else {
      messId = await resolveUserMessId(db, u);
    }

    if (!messId) {
      return res.status(400).json({ message: "No mess assigned" });
    }

    const month = /^\d{4}-\d{2}$/.test(req.query.month || "")
      ? req.query.month
      : todayIndia().slice(0, 7);

    const start = `${month}-01`;
    const startDate = day(start);
    const end = fmt(
      new Date(
        Date.UTC(startDate.getUTCFullYear(), startDate.getUTCMonth() + 1, 1),
      ),
    );
    const mFilter = messIdFilter(messId);

    await markExpiredApprovedBookingsAsNoShow(db, messId);

    const rooms = await db
      .collection("rooms")
      .find({ messId: mFilter, status: "ACTIVE" })
      .sort({ roomNumber: 1 })
      .toArray();

    const bookings = await db
      .collection("bookings")
      .find({
        messId: mFilter,
        status: { $in: ["APPROVED", "CHECKED_IN", "CHECKOUT_REQUESTED"] },
        checkInDate: { $lt: end },
        checkOutDate: { $gt: start },
      })
      .toArray();

    const userIds = bookings
      .map((b) => b.userId)
      .filter((id) => id && ObjectId.isValid(String(id)))
      .map((id) => new ObjectId(String(id)));

    const uniqueUserIds = [
      ...new Map(userIds.map((id) => [id.toString(), id])).values(),
    ];
    const users = uniqueUserIds.length
      ? await db
          .collection("users")
          .find({ _id: { $in: uniqueUserIds } })
          .toArray()
      : [];
    const userMap = new Map(users.map((user) => [user._id.toString(), user]));

    const allocations = await db
      .collection("room_allocations")
      .find({
        messId: mFilter,
        status: "ACTIVE",
        from: { $lt: end },
        to: { $gt: start },
      })
      .toArray();

    const blocks = await db
      .collection("room_blocks")
      .find({
        messId: mFilter,
        status: "ACTIVE",
        from: { $lt: end },
        to: { $gt: start },
      })
      .toArray();

    const ds = dates(start, end);
    const cells = [];

    for (const room of rooms) {
      for (const date of ds) {
        let cell = {
          roomId: room._id,
          roomNumber: room.roomNumber,
          date,
          status: "AVAILABLE",
          bookingId: null,
          guestName: null,
          guestRank: null,
        };

        const allocation = allocations.find(
          (item) =>
            item.roomId?.toString() === room._id.toString() &&
            item.from <= date &&
            item.to > date,
        );

        let booking = null;
        if (allocation?.bookingId) {
          booking = bookings.find(
            (item) => item._id.toString() === allocation.bookingId.toString(),
          );
        }

        if (!booking) {
          booking = bookings.find(
            (item) =>
              item.roomId?.toString() === room._id.toString() &&
              item.checkInDate <= date &&
              item.checkOutDate > date,
          );
        }

        const block = blocks.find(
          (item) =>
            item.roomId?.toString() === room._id.toString() &&
            item.from <= date &&
            item.to > date,
        );

        if (block) {
          cell.status = block.type || "BLOCKED";
        } else if (booking) {
          cell.status =
            booking.status === "APPROVED" ? "RESERVED" : "CHECKED_IN";
          cell.bookingId = booking._id;

          let user = booking.booker;
          if (!user && booking.userId) {
            user = userMap.get(booking.userId.toString());
          }

          cell.guestName = user?.name || booking.officerName || "Officer";
          cell.guestRank = user?.rank || "";
        }

        cells.push(cell);
      }
    }

    return res.json({ messId, month, days: ds, rooms, cells });
  } catch (error) {
    console.error("GET OCCUPANCY ERROR:", error);
    return res.status(500).json({ message: "Server error" });
  }
};
