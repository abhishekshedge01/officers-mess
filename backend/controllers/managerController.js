import bcrypt from "bcryptjs";
import { ObjectId } from "mongodb";
import { getDB } from "../config/db.js";
import { withFinalStay } from "../utils/finalStay.js";
import { allocateApprovedBooking } from "./allocationController.js";
import { markExpiredApprovedBookingsAsNoShow } from "../utils/stayDates.js";
import { broadcastMessEvent } from "../utils/notificationHelper.js";
import { idFilter, messIdFilter, resolveUserMessId } from "../utils/messHelper.js";

/**
 * Retrieve authenticated MESS_MANAGER user document.
 */
const getManager = async (req) => {
  const db = getDB();
  if (!req.user?.id) return null;
  const user = await db.collection("users").findOne({
    _id: idFilter(req.user.id),
    role: "MESS_MANAGER",
  });
  if (user) {
    await resolveUserMessId(db, user);
  }
  return user;
};

/**
 * Get manager's own profile without password hash.
 */
export const getMyProfile = async (req, res) => {
  try {
    const manager = await getManager(req);
    if (!manager) {
      return res.status(404).json({ message: "Manager not found" });
    }

    return res.status(200).json({
      id: manager._id,
      name: manager.name,
      email: manager.email,
      phone: manager.phone || manager.mobile || "",
      mobile: manager.mobile || manager.phone || "",
      designation: manager.designation || "",
      serviceId: manager.serviceId || "",
      rank: manager.rank || "",
      role: manager.role,
      address: manager.address || "",
      city: manager.city || "",
      state: manager.state || "",
      pincode: manager.pincode || "",
      messId: manager.messId,
    });
  } catch (error) {
    console.error("GET MANAGER PROFILE ERROR:", error);
    return res.status(500).json({ message: "Server error" });
  }
};

/**
 * Update manager profile details.
 */
export const updateMyProfile = async (req, res) => {
  try {
    const manager = await getManager(req);
    if (!manager) {
      return res.status(404).json({ message: "Manager not found" });
    }

    const {
      name,
      phone,
      designation,
      serviceId,
      rank,
      address,
      city,
      state,
      pincode,
    } = req.body;
    const updateData = { updatedAt: new Date() };

    if (name !== undefined) updateData.name = String(name).trim();
    if (phone !== undefined) updateData.phone = String(phone).trim();
    if (designation !== undefined)
      updateData.designation = String(designation).trim();
    if (serviceId !== undefined)
      updateData.serviceId = String(serviceId).trim();
    if (rank !== undefined) updateData.rank = String(rank).trim();
    if (address !== undefined) updateData.address = String(address).trim();
    if (city !== undefined) updateData.city = String(city).trim();
    if (state !== undefined) updateData.state = String(state).trim();
    if (pincode !== undefined) updateData.pincode = String(pincode).trim();

    await getDB()
      .collection("users")
      .updateOne({ _id: manager._id }, { $set: updateData });

    return res
      .status(200)
      .json({ message: "Manager profile updated successfully" });
  } catch (error) {
    console.error("UPDATE MANAGER PROFILE ERROR:", error);
    return res.status(500).json({ message: "Server error" });
  }
};

/**
 * Change manager's account password.
 */
export const changePassword = async (req, res) => {
  try {
    const manager = await getManager(req);
    if (!manager) {
      return res.status(404).json({ message: "Manager not found" });
    }

    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      return res
        .status(400)
        .json({ message: "Current password and new password are required" });
    }

    if (String(newPassword).length < 8) {
      return res
        .status(400)
        .json({ message: "New password must be at least 8 characters" });
    }

    const passwordMatch = await bcrypt.compare(
      currentPassword,
      manager.password,
    );
    if (!passwordMatch) {
      return res.status(401).json({ message: "Current password is incorrect" });
    }

    const samePassword = await bcrypt.compare(newPassword, manager.password);
    if (samePassword) {
      return res
        .status(400)
        .json({ message: "New password must be different" });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await getDB()
      .collection("users")
      .updateOne(
        { _id: manager._id },
        { $set: { password: hashedPassword, updatedAt: new Date() } },
      );

    return res.status(200).json({ message: "Password updated successfully" });
  } catch (error) {
    console.error("CHANGE MANAGER PASSWORD ERROR:", error);
    return res.status(500).json({ message: "Server error" });
  }
};

