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
    req.user = decoded;

    // Best-effort session tracking (non-blocking for serverless/cold-start reliability)
    try {
      const now = new Date();
      let userFilter = null;
      if (decoded.id && ObjectId.isValid(decoded.id)) {
        userFilter = { $or: [{ _id: new ObjectId(decoded.id) }, { _id: decoded.id }] };
      } else if (decoded.id) {
        userFilter = { _id: decoded.id };
      }

      // Check if user is explicitly deactivated
      if (userFilter) {
        const userDoc = await db.collection("users").findOne(userFilter, { projection: { accountStatus: 1 } });
        if (userDoc && userDoc.accountStatus && userDoc.accountStatus !== "ACTIVE") {
          return res.status(403).json({ message: "Your account is not active", code: "ACCOUNT_INACTIVE" });
        }
      }

      // Touch / update session timestamp asynchronously
      const sessionExpiry = decoded.exp ? new Date(decoded.exp * 1000) : new Date(now.getTime() + 15 * 60 * 1000);
      db.collection("sessions").updateOne(
        { token },
        {
          $setOnInsert: {
            userId: decoded.id && ObjectId.isValid(decoded.id) ? new ObjectId(decoded.id) : decoded.id,
            token,
            role: decoded.role || "USER",
            createdAt: now,
            expiresAt: sessionExpiry,
          },
          $set: { lastSeenAt: now },
        },
        { upsert: true }
      ).catch(() => {});
    } catch (sessionErr) {
      // Non-fatal: do not block authenticated user if session update fails
      console.warn("Session tracking non-fatal error:", sessionErr.message);
    }

    return next();
  } catch (error) {
    console.error("AUTH MIDDLEWARE ERROR:", error.message);
    return res.status(401).json({ message: "Session expired or invalid token", code: "SESSION_EXPIRED" });
  }
};
