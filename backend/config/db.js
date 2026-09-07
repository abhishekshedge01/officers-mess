import { MongoClient } from "mongodb";
import dotenv from "dotenv";

dotenv.config();

if (!process.env.MONGO_URI) {
  throw new Error("MONGO_URI is missing in .env");
}

let client;
let db;

/**
 * Connect to MongoDB Atlas/local MongoDB and ensure all required collection indexes exist.
 */
export const connectDB = async () => {
  if (db) return db;

  try {
    if (!client) {
      client = new MongoClient(process.env.MONGO_URI, {
        serverSelectionTimeoutMS: 15000,
      });
    }
    await client.connect();
    db = client.db(process.env.DB_NAME || "officers-mess");

    const users = db.collection("users");
    const rooms = db.collection("rooms");
    const bookings = db.collection("bookings");
    const bills = db.collection("bills");
    const notifications = db.collection("notifications");
    const allocations = db.collection("room_allocations");
    const blocks = db.collection("room_blocks");
    const sessions = db.collection("sessions");
    const revokedTokens = db.collection("revoked_tokens");
    const refreshTokens = db.collection("refresh_tokens");

    await Promise.all([
      users.createIndex({ email: 1 }, { unique: true }),
      rooms.createIndex({ messId: 1, roomNumber: 1 }, { unique: true }),
      bookings.createIndex({
        messId: 1,
        checkInDate: 1,
        checkOutDate: 1,
        status: 1,
      }),
      bookings.createIndex({ messId: 1, checkInDate: 1, checkOutDate: 1 }),
      bookings.createIndex({ userId: 1, createdAt: -1 }),
      bills.createIndex({ bookingId: 1 }, { unique: true }),
      notifications.createIndex({ userId: 1, createdAt: -1 }),
      notifications.createIndex({ userId: 1, type: 1, bookingId: 1 }),
      allocations.createIndex({ bookingId: 1, status: 1 }),
      allocations.createIndex({ roomId: 1, from: 1, to: 1, status: 1 }),
      blocks.createIndex({ roomId: 1, from: 1, to: 1, status: 1 }),
      sessions.createIndex({ token: 1 }, { unique: true }),
      sessions.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
      sessions.createIndex({ userId: 1, createdAt: -1 }),
      revokedTokens.createIndex({ token: 1 }, { unique: true }),
      revokedTokens.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
      revokedTokens.createIndex({ userId: 1, revokedAt: -1 }),
      refreshTokens.createIndex({ token: 1 }, { unique: true }),
      refreshTokens.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
      refreshTokens.createIndex({ userId: 1, createdAt: -1 }),
    ]);

    console.log("MongoDB connected successfully");
    console.log("Database:", db.databaseName);
    return db;
  } catch (error) {
    console.error("MongoDB connection failed:", error.message);
    throw error;
  }
};

/**
 * Returns the active MongoDB database instance.
 */
export const getDB = () => {
  if (!db) {
    throw new Error("Database is not connected");
  }
  return db;
};
