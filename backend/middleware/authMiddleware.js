import jwt from "jsonwebtoken";
import { ObjectId } from "mongodb";
import { getDB } from "../config/db.js";

/**
 * Middleware to verify JWT token from Authorization header and attach decoded user to req.user.
 */
export const protect = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ message: "Authorization token required" });
    }

    const token = authHeader.split(" ")[1];
    if (!token) {
      return res.status(401).json({ message: "Authorization token required" });
    }

    if (!process.env.JWT_SECRET) {
      console.error("JWT_SECRET is missing");
      return res.status(500).json({ message: "JWT configuration missing" });
    }

    const db = getDB();

    // 1. Actively check the unauthorized / revoked tokens database
    const revoked = await db.collection("revoked_tokens").findOne({ token });
    if (revoked) {
      return res.status(401).json({
        message: "Unauthorized token: Access token has been revoked or logged out.",
        code: "TOKEN_REVOKED",
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const userIdObj = new ObjectId(decoded.id);

    // Look for active session in MongoDB
    const session = await db.collection("sessions").findOne({
      token,
      userId: userIdObj,
      expiresAt: { $gt: new Date() },
    });

    if (session) {
      await db.collection("sessions").updateOne(
        { _id: session._id },
        { $set: { lastSeenAt: new Date() } }
      );
      req.session = session;
    } else {
      // In serverless / multi-instance setups or if session document TTL expired before JWT:
      // Verify user is still active in users collection to keep authorized sessions intact
      const activeUser = await db.collection("users").findOne({ _id: userIdObj });
      if (!activeUser || (activeUser.accountStatus && activeUser.accountStatus !== "ACTIVE")) {
        return res.status(401).json({ message: "Session expired or logged out", code: "SESSION_EXPIRED" });
      }

      // Automatically recreate the active session entry for this valid token
      const now = new Date();
      const sessionExpiry = decoded.exp ? new Date(decoded.exp * 1000) : new Date(now.getTime() + 15 * 60 * 1000);
      await db.collection("sessions").updateOne(
        { token },
        {
          $setOnInsert: {
            userId: userIdObj,
            token,
            role: decoded.role || activeUser.role,
            createdAt: now,
            expiresAt: sessionExpiry,
          },
          $set: { lastSeenAt: now },
        },
        { upsert: true }
      );
    }

    req.user = decoded;
    next();
  } catch (error) {
    console.error("AUTH MIDDLEWARE ERROR:", error.message);
    return res.status(401).json({ message: "Invalid or expired token" });
  }
};