/**
 * Get details of the mess assigned to the logged-in manager.
 */
export const getMyMess = async (req, res) => {
  try {
    const manager = await getManager(req);
    if (!manager) {
      return res.status(404).json({ message: "Manager not found" });
    }
    if (!manager.messId) {
      return res
        .status(400)
        .json({ message: "Manager is not assigned to any mess" });
    }

    const db = getDB();
    const mess = await db
      .collection("messes")
      .findOne({ _id: idFilter(manager.messId) });
    if (!mess) {
      return res.status(404).json({ message: "Assigned mess not found" });
    }

    return res.status(200).json({ mess });
  } catch (error) {
    console.error("GET MANAGER MESS ERROR:", error);
    return res.status(500).json({ message: "Server error" });
  }
};

/**
 * Retrieve all bookings for the manager's mess with optional status filter.
 */
export const getManagerBookings = async (req, res) => {
  try {
    const manager = await getManager(req);
    if (!manager) {
      return res.status(404).json({ message: "Manager not found" });
    }
    if (!manager.messId) {
      return res
        .status(400)
        .json({ message: "Manager is not assigned to any mess" });
    }

    const db = getDB();
    await markExpiredApprovedBookingsAsNoShow(db, manager.messId);

    const filter = { messId: messIdFilter(manager.messId) };
    if (req.query.status) {
      filter.status = req.query.status;
    }

    const bookings = await db
      .collection("bookings")
      .find(filter)
      .sort({ createdAt: -1 })
      .toArray();

    const monitoredBookings = await withFinalStay(db, bookings);
    return res.status(200).json({ bookings: monitoredBookings });
  } catch (error) {
    console.error("GET MANAGER BOOKINGS ERROR:", error);
    return res.status(500).json({ message: "Server error" });
  }
};

/**
 * Approve a pending booking and immediately allocate best available room.
 */
export const approveBooking = async (req, res) => {
  try {
    const manager = await getManager(req);
    if (!manager) return res.status(404).json({ message: "Manager not found" });
    if (!manager.messId)
      return res
        .status(400)
        .json({ message: "Manager is not assigned to any mess" });

    const { bookingId } = req.params;
    if (!ObjectId.isValid(bookingId)) {
      return res.status(400).json({ message: "Invalid booking ID" });
    }

    const db = getDB();
    const booking = await db.collection("bookings").findOne({
      _id: new ObjectId(bookingId),
      messId: messIdFilter(manager.messId),
      status: "PENDING_MANAGER",
    });

    if (!booking) {
      return res.status(404).json({ message: "Pending booking not found" });
    }

    // Allocate best room
    const allocation = await allocateApprovedBooking(db, booking, manager);

    // Mark approved and record room assignment
    await db.collection("bookings").updateOne(
      { _id: booking._id },
      {
        $set: {
          status: "APPROVED",
          roomId: allocation.roomId,
          roomNumber: allocation.roomNumber,
          allocationStatus: "ALLOCATED",
          allocationMethod: "AUTO_APPROVAL",
          "approval.manager.status": "APPROVED",
          "approval.manager.approvedBy": manager._id,
          "approval.manager.approvedAt": new Date(),
          updatedAt: new Date(),
        },
      },
    );

    // Broadcast notification to User, Manager, Secretary, PMC
    await broadcastMessEvent(db, {
      messId: booking.messId,
      userId: booking.userId,
      type: "BOOKING_APPROVED",
      title: "Booking approved",
      bookingId: booking._id,
      userMessage: `Your booking has been approved. Room ${allocation.roomNumber} allocated.`,
      staffMessage: `Booking approved for ${booking.booker?.name || "Guest"}. Room ${allocation.roomNumber} allocated.`,
      notifyUser: true,
    });

    return res.status(200).json({
      message: "Booking approved and room allocated successfully",
      allocation,
    });
  } catch (error) {
    console.error("MANAGER APPROVE BOOKING ERROR:", error);
    return res.status(500).json({ message: error.message || "Server error" });
  }
};

