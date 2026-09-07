import bcrypt from "bcryptjs";
import { ObjectId } from "mongodb";
import { getDB } from "../config/db.js";
import { withFinalStay } from "../utils/finalStay.js";
import { broadcastMessEvent } from "../utils/notificationHelper.js";
import { markExpiredApprovedBookingsAsNoShow } from "../utils/stayDates.js";

const DEFAULT_PASSWORD = "Welcome@123";

/**
 * Helper to retrieve the authenticated PMC user.
 */
const getPMC = async (req) => {
  const db = getDB();
  return await db.collection("users").findOne({
    _id: new ObjectId(req.user.id),
    role: "PMC",
  });
};

/**
 * Retrieve details of the mess assigned to the PMC, including Manager and Secretary profiles.
 */
export const getMyMess = async (req, res) => {
  try {
    const db = getDB();
    const pmc = await getPMC(req);

    if (!pmc) return res.status(404).json({ message: "PMC not found" });
    if (!pmc.messId)
      return res.status(400).json({ message: "No mess assigned to PMC" });

    const mess = await db.collection("messes").findOne({ _id: pmc.messId });
    if (!mess) return res.status(404).json({ message: "Mess not found" });

    const pmcProfile = await db
      .collection("users")
      .findOne({ _id: pmc._id }, { projection: { password: 0 } });

    const manager = mess.managerId
      ? await db
          .collection("users")
          .findOne({ _id: mess.managerId }, { projection: { password: 0 } })
      : null;

    const secretary = mess.secretaryId
      ? await db
          .collection("users")
          .findOne({ _id: mess.secretaryId }, { projection: { password: 0 } })
      : null;

    res.status(200).json({
      mess,
      pmc: pmcProfile,
      manager,
      secretary,
    });
  } catch (error) {
    console.error("GET PMC MESS ERROR:", error);
    res.status(500).json({ message: "Server error" });
  }
};

/**
 * PMC: Create or update Mess Manager for the mess.
 */
