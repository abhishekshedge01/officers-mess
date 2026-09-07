import { getDB } from "../config/db.js";
import { ObjectId } from "mongodb";
import bcrypt from "bcryptjs";
import { idFilter } from "../utils/messHelper.js";

/**
 * Get profile of currently logged-in user without password hash.
 */
export const getMyProfile = async (req, res) => {
  try {
    const db = getDB();
    const user = await db
      .collection("users")
      .findOne(
        { _id: idFilter(req.user.id) },
        { projection: { password: 0 } },
      );

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    res.status(200).json({ user });
  } catch (error) {
    console.error("GET PROFILE ERROR:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

/**
 * Update current user's profile details.
 */
export const updateMyProfile = async (req, res) => {
  try {
    const { name, mobile, rank, serviceId } = req.body || {};
    const updateData = {};

    if (name !== undefined) updateData.name = name;
    if (mobile !== undefined) updateData.mobile = mobile;
    if (rank !== undefined) updateData.rank = rank;
    if (serviceId !== undefined) updateData.serviceId = serviceId;

    if (Object.keys(updateData).length === 0) {
      return res
        .status(400)
        .json({ message: "No profile information provided" });
    }

    updateData.updatedAt = new Date();
    const db = getDB();

    const result = await db
      .collection("users")
      .updateOne({ _id: idFilter(req.user.id) }, { $set: updateData });

    if (result.matchedCount === 0) {
      return res.status(404).json({ message: "User not found" });
    }

    const updatedUser = await db
      .collection("users")
      .findOne(
        { _id: idFilter(req.user.id) },
        { projection: { password: 0 } },
      );

    res.status(200).json({
      message: "Profile updated successfully",
      user: updatedUser,
    });
  } catch (error) {
    console.error("UPDATE PROFILE ERROR:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

/**
 * Change current user's password.
 */
export const changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body || {};

    if (!currentPassword || !newPassword) {
      return res
        .status(400)
        .json({ message: "Current and new password are required" });
    }

    if (String(newPassword).length < 8) {
      return res
        .status(400)
        .json({ message: "New password must be at least 8 characters" });
    }

    const db = getDB();
    const users = db.collection("users");
    const user = await users.findOne({ _id: idFilter(req.user.id) });

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const passwordMatch = await bcrypt.compare(currentPassword, user.password);
    if (!passwordMatch) {
      return res.status(401).json({ message: "Current password is incorrect" });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await users.updateOne(
      { _id: idFilter(req.user.id) },
      { $set: { password: hashedPassword, updatedAt: new Date() } },
    );

    res.status(200).json({ message: "Password changed successfully" });
  } catch (error) {
    console.error("CHANGE PASSWORD ERROR:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

/**
 * Get all stay bookings created by the logged-in user.
 */
export const getMyBookings = async (req, res) => {
  try {
    const db = getDB();
    const bookings = await db
      .collection("bookings")
      .find({ userId: idFilter(req.user.id) })
      .sort({ createdAt: -1 })
      .toArray();

    res.status(200).json({ count: bookings.length, bookings });
  } catch (error) {
    console.error("MY BOOKINGS ERROR:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

/**
 * Get upcoming non-cancelled bookings for current user.
 */
export const getUpcomingBookings = async (req, res) => {
  try {
    const db = getDB();
    const now = new Date();
    const bookings = await db
      .collection("bookings")
      .find({
        userId: idFilter(req.user.id),
        checkOut: { $gte: now },
        status: {
          $nin: [
            "CANCELLED",
            "USER_CANCELLED",
            "REJECTED",
            "COMPLETED",
            "NO_SHOW",
          ],
        },
      })
      .sort({ checkIn: 1 })
      .toArray();

    res.status(200).json({ count: bookings.length, bookings });
  } catch (error) {
    console.error("UPCOMING BOOKINGS ERROR:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

/**
 * Retrieve a specific booking belonging to the logged-in user.
 */
export const getMyBookingById = async (req, res) => {
  try {
    const { bookingId } = req.params;
    if (!bookingId) {
      return res.status(400).json({ message: "Invalid Booking ID" });
    }

    const db = getDB();
    const booking = await db
      .collection("bookings")
      .findOne({
        _id: idFilter(bookingId),
        userId: idFilter(req.user.id),
      });

    if (!booking) {
      return res.status(404).json({ message: "Booking not found" });
    }

    res.status(200).json({ booking });
  } catch (error) {
    console.error("GET BOOKING ERROR:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

/**
 * Cancel a booking before check-in.
 */
export const cancelBooking = async (req, res) => {
  try {
    const { bookingId } = req.params;
    const reason = (req.body?.reason || req.body?.cancellationReason || "").trim();

    if (!bookingId) {
      return res.status(400).json({ message: "Invalid Booking ID" });
    }

    const db = getDB();
    const bookings = db.collection("bookings");
    const booking = await bookings.findOne({
      _id: idFilter(bookingId),
      userId: idFilter(req.user.id),
    });

    if (!booking) {
      return res.status(404).json({ message: "Booking not found" });
    }

    if (["COMPLETED", "CHECKED_OUT"].includes(booking.status)) {
      return res
        .status(400)
        .json({ message: "Completed booking cannot be cancelled" });
    }
    if (["CANCELLED", "USER_CANCELLED"].includes(booking.status)) {
      return res.status(400).json({ message: "Booking is already cancelled" });
    }
    if (["CHECKED_IN", "CHECKOUT_REQUESTED"].includes(booking.status)) {
      return res
        .status(400)
        .json({ message: "Booking cannot be cancelled after check-in" });
    }
    if (booking.status === "NO_SHOW") {
      return res
        .status(400)
        .json({ message: "Booking has already elapsed as No Show" });
    }

    const now = new Date();
    await bookings.updateOne(
      { _id: idFilter(bookingId) },
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

    // Free up earmarked room allocation
    await db
      .collection("room_allocations")
      .updateMany(
        { bookingId: idFilter(bookingId), status: "ACTIVE" },
        { $set: { status: "CANCELLED", updatedAt: now } },
      );

    res.status(200).json({
      message: "Booking cancelled successfully",
      bookingId,
      status: "USER_CANCELLED",
    });
  } catch (error) {
    console.error("CANCEL BOOKING ERROR:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};
