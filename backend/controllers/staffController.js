// controllers/staffController.js
// Handles staff-level operational actions such as adding extra stay charges (laundry, meals, etc.)
// and inspecting booking charges.

import { ObjectId } from "mongodb";
import { getDB } from "../config/db.js";
import { messIdFilter, resolveUserMessId } from "../utils/messHelper.js";

/**
 * Add an extra line-item charge (e.g. food, laundry) to a currently CHECKED_IN booking.
 * Only accessible by MESS_MANAGER or MESS_SECRETARY of the assigned mess.
 */
export const addBookingCharge = async (req, res) => {
  try {
    const { bookingId } = req.params;
    const { description, quantity = 1, rate } = req.body;

    // Validate booking ID
    if (!ObjectId.isValid(bookingId)) {
      return res.status(400).json({ message: "Invalid booking ID" });
    }

    // Validate charge description
    if (!description || !String(description).trim()) {
      return res
        .status(400)
        .json({ message: "Charge description is required" });
    }

    const numericQuantity = Number(quantity);
    const numericRate = Number(rate);

    if (!Number.isFinite(numericQuantity) || numericQuantity <= 0) {
      return res
        .status(400)
        .json({ message: "Quantity must be greater than 0" });
    }

    if (!Number.isFinite(numericRate) || numericRate < 0) {
      return res.status(400).json({ message: "Rate must be 0 or greater" });
    }

    const db = getDB();

    // Verify staff user and permissions
    const staff = await db.collection("users").findOne({
      _id: new ObjectId(req.user.id),
    });

    if (!staff) {
      return res.status(404).json({ message: "Staff user not found" });
    }

    if (staff.role !== "MESS_MANAGER" && staff.role !== "MESS_SECRETARY") {
      return res
        .status(403)
        .json({ message: "Only mess manager or secretary can add charges" });
    }

    const rawMessId = await resolveUserMessId(db, staff);
    if (!rawMessId) {
      return res
        .status(403)
        .json({ message: "You are not assigned to any mess" });
    }

    // Verify booking exists in the staff member's mess
    const booking = await db.collection("bookings").findOne({
      _id: new ObjectId(bookingId),
      messId: messIdFilter(rawMessId),
    });

    if (!booking) {
      return res
        .status(404)
        .json({ message: "Booking not found in your mess" });
    }

    // Additional charges can only be added while guest is checked in
    if (booking.status !== "CHECKED_IN") {
      return res.status(400).json({
        message: "Additional charges can only be added to a checked-in booking",
      });
    }

    const amount = numericQuantity * numericRate;

    const charge = {
      _id: new ObjectId(),
      description: String(description).trim(),
      quantity: numericQuantity,
      rate: numericRate,
      amount,
      addedBy: new ObjectId(req.user.id),
      addedByRole: staff.role,
      createdAt: new Date(),
    };

    // Push charge into booking's extraCharges array
    await db.collection("bookings").updateOne(
      {
        _id: booking._id,
        messId,
        status: "CHECKED_IN",
      },
      {
        $push: { extraCharges: charge },
        $set: { updatedAt: new Date() },
      },
    );

    return res.status(201).json({
      message: "Additional charge added successfully",
      charge,
    });
  } catch (error) {
    console.error("ADD BOOKING CHARGE ERROR:", error);
    return res.status(500).json({ message: "Server error" });
  }
};

/**
 * Retrieve extra charges recorded for a booking.
 * Accessible by the booking's guest (USER) or staff within the booking's mess.
 */
export const getBookingCharges = async (req, res) => {
  try {
    const { bookingId } = req.params;

    if (!ObjectId.isValid(bookingId)) {
      return res.status(400).json({ message: "Invalid booking ID" });
    }

    const db = getDB();
    const staff = await db.collection("users").findOne({
      _id: new ObjectId(req.user.id),
    });

    if (!staff) {
      return res.status(404).json({ message: "Staff user not found" });
    }

    let booking;

    // Regular users can only see their own booking's charges
    if (staff.role === "USER") {
      booking = await db.collection("bookings").findOne({
        _id: new ObjectId(bookingId),
        userId: new ObjectId(req.user.id),
      });
    } else {
      // Staff members must belong to a mess to query charges
      const rawMessId = await resolveUserMessId(db, staff);
      if (!rawMessId) {
        return res
          .status(403)
          .json({ message: "You are not assigned to any mess" });
      }

      booking = await db.collection("bookings").findOne({
        _id: new ObjectId(bookingId),
        messId: messIdFilter(rawMessId),
      });
    }

    if (!booking) {
      return res.status(404).json({ message: "Booking not found" });
    }

    return res.status(200).json({
      bookingId: booking._id,
      extraCharges: booking.extraCharges || [],
    });
  } catch (error) {
    console.error("GET BOOKING CHARGES ERROR:", error);
    return res.status(500).json({ message: "Server error" });
  }
};
