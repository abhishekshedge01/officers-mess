import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import { getDB } from "../config/db.js";

/**
 * Register a new USER account.
 */
export const register = async (req, res) => {
  try {
    const { rank, name, email, password, serviceId, mobile } = req.body || {};

    if (!name || !email || !password) {
      return res
        .status(400)
        .json({ message: "Name, email and password are required" });
    }

    if (String(password).length < 8) {
      return res
        .status(400)
        .json({ message: "Password must be at least 8 characters" });
    }

    const normalizedEmail = String(email).toLowerCase().trim();
    const db = getDB();
    const users = db.collection("users");

    const existingUser = await users.findOne({ email: normalizedEmail });
    if (existingUser) {
      return res.status(409).json({ message: "Email is already registered" });
    }

    const hashedPassword = await bcrypt.hash(String(password), 10);

    const user = {
      rank,
      name: String(name).trim(),
      email: normalizedEmail,
      password: hashedPassword,
      serviceId: serviceId ? String(serviceId).trim() : "",
      mobile: mobile ? String(mobile).trim() : "",
      role: "USER",
      messId: null,
      accountStatus: "ACTIVE",
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const result = await users.insertOne(user);

    return res.status(201).json({
      message: "User registered successfully",
      user: {
        id: result.insertedId,
        rank: user.rank,
        name: user.name,
        email: user.email,
        serviceId: user.serviceId,
        mobile: user.mobile,
        role: user.role,
        messId: null,
      },
    });
  } catch (error) {
    console.error("REGISTER ERROR:", error);
    if (error.code === 11000) {
      return res.status(409).json({ message: "Email is already registered" });
    }
    return res.status(500).json({ message: "Server error" });
  }
};

/**
 * Authenticate user credentials and return a signed JWT token.
 */
export const login = async (req, res) => {
  try {
    const { email, password } = req.body || {};

    if (!email || !password) {
      return res
        .status(400)
        .json({ message: "Email and password are required" });
    }

    const db = getDB();
    const normalizedEmail = String(email).toLowerCase().trim();
    const user = await db
      .collection("users")
      .findOne({ email: normalizedEmail });

    if (!user) {
      return res.status(401).json({ message: "Invalid email or password" });
    }

    const passwordMatch = await bcrypt.compare(String(password), user.password);
    if (!passwordMatch) {
      return res.status(401).json({ message: "Invalid email or password" });
    }

    if (user.accountStatus && user.accountStatus !== "ACTIVE") {
      return res.status(403).json({ message: "Your account is not active" });
    }

    if (!process.env.JWT_SECRET) {
      return res.status(500).json({ message: "JWT configuration missing" });
    }

    const payload = {
      id: user._id.toString(),
      role: user.role,
      rank: user.rank || "",
      name: user.name || "",
      email: user.email || "",
      serviceId: user.serviceId || "",
    };

    // Access Token (7 days for smooth seamless session)
    const ACCESS_TOKEN_EXPIRY = "7d";
    const REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || `${process.env.JWT_SECRET}_refresh`;
    const REFRESH_TOKEN_EXPIRY = "30d";

    const accessToken = jwt.sign(payload, process.env.JWT_SECRET, {
      expiresIn: ACCESS_TOKEN_EXPIRY,
    });

    const refreshToken = jwt.sign(
      { id: user._id.toString(), type: "REFRESH" },
      REFRESH_SECRET,
      { expiresIn: REFRESH_TOKEN_EXPIRY }
    );

    const now = new Date();
    // 7 days session expiry for the access token
    const accessExpiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    // 30 days expiry for the refresh token
    const refreshExpiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    // Compute SHA-256 hash of tokens for cryptographic storage
    const accessTokenHash = crypto.createHash("sha256").update(accessToken).digest("hex");
    const refreshTokenHash = crypto.createHash("sha256").update(refreshToken).digest("hex");

    // Save active access session in sessions collection (indexed by token and tokenHash)
    await db.collection("sessions").insertOne({
      userId: user._id,
      token: accessToken,
      tokenHash: accessTokenHash,
      role: user.role,
      createdAt: now,
      expiresAt: accessExpiresAt,
      lastSeenAt: now,
    });

    // Save active refresh token in refresh_tokens collection (indexed by token and tokenHash)
    await db.collection("refresh_tokens").insertOne({
      userId: user._id,
      token: refreshToken,
      tokenHash: refreshTokenHash,
      createdAt: now,
      expiresAt: refreshExpiresAt,
      userAgent: req.headers["user-agent"] || "",
      ipAddress: req.ip || "",
    });

    return res.status(200).json({
      message: "Login successful",
      token: accessToken, // Backwards-compatible
      accessToken,
      refreshToken,
      user: {
        id: user._id,
        rank: user.rank,
        name: user.name,
        email: user.email,
        serviceId: user.serviceId || "",
        mobile: user.mobile || "",
        role: user.role,
        messId: user.messId || null,
      },
    });
  } catch (error) {
    console.error("LOGIN ERROR:", error);
    return res.status(500).json({ message: "Server error" });
  }
};

/**
 * Exchange a valid 7-day refresh token for a fresh access token and rotate the refresh token.
 */
export const refreshToken = async (req, res) => {
  try {
    const { refreshToken: incomingRefreshToken } = req.body || {};

    if (!incomingRefreshToken) {
      return res.status(400).json({ message: "Refresh token is required" });
    }

    const db = getDB();
    const REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || `${process.env.JWT_SECRET}_refresh`;

    // 1. Check if the refresh token was explicitly revoked/blacklisted
    const isRevoked = await db.collection("revoked_tokens").findOne({ token: incomingRefreshToken });
    if (isRevoked) {
      return res.status(401).json({
        message: "Unauthorized token: This refresh token has been revoked.",
        code: "TOKEN_REVOKED",
      });
    }

    // 2. Verify cryptographic validity & expiration
    let decoded;
    try {
      decoded = jwt.verify(incomingRefreshToken, REFRESH_SECRET);
    } catch (err) {
      return res.status(401).json({
        message: "Invalid or expired refresh token. Please log in again.",
        code: "REFRESH_EXPIRED",
      });
    }

    // 3. Verify that the refresh token exists in active refresh_tokens collection
    const storedTokenDoc = await db.collection("refresh_tokens").findOne({
      token: incomingRefreshToken,
    });

    if (!storedTokenDoc) {
      // Check if it was recently rotated within a 60-second grace period (concurrent requests race condition)
      const recentlyRotated = await db.collection("revoked_tokens").findOne({
        token: incomingRefreshToken,
        reason: "ROTATED_REFRESH",
        revokedAt: { $gte: new Date(Date.now() - 60 * 1000) },
      });

      if (recentlyRotated) {
        // Find user and issue a valid access token without penalty
        const graceUser = await db.collection("users").findOne({ _id: recentlyRotated.userId });
        if (graceUser && (!graceUser.accountStatus || graceUser.accountStatus === "ACTIVE")) {
          const payload = {
            id: graceUser._id.toString(),
            role: graceUser.role,
            rank: graceUser.rank || "",
            name: graceUser.name || "",
            email: graceUser.email || "",
            serviceId: graceUser.serviceId || "",
          };
          const graceAccessToken = jwt.sign(payload, process.env.JWT_SECRET, {
            expiresIn: "7d",
          });
          return res.status(200).json({
            message: "Token refreshed successfully",
            token: graceAccessToken,
            accessToken: graceAccessToken,
            refreshToken: incomingRefreshToken,
          });
        }
      }

      // Possible token reuse / theft detection: Revoke all refresh tokens for this user for security
      await db.collection("refresh_tokens").deleteMany({ userId: decoded.id });
      await db.collection("revoked_tokens").insertOne({
        token: incomingRefreshToken,
        tokenType: "REFRESH",
        userId: decoded.id,
        reason: "REUSED_OR_INVALID_REFRESH_TOKEN",
        revokedAt: new Date(),
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      });

      return res.status(401).json({
        message: "Security alert: Refresh token already used or invalid. Please log in again.",
        code: "TOKEN_REUSE_DETECTED",
      });
    }

    // 4. Fetch the user details to build the fresh access token
    const user = await db.collection("users").findOne({ _id: storedTokenDoc.userId });
    if (!user || (user.accountStatus && user.accountStatus !== "ACTIVE")) {
      return res.status(403).json({ message: "Account is inactive or not found" });
    }

    // 5. Invalidate / Consume the used refresh token (Rotation)
    await db.collection("refresh_tokens").deleteOne({ _id: storedTokenDoc._id });

    // Mark previous refresh token as revoked to prevent any re-use
    await db.collection("revoked_tokens").insertOne({
      token: incomingRefreshToken,
      tokenType: "REFRESH",
      userId: user._id,
      reason: "ROTATED_REFRESH",
      revokedAt: new Date(),
      expiresAt: storedTokenDoc.expiresAt || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    });

    // 6. Generate NEW Access Token (7 days) and rotated NEW Refresh Token (30 days)
    const payload = {
      id: user._id.toString(),
      role: user.role,
      rank: user.rank || "",
      name: user.name || "",
      email: user.email || "",
      serviceId: user.serviceId || "",
    };

    const newAccessToken = jwt.sign(payload, process.env.JWT_SECRET, {
      expiresIn: "7d",
    });

    const newRefreshToken = jwt.sign(
      { id: user._id.toString(), type: "REFRESH" },
      REFRESH_SECRET,
      { expiresIn: "30d" }
    );

    const now = new Date();
    const accessExpiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    const refreshExpiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    // Compute SHA-256 hash of tokens for cryptographic storage
    const newAccessTokenHash = crypto.createHash("sha256").update(newAccessToken).digest("hex");
    const newRefreshTokenHash = crypto.createHash("sha256").update(newRefreshToken).digest("hex");

    // Save new sessions
    await db.collection("sessions").insertOne({
      userId: user._id,
      token: newAccessToken,
      tokenHash: newAccessTokenHash,
      role: user.role,
      createdAt: now,
      expiresAt: accessExpiresAt,
      lastSeenAt: now,
    });

    await db.collection("refresh_tokens").insertOne({
      userId: user._id,
      token: newRefreshToken,
      tokenHash: newRefreshTokenHash,
      createdAt: now,
      expiresAt: refreshExpiresAt,
      userAgent: req.headers["user-agent"] || "",
      ipAddress: req.ip || "",
    });

    return res.status(200).json({
      message: "Token refreshed successfully",
      token: newAccessToken,
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
    });
  } catch (error) {
    console.error("REFRESH TOKEN ERROR:", error);
    return res.status(500).json({ message: "Server error during token refresh" });
  }
};

/**
 * Logout and add active tokens to the revoked_tokens database.
 */
export const logout = async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    const accessToken = authHeader?.startsWith("Bearer ")
      ? authHeader.slice(7).trim()
      : "";
    const { refreshToken: incomingRefreshToken } = req.body || {};

    const db = getDB();
    const now = new Date();

    // Revoke access token if provided
    if (accessToken) {
      await db.collection("sessions").deleteOne({ token: accessToken });
      
      let decodedAccess = null;
      try {
        decodedAccess = jwt.decode(accessToken);
      } catch (e) {}

      const expDate = decodedAccess?.exp
        ? new Date(decodedAccess.exp * 1000)
        : new Date(now.getTime() + 15 * 60 * 1000);

      const accessHash = crypto.createHash("sha256").update(accessToken).digest("hex");
      await db.collection("revoked_tokens").updateOne(
        { token: accessToken },
        {
          $set: {
            token: accessToken,
            tokenHash: accessHash,
            tokenType: "ACCESS",
            userId: decodedAccess?.id || req.user?.id || null,
            reason: "USER_LOGOUT",
            revokedAt: now,
            expiresAt: expDate,
          },
        },
        { upsert: true }
      );
    }

    // Revoke refresh token if provided
    if (incomingRefreshToken) {
      await db.collection("refresh_tokens").deleteOne({ token: incomingRefreshToken });

      let decodedRefresh = null;
      try {
        decodedRefresh = jwt.decode(incomingRefreshToken);
      } catch (e) {}

      const expDate = decodedRefresh?.exp
        ? new Date(decodedRefresh.exp * 1000)
        : new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

      const refreshHash = crypto.createHash("sha256").update(incomingRefreshToken).digest("hex");
      await db.collection("revoked_tokens").updateOne(
        { token: incomingRefreshToken },
        {
          $set: {
            token: incomingRefreshToken,
            tokenHash: refreshHash,
            tokenType: "REFRESH",
            userId: decodedRefresh?.id || req.user?.id || null,
            reason: "USER_LOGOUT",
            revokedAt: now,
            expiresAt: expDate,
          },
        },
        { upsert: true }
      );
    }

    return res.status(200).json({ message: "Logout successful. Token revoked." });
  } catch (error) {
    console.error("LOGOUT ERROR:", error);
    return res.status(500).json({ message: "Server error" });
  }
};

