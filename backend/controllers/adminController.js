import bcrypt from "bcryptjs";
import { ObjectId } from "mongodb";
import { getDB } from "../config/db.js";

const DEFAULT_PASSWORD = "Welcome@123";

/**
 * Admin: Create a new Mess document.
 */
export const createMess = async (req, res) => {
  try {
    const { name, location, city, address } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ message: "Mess name is required" });
    }

    const trimmedName = name.trim();
    const loc = (location || city || "").trim();

    const db = getDB();

    // Check if mess with same name already exists in this location
    const duplicateQuery = {
      name: {
        $regex: new RegExp(
          `^${trimmedName.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&")}$`,
          "i",
        ),
      },
    };
    if (loc) {
      duplicateQuery.$or = [
        {
          location: {
            $regex: new RegExp(
              `^${loc.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&")}$`,
              "i",
            ),
          },
        },
        {
          city: {
            $regex: new RegExp(
              `^${loc.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&")}$`,
              "i",
            ),
          },
        },
      ];
    }

    const existing = await db.collection("messes").findOne(duplicateQuery);
    if (existing) {
      return res.status(409).json({
        message: `Officers Mess '${trimmedName}' already exists in ${loc || "the system"}`,
      });
    }

    const mess = {
      name: trimmedName,
      location: location || "",
      city: city || location || "",
      address: address || "",
      status: "ACTIVE",
      pmcId: null,
      managerId: null,
      secretaryId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const result = await db.collection("messes").insertOne(mess);

    res.status(201).json({
      message: "Mess created successfully",
      mess: { ...mess, _id: result.insertedId, id: result.insertedId },
    });
  } catch (error) {
    console.error("CREATE MESS ERROR:", error);
    res.status(500).json({ message: "Server error" });
  }
};

/**
 * Admin: Retrieve all messes with populated PMC profile summary.
 */
export const getAllMesses = async (req, res) => {
  try {
    const db = getDB();
    const messes = await db
      .collection("messes")
      .find()
      .sort({ createdAt: -1 })
      .toArray();

    const pmcIds = messes.filter((m) => m.pmcId).map((m) => m.pmcId);
    const pmcs = pmcIds.length
      ? await db
          .collection("users")
          .find(
            { _id: { $in: pmcIds }, role: "PMC" },
            { projection: { password: 0 } },
          )
          .toArray()
      : [];
    const pmcMap = new Map(pmcs.map((p) => [String(p._id), p]));

    res.status(200).json({
      messes: messes.map((m) => ({
        ...m,
        pmc: m.pmcId ? pmcMap.get(String(m.pmcId)) || null : null,
      })),
    });
  } catch (error) {
    console.error("GET MESSES ERROR:", error);
    res.status(500).json({ message: "Server error" });
  }
};

/**
 * Admin: Update mess details.
 */
export const updateMess = async (req, res) => {
  try {
    const { messId } = req.params;
    if (!ObjectId.isValid(messId)) {
      return res.status(400).json({ message: "Invalid mess ID" });
    }

    const allowedFields = ["name", "location", "city", "address", "status"];
    const update = {};

    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        update[field] = req.body[field];
      }
    }

    if (Object.keys(update).length === 0) {
      return res.status(400).json({ message: "No fields to update" });
    }

    update.updatedAt = new Date();
    const db = getDB();

    const result = await db
      .collection("messes")
      .updateOne({ _id: new ObjectId(messId) }, { $set: update });

    if (!result.matchedCount) {
      return res.status(404).json({ message: "Mess not found" });
    }

    res.status(200).json({ message: "Mess updated successfully" });
  } catch (error) {
    console.error("UPDATE MESS ERROR:", error);
    res.status(500).json({ message: "Server error" });
  }
};

/**
 * Admin: Delete a mess.
 */
export const deleteMess = async (req, res) => {
  try {
    const { messId } = req.params;
    if (!ObjectId.isValid(messId)) {
      return res.status(400).json({ message: "Invalid mess ID" });
    }

    const db = getDB();
    const messObjectId = new ObjectId(messId);

    const mess = await db.collection("messes").findOne({ _id: messObjectId });
    if (!mess) {
      return res.status(404).json({ message: "Mess not found" });
    }

    // Delete mess
    await db.collection("messes").deleteOne({ _id: messObjectId });

    // Unlink any users tied to this mess
    await db.collection("users").updateMany(
      { messId: messObjectId },
      { $set: { messId: null, updatedAt: new Date() } },
    );

    res.status(200).json({ message: "Mess deleted successfully" });
  } catch (error) {
    console.error("DELETE MESS ERROR:", error);
    res.status(500).json({ message: "Server error" });
  }
};

