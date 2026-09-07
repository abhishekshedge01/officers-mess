import { ObjectId } from "mongodb";
import { getDB } from "../config/db.js";

/**
 * Retrieve role-based statistics and metrics for the dashboard.
 * Supports ADMIN, USER, MESS_MANAGER, PMC, and MESS_SECRETARY.
 */
export const getDashboard = async (req, res) => {
  try {
    const db = getDB();
    const bookings = db.collection("bookings");
    const users = db.collection("users");
    const rooms = db.collection("rooms");
    const messes = db.collection("messes");
    const bills = db.collection("bills");

    // Admin Dashboard
    if (req.user.role === "ADMIN") {
      const [
        totalUsers,
        totalMesses,
        totalRooms,
        totalBookings,
        pendingBookings,
        confirmedBookings,
      ] = await Promise.all([
        users.countDocuments(),
        messes.countDocuments(),
        rooms.countDocuments(),
        bookings.countDocuments(),
        bookings.countDocuments({ status: { $in: ["PENDING_MANAGER"] } }),
        bookings.countDocuments({ status: "APPROVED" }),
      ]);

      return res.status(200).json({
        role: "ADMIN",
        statistics: {
          totalUsers,
          totalMesses,
          totalRooms,
          totalBookings,
          pendingBookings,
          confirmedBookings,
        },
      });
    }

    if (!ObjectId.isValid(req.user.id)) {
      return res.status(400).json({ message: "Invalid user ID" });
    }

    const currentUser = await users.findOne({ _id: new ObjectId(req.user.id) });
    if (!currentUser) {
      return res.status(404).json({ message: "User not found" });
    }

    // Officer / User Dashboard
    if (req.user.role === "USER") {
      const userId = new ObjectId(req.user.id);
      const [
        totalBookings,
        pendingBookings,
        approvedBookings,
        checkedInBookings,
        completedBookings,
        pendingBills,
      ] = await Promise.all([
        bookings.countDocuments({ userId }),
        bookings.countDocuments({
          userId,
          status: { $in: ["PENDING_MANAGER"] },
        }),
        bookings.countDocuments({ userId, status: "APPROVED" }),
        bookings.countDocuments({ userId, status: "CHECKED_IN" }),
        bookings.countDocuments({ userId, status: "CHECKED_OUT" }),
        bills.countDocuments({ userId, paymentStatus: { $ne: "PAID" } }),
      ]);

      return res.status(200).json({
        role: "USER",
        user: {
          id: currentUser._id,
          name: currentUser.name,
          email: currentUser.email,
        },
        statistics: {
          totalBookings,
          pendingBookings,
          approvedBookings,
          checkedInBookings,
          completedBookings,
          pendingBills,
        },
      });
    }

    // Staff Dashboard (PMC, Mess Manager, Mess Secretary)
    if (["PMC", "MESS_MANAGER", "MESS_SECRETARY"].includes(req.user.role)) {
      if (!currentUser.messId) {
        return res
          .status(400)
          .json({ message: "You are not assigned to any mess" });
      }

      const messId = new ObjectId(currentUser.messId);
      const mess = await messes.findOne({ _id: messId });
      if (!mess) {
        return res.status(404).json({ message: "Assigned mess not found" });
      }

      const [
        totalBookings,
        pendingManager,
        approvedBookings,
        checkedInBookings,
        checkoutRequestedBookings,
        checkedOutBookings,
        rejectedBookings,
      ] = await Promise.all([
        bookings.countDocuments({ messId }),
        bookings.countDocuments({ messId, status: "PENDING_MANAGER" }),
        bookings.countDocuments({ messId, status: "APPROVED" }),
        bookings.countDocuments({ messId, status: "CHECKED_IN" }),
        bookings.countDocuments({ messId, status: "CHECKOUT_REQUESTED" }),
        bookings.countDocuments({ messId, status: "CHECKED_OUT" }),
        bookings.countDocuments({ messId, status: "REJECTED" }),
      ]);

      // Revenue aggregates from verified PAID bills
      const now = new Date();
      const monthStart = new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
      );
      const nextMonth = new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1),
      );
      const yearStart = new Date(Date.UTC(now.getUTCFullYear(), 0, 1));
      const nextYear = new Date(Date.UTC(now.getUTCFullYear() + 1, 0, 1));

      const [monthRevenueAgg, yearRevenueAgg] = await Promise.all([
        db
          .collection("bills")
          .aggregate([
            {
              $match: {
                messId,
                paymentStatus: "PAID",
                paidAt: { $gte: monthStart, $lt: nextMonth },
              },
            },
            { $group: { _id: null, total: { $sum: "$totalAmount" } } },
          ])
          .toArray(),
        db
          .collection("bills")
          .aggregate([
            {
              $match: {
                messId,
                paymentStatus: "PAID",
                paidAt: { $gte: yearStart, $lt: nextYear },
              },
            },
            { $group: { _id: null, total: { $sum: "$totalAmount" } } },
          ])
          .toArray(),
      ]);

      const monthRevenue = Number(monthRevenueAgg[0]?.total || 0);
      const yearRevenue = Number(yearRevenueAgg[0]?.total || 0);

      const totalRooms = await rooms.countDocuments({ messId });
      const availableRooms = await rooms.countDocuments({
        messId,
        status: "ACTIVE",
      });

      return res.status(200).json({
        role: req.user.role,
        mess: {
          id: mess._id,
          name: mess.name,
          location: mess.location,
          city: mess.city,
          status: mess.status,
        },
        statistics: {
          totalBookings,
          pendingManager,
          pendingApproval: pendingManager,
          approvedBookings,
          checkedInBookings,
          checkoutRequestedBookings,
          waitingCheckout: checkoutRequestedBookings,
          checkedOutBookings,
          rejectedBookings,
          totalRooms,
          availableRooms,
          monthRevenue,
          yearRevenue,
        },
      });
    }

    return res
      .status(403)
      .json({ message: "Dashboard not available for this role" });
  } catch (error) {
    console.error("GET DASHBOARD ERROR:", error);
    return res.status(500).json({ message: "Server error" });
  }
};