/**
 * Reject a pending booking.
 */
export const rejectBooking = async (req, res) => {
  try {
    const manager = await getManager(req);
    if (!manager) return res.status(404).json({ message: "Manager not found" });
    if (!manager.messId)
      return res
        .status(400)
        .json({ message: "Manager is not assigned to any mess" });

    const { bookingId } = req.params;
    if (!ObjectId.isValid(bookingId)) {
      return res.status(400).json({ message: "Invalid booking ID" });
    }

    const db = getDB();
    const booking = await db.collection("bookings").findOne({
      _id: new ObjectId(bookingId),
      messId: messIdFilter(manager.messId),
      status: "PENDING_MANAGER",
    });

    if (!booking) {
      return res.status(404).json({ message: "Pending booking not found" });
    }

    const reason = (req.body?.reason || req.body?.rejectionReason || "").trim();

    const now = new Date();
    await db.collection("bookings").updateOne(
      { _id: booking._id },
      {
        $set: {
          status: "REJECTED",
          rejectionReason: reason || null,
          rejectedAt: now,
          "approval.manager.status": "REJECTED",
          "approval.manager.approvedBy": manager._id,
          "approval.manager.approvedAt": now,
          updatedAt: now,
        },
      },
    );

    const reasonNote = reason ? ` Reason: ${reason}` : "";
    await broadcastMessEvent(db, {
      messId: booking.messId,
      userId: booking.userId,
      type: "BOOKING_REJECTED",
      title: "Booking rejected",
      bookingId: booking._id,
      userMessage: `Your booking request from ${booking.checkInDate} to ${booking.checkOutDate} was rejected by the Mess Manager.${reasonNote}`,
      staffMessage: `Booking request for ${booking.booker?.name || "Guest"} (${booking.checkInDate} to ${booking.checkOutDate}) was rejected by the Manager.${reasonNote}`,
      notifyUser: true,
    });

    return res.status(200).json({
      message: "Booking rejected by Manager",
      status: "REJECTED",
      rejectionReason: reason || null,
    });
  } catch (error) {
    console.error("MANAGER REJECT BOOKING ERROR:", error);
    return res.status(500).json({ message: "Server error" });
  }
};

/**
 * Get single booking by ID for manager's mess.
 */
export const getBookingById = async (req, res) => {
  try {
    const manager = await getManager(req);
    if (!manager) return res.status(404).json({ message: "Manager not found" });
    if (!manager.messId)
      return res
        .status(400)
        .json({ message: "Manager is not assigned to any mess" });

    const { bookingId } = req.params;
    if (!ObjectId.isValid(bookingId)) {
      return res.status(400).json({ message: "Invalid booking ID" });
    }

    const db = getDB();
    const booking = await db.collection("bookings").findOne({
      _id: new ObjectId(bookingId),
      messId: messIdFilter(manager.messId),
    });

    if (!booking) {
      return res.status(404).json({ message: "Booking not found" });
    }

    const result = await withFinalStay(db, [booking]);
    return res.status(200).json({ booking: result[0] });
  } catch (error) {
    console.error("GET MANAGER BOOKING BY ID ERROR:", error);
    return res.status(500).json({ message: "Server error" });
  }
};

/**
 * Check in an approved booking and mark room allocation as checked in.
 */
