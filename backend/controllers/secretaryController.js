import bcrypt from "bcryptjs";
import { ObjectId } from "mongodb";
import { getDB } from "../config/db.js";
import { broadcastMessEvent } from "../utils/notificationHelper.js";
import { withFinalStay } from "../utils/finalStay.js";
import { markExpiredApprovedBookingsAsNoShow } from "../utils/stayDates.js";

/**
 * Helper to retrieve authenticated MESS_SECRETARY user.
 */
const getSecretary = async (req) => {
  const db = getDB();
  return await db.collection("users").findOne({
    _id: new ObjectId(req.user.id),
    role: "MESS_SECRETARY",
  });
};

/**
 * Get details of the mess assigned to the logged-in Secretary.
 */
export const getMyMess = async (req, res) => {
  try {
    const db = getDB();
    const secretary = await getSecretary(req);

    if (!secretary)
      return res.status(404).json({ message: "Secretary not found" });
    if (!secretary.messId)
      return res.status(400).json({ message: "No mess assigned to Secretary" });

    const mess = await db
      .collection("messes")
      .findOne({ _id: secretary.messId });
    if (!mess) return res.status(404).json({ message: "Mess not found" });

    res.status(200).json({ mess });
  } catch (error) {
    console.error("GET SECRETARY MESS ERROR:", error);
    res.status(500).json({ message: "Server error" });
  }
};

/**
 * Get Secretary's own profile without password hash.
 */
export const getMyProfile = async (req, res) => {
  try {
    const db = getDB();
    const secretary = await db
      .collection("users")
      .findOne(
        { _id: new ObjectId(req.user.id), role: "MESS_SECRETARY" },
        { projection: { password: 0 } },
      );

    if (!secretary)
      return res.status(404).json({ message: "Secretary not found" });
    res.status(200).json(secretary);
  } catch (error) {
    console.error("GET SECRETARY PROFILE ERROR:", error);
    res.status(500).json({ message: "Server error" });
  }
};

/**
 * Update Secretary profile details.
 */
export const updateMyProfile = async (req, res) => {
  try {
    const db = getDB();
    const allowedFields = ["name", "email", "serviceId", "mobile"];
    const update = {};

    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        update[field] =
          field === "email"
            ? String(req.body[field]).toLowerCase().trim()
            : req.body[field];
      }
    }

    if (Object.keys(update).length === 0) {
      return res.status(400).json({ message: "No fields to update" });
    }

    if (update.email) {
      const existing = await db.collection("users").findOne({
        email: update.email,
        _id: { $ne: new ObjectId(req.user.id) },
      });
      if (existing)
        return res.status(409).json({ message: "Email already exists" });
    }

    update.updatedAt = new Date();
    const result = await db
      .collection("users")
      .updateOne(
        { _id: new ObjectId(req.user.id), role: "MESS_SECRETARY" },
        { $set: update },
      );

    if (!result.matchedCount)
      return res.status(404).json({ message: "Secretary not found" });
    res.status(200).json({ message: "Profile updated successfully" });
  } catch (error) {
    console.error("UPDATE SECRETARY PROFILE ERROR:", error);
    res.status(500).json({ message: "Server error" });
  }
};

/**
 * Change Secretary account password.
 */
export const changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      return res
        .status(400)
        .json({ message: "Current password and new password are required" });
    }
    if (newPassword.length < 8) {
      return res
        .status(400)
        .json({ message: "New password must be at least 8 characters" });
    }

    const db = getDB();
    const secretary = await getSecretary(req);
    if (!secretary)
      return res.status(404).json({ message: "Secretary not found" });

    const passwordMatch = await bcrypt.compare(
      currentPassword,
      secretary.password,
    );
    if (!passwordMatch)
      return res.status(401).json({ message: "Current password is incorrect" });

    const samePassword = await bcrypt.compare(newPassword, secretary.password);
    if (samePassword)
      return res
        .status(400)
        .json({ message: "New password must be different" });

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await db
      .collection("users")
      .updateOne(
        { _id: secretary._id },
        { $set: { password: hashedPassword, updatedAt: new Date() } },
      );

    res.status(200).json({ message: "Password changed successfully" });
  } catch (error) {
    console.error("CHANGE SECRETARY PASSWORD ERROR:", error);
    res.status(500).json({ message: "Server error" });
  }
};

/**
 * Secretary: Read-only monitoring of all mess bookings.
 */