export const updateManager = async (req, res) => {
  try {
    const db = getDB();
    const pmc = await getPMC(req);

    if (!pmc) return res.status(404).json({ message: "PMC not found" });
    if (!pmc.messId)
      return res.status(400).json({ message: "PMC has no assigned mess" });

    const mess = await db.collection("messes").findOne({ _id: pmc.messId });
    if (!mess) return res.status(404).json({ message: "Mess not found" });

    const { name, email, serviceId, rank, mobile, password } = req.body;
    if (!name || !email) {
      return res.status(400).json({ message: "Name and email are required" });
    }

    const normalizedEmail = email.toLowerCase().trim();
    const existingUser = await db.collection("users").findOne({
      email: normalizedEmail,
      _id: { $ne: mess.managerId || null },
    });

    if (existingUser) {
      return res.status(409).json({ message: "Email already exists" });
    }

    if (!mess.managerId) {
      const finalPassword = password || DEFAULT_PASSWORD;
      const hashedPassword = await bcrypt.hash(finalPassword, 10);

      const manager = {
        name: name.trim(),
        email: normalizedEmail,
        password: hashedPassword,
        serviceId: serviceId || "",
        rank: rank || "",
        mobile: mobile || "",
        role: "MESS_MANAGER",
        messId: pmc.messId,
        accountStatus: "ACTIVE",
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const result = await db.collection("users").insertOne(manager);
      await db
        .collection("messes")
        .updateOne(
          { _id: pmc.messId },
          { $set: { managerId: result.insertedId, updatedAt: new Date() } },
        );

      return res.status(201).json({
        message: "Mess Manager created successfully",
        manager: {
          id: result.insertedId,
          name: manager.name,
          email: manager.email,
          serviceId: manager.serviceId,
          rank: manager.rank || "",
          mobile: manager.mobile,
          role: manager.role,
        },
        temporaryPassword: finalPassword,
      });
    }

    const update = {
      name: name.trim(),
      email: normalizedEmail,
      serviceId: serviceId || "",
      rank: rank || "",
      mobile: mobile || "",
      updatedAt: new Date(),
    };

    if (password) {
      update.password = await bcrypt.hash(password, 10);
    }

    await db
      .collection("users")
      .updateOne(
        { _id: mess.managerId, role: "MESS_MANAGER", messId: pmc.messId },
        { $set: update },
      );

    res.status(200).json({ message: "Mess Manager updated successfully" });
  } catch (error) {
    console.error("UPDATE MANAGER ERROR:", error);
    res.status(500).json({ message: "Server error" });
  }
};

/**
 * PMC: Create or update Mess Secretary for the mess.
 */
export const updateSecretary = async (req, res) => {
  try {
    const db = getDB();
    const pmc = await getPMC(req);

    if (!pmc) return res.status(404).json({ message: "PMC not found" });
    if (!pmc.messId)
      return res.status(400).json({ message: "PMC has no assigned mess" });

    const mess = await db.collection("messes").findOne({ _id: pmc.messId });
    if (!mess) return res.status(404).json({ message: "Mess not found" });

    const { name, email, serviceId, rank, mobile, password } = req.body;
    if (!name || !email) {
      return res.status(400).json({ message: "Name and email are required" });
    }

    const normalizedEmail = email.toLowerCase().trim();
    const existingUser = await db.collection("users").findOne({
      email: normalizedEmail,
      _id: { $ne: mess.secretaryId || null },
    });

    if (existingUser) {
      return res.status(409).json({ message: "Email already exists" });
    }

    if (!mess.secretaryId) {
      const finalPassword = password || DEFAULT_PASSWORD;
      const hashedPassword = await bcrypt.hash(finalPassword, 10);

      const secretary = {
        name: name.trim(),
        email: normalizedEmail,
        password: hashedPassword,
        serviceId: serviceId || "",
        rank: rank || "",
        mobile: mobile || "",
        role: "MESS_SECRETARY",
        messId: pmc.messId,
        accountStatus: "ACTIVE",
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const result = await db.collection("users").insertOne(secretary);
      await db
        .collection("messes")
        .updateOne(
          { _id: pmc.messId },
          { $set: { secretaryId: result.insertedId, updatedAt: new Date() } },
        );

      return res.status(201).json({
        message: "Mess Secretary created successfully",
        secretary: {
          id: result.insertedId,
          name: secretary.name,
          email: secretary.email,
          serviceId: secretary.serviceId,
          rank: secretary.rank || "",
          mobile: secretary.mobile,
          role: secretary.role,
        },
        temporaryPassword: finalPassword,
      });
    }

    const update = {
      name: name.trim(),
      email: normalizedEmail,
      serviceId: serviceId || "",
      rank: rank || "",
      mobile: mobile || "",
      updatedAt: new Date(),
    };

    if (password) {
      update.password = await bcrypt.hash(password, 10);
    }

    await db
      .collection("users")
      .updateOne(
        { _id: mess.secretaryId, role: "MESS_SECRETARY", messId: pmc.messId },
        { $set: update },
      );

    res.status(200).json({ message: "Mess Secretary updated successfully" });
  } catch (error) {
    console.error("UPDATE SECRETARY ERROR:", error);
    res.status(500).json({ message: "Server error" });
  }
};

/**
 * PMC: Change own account password.
 */
export const changePMCPassword = async (req, res) => {
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
    const pmc = await getPMC(req);
    if (!pmc) return res.status(404).json({ message: "PMC not found" });

    const passwordMatch = await bcrypt.compare(currentPassword, pmc.password);
    if (!passwordMatch) {
      return res.status(401).json({ message: "Current password is incorrect" });
    }

    const samePassword = await bcrypt.compare(newPassword, pmc.password);
    if (samePassword) {
      return res
        .status(400)
        .json({ message: "New password must be different" });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await db
      .collection("users")
      .updateOne(
        { _id: pmc._id },
        { $set: { password: hashedPassword, updatedAt: new Date() } },
      );

    res.status(200).json({ message: "PMC password changed successfully" });
  } catch (error) {
    console.error("CHANGE PMC PASSWORD ERROR:", error);
    res.status(500).json({ message: "Server error" });
  }
};

/**
 * PMC: Read-only monitoring of all bookings in the mess.
 */
export const getPMCBookings = async (req, res) => {
  try {
    const db = getDB();
    const pmc = await getPMC(req);

    if (!pmc || !pmc.messId) {
      return res.status(400).json({ message: "PMC has no assigned mess" });
    }

    await markExpiredApprovedBookingsAsNoShow(db, pmc.messId);

    const filter = { messId: pmc.messId };
    if (req.query.status) {
      filter.status = req.query.status;
    }

    const bookings = await db
      .collection("bookings")
      .find(filter)
      .sort({ createdAt: -1 })
      .toArray();
    const monitoredBookings = await withFinalStay(db, bookings);

    res
      .status(200)
      .json({ count: monitoredBookings.length, bookings: monitoredBookings });
  } catch (error) {
    console.error("GET PMC BOOKINGS ERROR:", error);
    res.status(500).json({ message: "Server error" });
  }
};

/**
 * PMC: Approve booking (preserved for API contract compatibility).
 */
export const approveBooking = async (req, res) => {
  try {
    const { bookingId } = req.params;
    if (!ObjectId.isValid(bookingId)) {
      return res.status(400).json({ message: "Invalid booking ID" });
    }

    const db = getDB();
    const pmc = await getPMC(req);
    if (!pmc || !pmc.messId) {
      return res.status(400).json({ message: "PMC has no assigned mess" });
    }

    const booking = await db.collection("bookings").findOne({
      _id: new ObjectId(bookingId),
      messId: pmc.messId,
      status: "PENDING_PMC",
    });

    if (!booking) {
      return res
        .status(404)
        .json({ message: "Booking not found or not waiting for PMC approval" });
    }

    await db.collection("bookings").updateOne(
      { _id: booking._id },
      {
        $set: {
          status: "APPROVED",
          "approval.pmc.status": "APPROVED",
          "approval.pmc.approvedBy": pmc._id,
          "approval.pmc.approvedAt": new Date(),
          updatedAt: new Date(),
        },
      },
    );

    await broadcastMessEvent(db, {
      messId: booking.messId,
      userId: booking.userId,
      type: "BOOKING_APPROVED",
      title: "Booking approved by PMC",
      bookingId: booking._id,
      userMessage: "Your booking has been approved by the PMC.",
      staffMessage: `Booking approved by PMC for ${booking.booker?.name || "Guest"}.`,
      notifyUser: true,
    });

    res.status(200).json({ message: "Booking finally approved by PMC" });
  } catch (error) {
    console.error("PMC APPROVE BOOKING ERROR:", error);
    res.status(500).json({ message: "Server error" });
  }
};

/**
 * PMC: Reject booking (preserved for API contract compatibility).
 */
export const rejectBooking = async (req, res) => {
  try {
    const { bookingId } = req.params;
    if (!ObjectId.isValid(bookingId)) {
      return res.status(400).json({ message: "Invalid booking ID" });
    }

    const db = getDB();
    const pmc = await getPMC(req);
    if (!pmc || !pmc.messId) {
      return res.status(400).json({ message: "PMC has no assigned mess" });
    }

    const booking = await db.collection("bookings").findOne({
      _id: new ObjectId(bookingId),
      messId: pmc.messId,
      status: "PENDING_PMC",
    });

    if (!booking) {
      return res
        .status(404)
        .json({ message: "Booking not found or not waiting for PMC approval" });
    }

    const reason = (req.body?.reason || req.body?.rejectionReason || "").trim();

    await db.collection("bookings").updateOne(
      { _id: booking._id },
      {
        $set: {
          status: "REJECTED",
          rejectionReason: reason || "Rejected by PMC",
          "approval.pmc.status": "REJECTED",
          "approval.pmc.approvedBy": pmc._id,
          "approval.pmc.approvedAt": new Date(),
          updatedAt: new Date(),
        },
      },
    );

    await broadcastMessEvent(db, {
      messId: booking.messId,
      userId: booking.userId,
      type: "BOOKING_REJECTED",
      title: "Booking rejected by PMC",
      bookingId: booking._id,
      userMessage: `Your booking request from ${booking.checkInDate} to ${booking.checkOutDate} was rejected by PMC.`,
      staffMessage: `Booking request for ${booking.booker?.name || "Guest"} was rejected by PMC.`,
      notifyUser: true,
    });

    res.status(200).json({ message: "Booking rejected by PMC" });
  } catch (error) {
    console.error("PMC REJECT BOOKING ERROR:", error);
    res.status(500).json({ message: "Server error" });
  }
};
