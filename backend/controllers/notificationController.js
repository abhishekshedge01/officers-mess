// controllers/notificationController.js
// Handles retrieval and read-status management of user notifications.

import { ObjectId } from "mongodb";
import { getDB } from "../config/db.js";
import { idFilter } from "../utils/messHelper.js";

/**
 * Fetch all notifications for the authenticated user, sorted by most recent first.
 */
export const getMyNotifications = async (req, res) => {
  try {
    const db = getDB();
    const notifications = await db
      .collection("notifications")
      .find({ userId: idFilter(req.user.id) })
      .sort({ createdAt: -1 })
      .toArray();

    return res.status(200).json({ notifications });
  } catch (error) {
    console.error("GET NOTIFICATIONS ERROR:", error);
    return res.status(500).json({ message: "Server error" });
  }
};

/**
 * Get count of unread notifications for the authenticated user.
 */
export const getUnreadNotificationCount = async (req, res) => {
  try {
    const db = getDB();
    const count = await db.collection("notifications").countDocuments({
      userId: idFilter(req.user.id),
      isRead: { $ne: true },
    });

    return res.status(200).json({ count });
  } catch (error) {
    console.error("GET UNREAD COUNT ERROR:", error);
    return res.status(500).json({ message: "Server error" });
  }
};

/**
 * Mark a specific notification as read by its notificationId.
 */
export const markNotificationRead = async (req, res) => {
  try {
    const { notificationId } = req.params;
    if (!ObjectId.isValid(notificationId)) {
      return res.status(400).json({ message: "Invalid notification ID" });
    }

    const db = getDB();
    const result = await db.collection("notifications").updateOne(
      {
        _id: idFilter(notificationId),
        userId: idFilter(req.user.id),
      },
      {
        $set: {
          isRead: true,
          readAt: new Date(),
        },
      },
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({ message: "Notification not found" });
    }

    return res.status(200).json({ message: "Notification marked as read" });
  } catch (error) {
    console.error("MARK NOTIFICATION ERROR:", error);
    return res.status(500).json({ message: "Server error" });
  }
};

/**
 * Mark all unread notifications as read for the authenticated user.
 */
export const markAllNotificationsRead = async (req, res) => {
  try {
    const db = getDB();
    const result = await db.collection("notifications").updateMany(
      {
        userId: idFilter(req.user.id),
        isRead: { $ne: true },
      },
      {
        $set: {
          isRead: true,
          readAt: new Date(),
        },
      },
    );

    return res.status(200).json({
      message: "All notifications marked as read",
      updated: result.modifiedCount,
    });
  } catch (error) {
    console.error("MARK ALL NOTIFICATIONS ERROR:", error);
    return res.status(500).json({ message: "Server error" });
  }
};