export const checkInBooking = async (req, res) => {
  try {
    const manager = await getManager(req);
    if (!manager) return res.status(404).json({ message: "Manager not found" });
    if (!manager.messId)
      return res
        .status(400)
        .json({ message: "Manager is not assigned to any mess" });

    const { bookingId } = req.params;
    if (!ObjectId.isValid(bookingId)) {
      return res.status(400).json({ message: "Invalid booking ID" });
    }

    const db = getDB();
    const booking = await db.collection("bookings").findOne({
      _id: new ObjectId(bookingId),
      messId: messIdFilter(manager.messId),
      status: "APPROVED",
    });

    if (!booking) {
      return res.status(404).json({ message: "Approved booking not found" });
    }

    const now = new Date();
    await db
      .collection("bookings")
      .updateOne(
        { _id: booking._id },
        { $set: { status: "CHECKED_IN", checkedInAt: now, updatedAt: now } },
      );

    await db
      .collection("room_allocations")
      .updateMany(
        { bookingId: booking._id, status: "ACTIVE" },
        { $set: { checkedInAt: now, updatedAt: now } },
      );

    await broadcastMessEvent(db, {
      messId: booking.messId,
      userId: booking.userId,
      type: "CHECK_IN",
      title: "Guest checked in",
      bookingId: booking._id,
      userMessage: `You have been checked in to Room ${booking.roomNumber || "allocated room"}.`,
      staffMessage: `${booking.booker?.name || "Guest"} checked in to Room ${booking.roomNumber || "allocated room"}.`,
      notifyUser: true,
    });

    return res.status(200).json({ message: "Guest checked in successfully" });
  } catch (error) {
    console.error("MANAGER CHECK IN ERROR:", error);
    return res.status(500).json({ message: "Server error" });
  }
};

/**
 * Request checkout on a checked-in booking.
 */
export const requestCheckout = async (req, res) => {
  try {
    const manager = await getManager(req);
    if (!manager) return res.status(404).json({ message: "Manager not found" });

    const { bookingId } = req.params;
    if (!ObjectId.isValid(bookingId)) {
      return res.status(400).json({ message: "Invalid booking ID" });
    }

    const db = getDB();
    const booking = await db.collection("bookings").findOne({
      _id: new ObjectId(bookingId),
      messId: messIdFilter(manager.messId),
      status: "CHECKED_IN",
    });

    if (!booking) {
      return res.status(404).json({ message: "Checked-in booking not found" });
    }

    const now = new Date();
    await db.collection("bookings").updateOne(
      { _id: booking._id },
      {
        $set: {
          status: "CHECKOUT_REQUESTED",
          checkoutRequestedAt: now,
          updatedAt: now,
        },
      },
    );

    await broadcastMessEvent(db, {
      messId: booking.messId,
      userId: booking.userId,
      type: "CHECKOUT_REQUEST",
      title: "Checkout requested",
      bookingId: booking._id,
      userMessage: "Checkout request has been initiated by the Manager.",
      staffMessage: `Checkout requested for ${booking.booker?.name || "Guest"} (Room ${booking.roomNumber || "N/A"}).`,
      notifyUser: true,
    });

    return res
      .status(200)
      .json({ message: "Checkout request created successfully" });
  } catch (error) {
    console.error("MANAGER CHECKOUT REQUEST ERROR:", error);
    return res.status(500).json({ message: "Server error" });
  }
};

/**
 * Complete checkout on a booking and complete active room allocation.
 */
export const checkoutBooking = async (req, res) => {
  try {
    const manager = await getManager(req);
    if (!manager) return res.status(404).json({ message: "Manager not found" });

    const { bookingId } = req.params;
    if (!ObjectId.isValid(bookingId)) {
      return res.status(400).json({ message: "Invalid booking ID" });
    }

    const db = getDB();
    const booking = await db.collection("bookings").findOne({
      _id: new ObjectId(bookingId),
      messId: messIdFilter(manager.messId),
      $or: [{ status: "CHECKED_IN" }, { status: "CHECKOUT_REQUESTED" }],
    });

    if (!booking) {
      return res.status(404).json({ message: "Active booking not found" });
    }

    const now = new Date();
    await db
      .collection("bookings")
      .updateOne(
        { _id: booking._id },
        { $set: { status: "CHECKED_OUT", checkedOutAt: now, updatedAt: now } },
      );

    await db
      .collection("room_allocations")
      .updateMany(
        { bookingId: booking._id, status: "ACTIVE" },
        { $set: { status: "COMPLETED", completedAt: now, updatedAt: now } },
      );

    await broadcastMessEvent(db, {
      messId: booking.messId,
      userId: booking.userId,
      type: "CHECKED_OUT",
      title: "Checkout completed",
      bookingId: booking._id,
      userMessage: "Your checkout is complete. Thank you for staying with us.",
      staffMessage: `Checkout completed for ${booking.booker?.name || "Guest"} (Room ${booking.roomNumber || "N/A"}).`,
      notifyUser: true,
    });

    return res.status(200).json({ message: "Checkout completed successfully" });
  } catch (error) {
    console.error("MANAGER CHECKOUT ERROR:", error);
    return res.status(500).json({ message: "Server error" });
  }
};