/**
 * Admin: Link an existing PMC user to a Mess.
 */
export const assignPMCToMess = async (req, res) => {
  try {
    const { messId } = req.params;
    const { userId } = req.body;

    if (!messId || !userId) {
      return res
        .status(400)
        .json({ message: "messId and userId are required" });
    }
    if (!ObjectId.isValid(messId)) {
      return res.status(400).json({ message: "Invalid mess ID" });
    }
    if (!ObjectId.isValid(userId)) {
      return res.status(400).json({ message: "Invalid user ID" });
    }

    const db = getDB();
    const messObjectId = new ObjectId(messId);
    const userObjectId = new ObjectId(userId);

    const mess = await db.collection("messes").findOne({ _id: messObjectId });
    if (!mess) return res.status(404).json({ message: "Mess not found" });

    const pmc = await db.collection("users").findOne({ _id: userObjectId });
    if (!pmc) return res.status(404).json({ message: "User not found" });

    if (pmc.role !== "PMC") {
      return res.status(400).json({ message: "Selected user is not a PMC" });
    }
    if (mess.pmcId) {
      return res.status(400).json({ message: "Mess already has a PMC" });
    }
    if (pmc.messId) {
      return res
        .status(400)
        .json({ message: "PMC is already assigned to a mess" });
    }

    await db
      .collection("messes")
      .updateOne(
        { _id: messObjectId },
        { $set: { pmcId: userObjectId, updatedAt: new Date() } },
      );

    await db
      .collection("users")
      .updateOne(
        { _id: userObjectId },
        { $set: { messId: messObjectId, updatedAt: new Date() } },
      );

    res.status(200).json({
      message: "PMC assigned successfully",
      messId: messObjectId,
      pmcId: userObjectId,
    });
  } catch (error) {
    console.error("ASSIGN PMC ERROR:", error);
    res.status(500).json({ message: "Server error" });
  }
};

/**
 * Admin: Create a PMC user account and link to a Mess in one step.
 */
export const createPMC = async (req, res) => {
  try {
    const { messId, serviceId, rank, name, email, password, mobile } = req.body;
    if (!messId || !name || !email || !serviceId || !rank) {
      return res
        .status(400)
        .json({
          message: "Mess, service no., rank, name and email are required",
        });
    }
    if (!ObjectId.isValid(messId)) {
      return res.status(400).json({ message: "Invalid mess ID" });
    }

    const db = getDB();
    const messObjectId = new ObjectId(messId);
    const mess = await db.collection("messes").findOne({ _id: messObjectId });
    if (!mess) return res.status(404).json({ message: "Mess not found" });
    if (mess.pmcId)
      return res.status(409).json({ message: "This mess already has a PMC" });

    const normalizedEmail = email.toLowerCase().trim();
    const existing = await db
      .collection("users")
      .findOne({ email: normalizedEmail });
    if (existing)
      return res.status(409).json({ message: "Email already exists" });

    const existingService = await db
      .collection("users")
      .findOne({ serviceId: String(serviceId).trim(), role: "PMC" });
    if (existingService) {
      return res
        .status(409)
        .json({ message: "PMC service number already exists" });
    }

    const finalPassword = password || DEFAULT_PASSWORD;
    const hashedPassword = await bcrypt.hash(finalPassword, 10);
    const now = new Date();
    const pmc = {
      name: name.trim(),
      email: normalizedEmail,
      password: hashedPassword,
      serviceId: String(serviceId).trim(),
      rank: String(rank).trim(),
      mobile: mobile || "",
      role: "PMC",
      messId: messObjectId,
      accountStatus: "ACTIVE",
      createdAt: now,
      updatedAt: now,
    };

    const result = await db.collection("users").insertOne(pmc);
    await db
      .collection("messes")
      .updateOne(
        { _id: messObjectId },
        { $set: { pmcId: result.insertedId, updatedAt: now } },
      );

    res.status(201).json({
      message: "PMC linked to mess successfully",
      pmc: {
        id: result.insertedId,
        name: pmc.name,
        email: pmc.email,
        serviceId: pmc.serviceId,
        rank: pmc.rank,
        mobile: pmc.mobile,
        role: pmc.role,
      },
      temporaryPassword: finalPassword,
    });
  } catch (error) {
    console.error("CREATE PMC ERROR:", error);
    res.status(500).json({ message: "Server error" });
  }
};

