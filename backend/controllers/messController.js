import { getDB } from "../config/db.js";
import { ObjectId } from "mongodb";

/**
 * Admin: Create a new mess record.
 */
export const createMess = async (req, res) => {
  try {
    const {
      name,
      city,
      state,
      address,
      contactNumber,
      description,
      facilities,
    } = req.body || {};

    if (!name || !city || !state || !address) {
      return res
        .status(400)
        .json({ message: "Name, city, state and address are required" });
    }

    const db = getDB();
    const messes = db.collection("messes");

    const existingMess = await messes.findOne({
      name: name.trim(),
      city: city.trim(),
    });
    if (existingMess) {
      return res
        .status(409)
        .json({ message: "This Officers' Mess already exists in this city" });
    }

    const newMess = {
      name: name.trim(),
      city: city.trim(),
      state: state.trim(),
      address: address.trim(),
      contactNumber: contactNumber ? contactNumber.trim() : null,
      description: description ? description.trim() : null,
      facilities: Array.isArray(facilities) ? facilities : [],
      status: "ACTIVE",
      managerId: null,
      secretaryId: null,
      pmcId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const result = await messes.insertOne(newMess);

    res.status(201).json({
      message: "Officers' Mess created successfully",
      mess: {
        id: result.insertedId,
        name: newMess.name,
        city: newMess.city,
        state: newMess.state,
        address: newMess.address,
        managerId: null,
        secretaryId: null,
        pmcId: null,
      },
    });
  } catch (error) {
    console.error("CREATE MESS ERROR:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

/**
 * Get list of all messes sorted alphabetically by city.
 */
export const getAllMesses = async (req, res) => {
  try {
    const db = getDB();
    const messes = await db
      .collection("messes")
      .find({})
      .sort({ city: 1 })
      .toArray();

    res.status(200).json({ count: messes.length, messes });
  } catch (error) {
    console.error("GET MESSES ERROR:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

/**
 * Search messes by city name (case-insensitive).
 */
export const getMessesByCity = async (req, res) => {
  try {
    const { city } = req.params;
    if (!city) {
      return res.status(400).json({ message: "City is required" });
    }

    const db = getDB();
    const messes = await db
      .collection("messes")
      .find({ city: { $regex: `^${city}$`, $options: "i" } })
      .toArray();

    res.status(200).json({ count: messes.length, city, messes });
  } catch (error) {
    console.error("GET MESSES BY CITY ERROR:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

/**
 * Retrieve mess by unique MongoDB ID.
 */
export const getMessById = async (req, res) => {
  try {
    const { id } = req.params;
    if (!ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid Mess ID" });
    }

    const db = getDB();
    const mess = await db
      .collection("messes")
      .findOne({ _id: new ObjectId(id) });

    if (!mess) {
      return res.status(404).json({ message: "Mess not found" });
    }

    res.status(200).json({ mess });
  } catch (error) {
    console.error("GET MESS ERROR:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

/**
 * Admin: Assign staff role (MESS_MANAGER, MESS_SECRETARY, PMC) to a user for a mess.
 */
export const assignMessStaff = async (req, res) => {
  try {
    const { messId, userId, role } = req.body || {};
    if (!messId || !userId || !role) {
      return res
        .status(400)
        .json({ message: "messId, userId and role are required" });
    }

    const allowedRoles = ["MESS_MANAGER", "MESS_SECRETARY", "PMC"];
    if (!allowedRoles.includes(role)) {
      return res
        .status(400)
        .json({ message: "Role must be MESS_MANAGER, MESS_SECRETARY or PMC" });
    }

    if (!ObjectId.isValid(messId) || !ObjectId.isValid(userId)) {
      return res.status(400).json({ message: "Invalid Mess ID or User ID" });
    }

    const db = getDB();
    const messes = db.collection("messes");
    const users = db.collection("users");

    const messObjectId = new ObjectId(messId);
    const userObjectId = new ObjectId(userId);

    const mess = await messes.findOne({ _id: messObjectId });
    if (!mess) return res.status(404).json({ message: "Mess not found" });

    const user = await users.findOne({ _id: userObjectId });
    if (!user) return res.status(404).json({ message: "User not found" });

    if (user.role !== "USER" && user.role !== role) {
      return res
        .status(400)
        .json({ message: "This user already has another staff role" });
    }

    const fieldMap = {
      MESS_MANAGER: "managerId",
      MESS_SECRETARY: "secretaryId",
      PMC: "pmcId",
    };
    const field = fieldMap[role];

    if (mess[field]) {
      return res
        .status(409)
        .json({ message: `${role} is already assigned to this Mess` });
    }

    await messes.updateOne(
      { _id: messObjectId },
      { $set: { [field]: userObjectId, updatedAt: new Date() } },
    );

    await users.updateOne(
      { _id: userObjectId },
      { $set: { role, messId: messObjectId, updatedAt: new Date() } },
    );

    res.status(200).json({
      message: `${role} assigned successfully`,
      assignment: { messId: messObjectId, userId: userObjectId, role },
    });
  } catch (error) {
    console.error("ASSIGN STAFF ERROR:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};
