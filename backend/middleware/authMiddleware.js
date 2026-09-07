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

    // Require the JWT to also exist as an active MongoDB session.
    const session = await db.collection("sessions").findOne({
      token,
      userId: new ObjectId(decoded.id),
      expiresAt: { $gt: new Date() },
    });

    if (!session) {
      return res.status(401).json({ message: "Session expired or logged out", code: "SESSION_EXPIRED" });
    }

    await getDB().collection("sessions").updateOne(
      { _id: session._id },
      { $set: { lastSeenAt: new Date() } },
    );

    req.user = decoded;
    req.session = session;
    next();
  } catch (error) {
    console.error("AUTH MIDDLEWARE ERROR:", error.message);
    return res.status(401).json({ message: "Invalid or expired token" });
  }
};