/**
 * Admin: Create a new user with specific role (PMC, MESS_MANAGER, MESS_SECRETARY, USER).
 */
export const createUser = async (req, res) => {
  try {
    const { name, email, serviceId, mobile, role, password } = req.body;
    if (!name || !email || !role) {
      return res
        .status(400)
        .json({ message: "Name, email and role are required" });
    }

    const allowedRoles = ["PMC", "MESS_MANAGER", "MESS_SECRETARY", "USER"];
    if (!allowedRoles.includes(role)) {
      return res.status(400).json({ message: "Invalid role" });
    }

    const db = getDB();
    const normalizedEmail = email.toLowerCase().trim();
    const existing = await db
      .collection("users")
      .findOne({ email: normalizedEmail });
    if (existing) {
      return res.status(409).json({ message: "Email already exists" });
    }

    const finalPassword = password || DEFAULT_PASSWORD;
    const hashedPassword = await bcrypt.hash(finalPassword, 10);

    const user = {
      name: name.trim(),
      email: normalizedEmail,
      password: hashedPassword,
      serviceId: serviceId || "",
      rank: req.body.rank || "",
      mobile: mobile || "",
      role,
      messId: null,
      accountStatus: "ACTIVE",
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const result = await db.collection("users").insertOne(user);

    res.status(201).json({
      message: "User created successfully",
      user: {
        id: result.insertedId,
        name: user.name,
        email: user.email,
        serviceId: user.serviceId,
        rank: user.rank || "",
        mobile: user.mobile,
        role: user.role,
      },
      temporaryPassword: finalPassword,
    });
  } catch (error) {
    console.error("CREATE USER ERROR:", error);
    res.status(500).json({ message: "Server error" });
  }
};

/**
 * Admin: Get all users in the system without password hashes.
 */
export const getAllUsers = async (req, res) => {
  try {
    const db = getDB();
    const users = await db
      .collection("users")
      .find({}, { projection: { password: 0 } })
      .sort({ createdAt: -1 })
      .toArray();

    res.status(200).json(users);
  } catch (error) {
    console.error("GET USERS ERROR:", error);
    res.status(500).json({ message: "Server error" });
  }
};

/**
 * Admin: Update user profile, role, or status.
 */
export const updateUser = async (req, res) => {
  try {
    const { userId } = req.params;
    if (!ObjectId.isValid(userId)) {
      return res.status(400).json({ message: "Invalid user ID" });
    }

    const db = getDB();
    const update = {};
    const allowedFields = [
      "name",
      "email",
      "serviceId",
      "rank",
      "mobile",
      "role",
      "accountStatus",
    ];

    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        update[field] =
          field === "email"
            ? String(req.body[field]).toLowerCase().trim()
            : req.body[field];
      }
    }

    if (req.body.password) {
      update.password = await bcrypt.hash(req.body.password, 10);
    }

    if (Object.keys(update).length === 0) {
      return res.status(400).json({ message: "No fields to update" });
    }

    update.updatedAt = new Date();
    const result = await db
      .collection("users")
      .updateOne({ _id: new ObjectId(userId) }, { $set: update });

    if (!result.matchedCount) {
      return res.status(404).json({ message: "User not found" });
    }

    res.status(200).json({ message: "User updated successfully" });
  } catch (error) {
    console.error("UPDATE USER ERROR:", error);
    res.status(500).json({ message: "Server error" });
  }
};

/**
 * Admin: Retrieve paginated audit and API monitoring logs.
 */