export const getSecretaryBookings = async (req, res) => {
  try {
    const db = getDB();
    const secretary = await getSecretary(req);
    if (!secretary || !secretary.messId) {
      return res
        .status(400)
        .json({ message: "Secretary has no assigned mess" });
    }

    await markExpiredApprovedBookingsAsNoShow(db, secretary.messId);

    const filter = { messId: secretary.messId };
    if (req.query.status) {
      filter.status = req.query.status;
    }

    const bookings = await db
      .collection("bookings")
      .find(filter)
      .sort({ createdAt: -1 })
      .toArray();
    const monitoredBookings = await withFinalStay(db, bookings);
    res.status(200).json({ count: monitoredBookings.length, bookings: monitoredBookings });
  } catch (error) {
    console.error("GET SECRETARY BOOKINGS ERROR:", error);
    res.status(500).json({ message: "Server error" });
  }
};

/**
 * Secretary: Approve booking (preserved for API contract compatibility).
 */
export const approveBooking = async (req, res) => {
  try {
    const { bookingId } = req.params;
    if (!ObjectId.isValid(bookingId)) {
      return res.status(400).json({ message: "Invalid booking ID" });
    }

    const db = getDB();
    const secretary = await getSecretary(req);
    if (!secretary || !secretary.messId) {
      return res
        .status(400)
        .json({ message: "Secretary has no assigned mess" });
    }

    const booking = await db.collection("bookings").findOne({
      _id: new ObjectId(bookingId),
      messId: secretary.messId,
      status: "PENDING_SECRETARY",
    });

    if (!booking) {
      return res.status(404).json({
        message: "Booking not found or not waiting for Secretary approval",
      });
    }

    await db.collection("bookings").updateOne(
      { _id: booking._id },
      {
        $set: {
          status: "PENDING_PMC",
          "approval.secretary.status": "APPROVED",
          "approval.secretary.approvedBy": secretary._id,
          "approval.secretary.approvedAt": new Date(),
          updatedAt: new Date(),
        },
      },
    );

    await broadcastMessEvent(db, {
      messId: secretary.messId,
      userId: booking.userId,
      type: "BOOKING_APPROVAL",
      title: "Booking reviewed by Mess Secretary",
      bookingId: booking._id,
      userMessage:
        "Your stay request was reviewed by the Mess Secretary and forwarded to PMC.",
      staffMessage: `Stay request for ${booking.booker?.name || "Guest"} was reviewed and endorsed by Mess Secretary.`,
      notifyUser: true,
    });

    res.status(200).json({ message: "Booking approved by Mess Secretary" });
  } catch (error) {
    console.error("SECRETARY APPROVE ERROR:", error);
    res.status(500).json({ message: "Server error" });
  }
};

/**
 * Secretary: Reject booking (preserved for API contract compatibility).
 */
export const rejectBooking = async (req, res) => {
  try {
    const { bookingId } = req.params;
    const { reason } = req.body;
    if (!ObjectId.isValid(bookingId)) {
      return res.status(400).json({ message: "Invalid booking ID" });
    }

    const db = getDB();
    const secretary = await getSecretary(req);
    if (!secretary || !secretary.messId) {
      return res
        .status(400)
        .json({ message: "Secretary has no assigned mess" });
    }

    const booking = await db.collection("bookings").findOne({
      _id: new ObjectId(bookingId),
      messId: secretary.messId,
      status: "PENDING_SECRETARY",
    });

    if (!booking) {
      return res.status(404).json({ message: "Booking not found" });
    }

    await db.collection("bookings").updateOne(
      {
        _id: new ObjectId(bookingId),
        messId: secretary.messId,
        status: "PENDING_SECRETARY",
      },
      {
        $set: {
          status: "REJECTED",
          rejectionReason: reason || "Rejected by Mess Secretary",
          "approval.secretary": "REJECTED",
          updatedAt: new Date(),
        },
      },
    );

    await broadcastMessEvent(db, {
      messId: secretary.messId,
      userId: booking.userId,
      type: "BOOKING_REJECTED",
      title: "Booking rejected by Mess Secretary",
      bookingId: booking._id,
      userMessage: `Your booking request was rejected by the Mess Secretary: ${reason || "No reason provided"}`,
      staffMessage: `Booking request for ${booking.booker?.name || "Guest"} was rejected by Mess Secretary.`,
      notifyUser: true,
    });

    res.status(200).json({ message: "Booking rejected by Mess Secretary" });
  } catch (error) {
    console.error("SECRETARY REJECT ERROR:", error);
    res.status(500).json({ message: "Server error" });
  }
};