/**
 * Retrieve list of unauthorized / revoked tokens for security audits and management.
 */
export const getRevokedTokens = async (req, res) => {
  try {
    const db = getDB();
    const limit = Math.min(parseInt(req.query.limit || "50", 10), 100);
    const tokens = await db
      .collection("revoked_tokens")
      .find({})
      .sort({ revokedAt: -1 })
      .limit(limit)
      .toArray();

    return res.status(200).json({
      total: tokens.length,
      revokedTokens: tokens.map((t) => ({
        id: t._id,
        tokenType: t.tokenType,
        tokenSnippet: t.token ? `${t.token.slice(0, 10)}...${t.token.slice(-6)}` : "",
        reason: t.reason,
        userId: t.userId,
        revokedAt: t.revokedAt,
        expiresAt: t.expiresAt,
      })),
    });
  } catch (error) {
    console.error("GET REVOKED TOKENS ERROR:", error);
    return res.status(500).json({ message: "Failed to retrieve revoked tokens" });
  }
};

/**
 * Manually revoke an unauthorized token or terminate an officer's access immediately.
 */
export const revokeTokenManually = async (req, res) => {
  try {
    const { token, reason } = req.body || {};
    if (!token) {
      return res.status(400).json({ message: "Token string is required to revoke" });
    }

    const db = getDB();
    const now = new Date();
    let decoded = null;
    try {
      decoded = jwt.decode(token);
    } catch (e) {}

    const expDate = decoded?.exp
      ? new Date(decoded.exp * 1000)
      : new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    // Remove from sessions and refresh_tokens
    await db.collection("sessions").deleteMany({ token });
    await db.collection("refresh_tokens").deleteMany({ token });

    await db.collection("revoked_tokens").updateOne(
      { token },
      {
        $set: {
          token,
          tokenType: decoded?.type === "REFRESH" ? "REFRESH" : "ACCESS",
          userId: decoded?.id || null,
          reason: reason || "ADMIN_MANUAL_REVOCATION",
          revokedAt: now,
          expiresAt: expDate,
        },
      },
      { upsert: true }
    );

    return res.status(200).json({
      message: "Token added to unauthorized denylist and revoked successfully",
    });
  } catch (error) {
    console.error("MANUAL REVOKE ERROR:", error);
    return res.status(500).json({ message: "Server error revoking token" });
  }
};