export const getAuditLogs = async (req, res) => {
  try {
    const db = getDB();
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.max(1, Math.min(100, parseInt(req.query.limit) || 20));
    const filterType = req.query.filter || "ALL"; // ALL, ERRORS, LOGINS, USERS
    const search = (req.query.search || "").trim();

    const query = {};
    if (filterType === "ERRORS") {
      query.isError = true;
    } else if (filterType === "LOGINS") {
      query.eventType = { $in: ["USER_LOGIN_SUCCESS", "USER_LOGIN_FAILED"] };
    } else if (filterType === "USERS") {
      query.eventType = "USER_CREATED";
    }

    if (search) {
      query.$or = [
        { path: { $regex: search, $options: "i" } },
        { description: { $regex: search, $options: "i" } },
        { "user.name": { $regex: search, $options: "i" } },
        { "user.rank": { $regex: search, $options: "i" } },
        { "user.serviceId": { $regex: search, $options: "i" } },
        { "user.email": { $regex: search, $options: "i" } },
        { ip: { $regex: search, $options: "i" } },
      ];
    }

    const total = await db.collection("audit_logs").countDocuments(query);
    const rawLogs = await db
      .collection("audit_logs")
      .find(query)
      .sort({ timestamp: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .toArray();

    // Populate user profile if missing rank/name/serviceId
    const userIdsToLookup = [
      ...new Set(
        rawLogs
          .filter((l) => l.user?.id && (!l.user.name || !l.user.rank || !l.user.serviceId))
          .map((l) => l.user.id)
          .filter((id) => ObjectId.isValid(id)),
      ),
    ].map((id) => new ObjectId(id));

    let userMap = {};
    if (userIdsToLookup.length > 0) {
      const users = await db
        .collection("users")
        .find({ _id: { $in: userIdsToLookup } }, { projection: { rank: 1, name: 1, serviceId: 1, email: 1, role: 1 } })
        .toArray();
      users.forEach((u) => {
        userMap[u._id.toString()] = u;
      });
    }

    const logs = rawLogs.map((log) => {
      if (log.user?.id && userMap[log.user.id]) {
        const u = userMap[log.user.id];
        return {
          ...log,
          user: {
            ...log.user,
            rank: log.user.rank || u.rank || "",
            name: log.user.name || u.name || "",
            serviceId: log.user.serviceId || u.serviceId || "",
            email: log.user.email || u.email || "",
          },
        };
      }
      return log;
    });

    res.status(200).json({
      logs,
      total,
      page,
      totalPages: Math.max(1, Math.ceil(total / limit)),
      limit,
    });
  } catch (error) {
    console.error("GET AUDIT LOGS ERROR:", error);
    res.status(500).json({ message: "Unable to retrieve audit logs" });
  }
};

/**
 * Admin: Export all audit and API logs as JSON/data array for Excel export.
 */
export const exportAuditLogs = async (req, res) => {
  try {
    const db = getDB();
    const rawLogs = await db
      .collection("audit_logs")
      .find({})
      .sort({ timestamp: -1 })
      .limit(1000)
      .toArray();

    const userIdsToLookup = [
      ...new Set(
        rawLogs
          .filter((l) => l.user?.id && (!l.user.name || !l.user.rank || !l.user.serviceId))
          .map((l) => l.user.id)
          .filter((id) => ObjectId.isValid(id)),
      ),
    ].map((id) => new ObjectId(id));

    let userMap = {};
    if (userIdsToLookup.length > 0) {
      const users = await db
        .collection("users")
        .find({ _id: { $in: userIdsToLookup } }, { projection: { rank: 1, name: 1, serviceId: 1, email: 1, role: 1 } })
        .toArray();
      users.forEach((u) => {
        userMap[u._id.toString()] = u;
      });
    }

    const logs = rawLogs.map((log) => {
      if (log.user?.id && userMap[log.user.id]) {
        const u = userMap[log.user.id];
        return {
          ...log,
          user: {
            ...log.user,
            rank: log.user.rank || u.rank || "",
            name: log.user.name || u.name || "",
            serviceId: log.user.serviceId || u.serviceId || "",
            email: log.user.email || u.email || "",
          },
        };
      }
      return log;
    });

    res.status(200).json({ logs });
  } catch (error) {
    console.error("EXPORT AUDIT LOGS ERROR:", error);
    res.status(500).json({ message: "Unable to export audit logs" });
  }
};

