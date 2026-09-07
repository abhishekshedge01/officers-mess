// utils/notificationHelper.js
// Centralized notification dispatcher ensuring:
// 1. Deduplication: prevents creating identical notifications for the same user, type, and target entity.
// 2. Comprehensive role broadcast: automatically sends role-relevant notifications to PMC, Mess Secretary,
//    Mess Manager, and the guest (User) whenever an action is performed.

import { ObjectId } from "mongodb";
import { idFilter } from "./messHelper.js";

/**
 * Dispatch a notification to a specific user if a duplicate does not already exist.
 * Deduplication checks for matching userId, type, and associated entity ID (bookingId or billId).
 */
export const sendNotification = async (
  db,
  { userId, type, title, message, bookingId = null, billId = null },
) => {
  if (!userId) return null;

  const targetUserId = String(userId);
  const filter = {
    userId: idFilter(targetUserId),
    type,
  };

  if (bookingId) {
    filter.bookingId = idFilter(bookingId);
  }
  if (billId) {
    filter.billId = idFilter(billId);
  }

  // Deduplication check: do not send if identical notification already exists
  const existing = await db.collection("notifications").findOne(filter);
  if (existing) {
    return existing;
  }

  const doc = {
    userId: targetUserId,
    type,
    title: title || "Notification",
    message: message || "",
    isRead: false,
    read: false, // Contract compatibility
    createdAt: new Date(),
  };

  if (bookingId) {
    doc.bookingId = String(bookingId);
  }
  if (billId) {
    doc.billId = String(billId);
  }

  const result = await db.collection("notifications").insertOne(doc);
  return { ...doc, _id: result.insertedId };
};

/**
 * Broadcast an event notification to all relevant stakeholders:
 * - Mess Manager
 * - Mess Secretary
 * - PMC
 * - Guest / User (if notifyUser is true and userId is provided)
 *
 * @param {Object} db - MongoDB database instance
 * @param {Object} params
 * @param {ObjectId|string} params.messId - ID of the mess
 * @param {ObjectId|string} [params.userId] - Guest user ID
 * @param {string} params.type - Notification event type (e.g. BOOKING_CREATED, BOOKING_APPROVED, etc.)
 * @param {string} params.title - Title for the notification
 * @param {string} params.userMessage - Message text sent to the guest/user
 * @param {string} params.staffMessage - Message text sent to Manager, Secretary, and PMC
 * @param {ObjectId|string} [params.bookingId] - Associated booking ID
 * @param {ObjectId|string} [params.billId] - Associated bill ID
 * @param {boolean} [params.notifyUser=true] - Whether to notify the guest
 */
export const broadcastMessEvent = async (
  db,
  {
    messId,
    userId = null,
    type,
    title,
    userMessage,
    staffMessage,
    bookingId = null,
    billId = null,
    notifyUser = true,
  },
) => {
  if (!messId) return;

  const mess = await db
    .collection("messes")
    .findOne({ _id: idFilter(messId) });
  if (!mess) return;

  const staffUserIds = new Set();
  if (mess.managerId) {
    staffUserIds.add(String(mess.managerId));
  }
  if (mess.secretaryId) {
    staffUserIds.add(String(mess.secretaryId));
  }
  if (mess.pmcId) {
    staffUserIds.add(String(mess.pmcId));
  }

  const promises = [];

  // Notify staff members (Manager, Secretary, PMC)
  for (const staffId of staffUserIds) {
    promises.push(
      sendNotification(db, {
        userId: staffId,
        type,
        title,
        message: staffMessage,
        bookingId,
        billId,
      }),
    );
  }

  // Notify guest user if applicable
  if (notifyUser && userId) {
    promises.push(
      sendNotification(db, {
        userId: String(userId),
        type,
        title,
        message: userMessage || staffMessage,
        bookingId,
        billId,
      }),
    );
  }

  await Promise.all(promises);
};