/**
 * Aggregate dashboard counts for manager's mess.
 */
export const getManagerDashboard = async (req, res) => {
  try {
    const manager = await getManager(req);
    if (!manager) return res.status(404).json({ message: "Manager not found" });

    const db = getDB();
    const messId = messIdFilter(manager.messId);

    const [
      pending,
      approved,
      checkedIn,
      checkoutRequested,
      checkedOut,
      rejected,
    ] = await Promise.all([
      db
        .collection("bookings")
        .countDocuments({ messId, status: "PENDING_MANAGER" }),
      db.collection("bookings").countDocuments({ messId, status: "APPROVED" }),
      db
        .collection("bookings")
        .countDocuments({ messId, status: "CHECKED_IN" }),
      db
        .collection("bookings")
        .countDocuments({ messId, status: "CHECKOUT_REQUESTED" }),
      db
        .collection("bookings")
        .countDocuments({ messId, status: "CHECKED_OUT" }),
      db.collection("bookings").countDocuments({ messId, status: "REJECTED" }),
    ]);

    return res.status(200).json({
      pending,
      pendingApproval: pending,
      approved,
      checkedIn,
      checkoutRequested,
      waitingCheckout: checkoutRequested,
      checkedOut,
      rejected,
    });
  } catch (error) {
    console.error("GET MANAGER DASHBOARD ERROR:", error);
    return res.status(500).json({ message: "Server error" });
  }
};

/**
 * Retrieve mess secretary staff members for manager's mess.
 */
export const getManagerStaff = async (req, res) => {
  try {
    const manager = await getManager(req);
    if (!manager) return res.status(404).json({ message: "Manager not found" });

    const db = getDB();
    const staff = await db
      .collection("users")
      .find(
        {
          messId: messIdFilter(manager.messId),
          role: { $in: ["MESS_SECRETARY"] },
        },
        { projection: { password: 0 } },
      )
      .toArray();

    return res.status(200).json({ staff });
  } catch (error) {
    console.error("GET MANAGER STAFF ERROR:", error);
    return res.status(500).json({ message: "Server error" });
  }
};

/**
 * Get list of currently active bookings (APPROVED, CHECKED_IN, CHECKOUT_REQUESTED).
 */
export const getActiveBookings = async (req, res) => {
  try {
    const manager = await getManager(req);
    if (!manager) return res.status(404).json({ message: "Manager not found" });

    const db = getDB();
    await markExpiredApprovedBookingsAsNoShow(db, manager.messId);

    const bookings = await db
      .collection("bookings")
      .find({
        messId: messIdFilter(manager.messId),
        status: { $in: ["APPROVED", "CHECKED_IN", "CHECKOUT_REQUESTED"] },
      })
      .sort({ checkInDate: 1 })
      .toArray();

    const result = await withFinalStay(db, bookings);
    return res.status(200).json({ bookings: result });
  } catch (error) {
    console.error("GET ACTIVE BOOKINGS ERROR:", error);
    return res.status(500).json({ message: "Server error" });
  }
};

/**
 * Aggregated status counts for all bookings in manager's mess.
 */
export const getBookingCounts = async (req, res) => {
  try {
    const manager = await getManager(req);
    if (!manager) return res.status(404).json({ message: "Manager not found" });

    const db = getDB();
    await markExpiredApprovedBookingsAsNoShow(db, manager.messId);

    const messId = messIdFilter(manager.messId);
    const counts = await db
      .collection("bookings")
      .aggregate([
        { $match: { messId } },
        { $group: { _id: "$status", count: { $sum: 1 } } },
      ])
      .toArray();

    const output = {};
    for (const item of counts) {
      output[item._id] = item.count;
    }

    return res.status(200).json({ counts: output });
  } catch (error) {
    console.error("GET BOOKING COUNTS ERROR:", error);
    return res.status(500).json({ message: "Server error" });
  }
};
