import { ObjectId } from "mongodb";

/**
 * Returns a MongoDB query filter matching _id either as a String or an ObjectId,
 * guaranteeing compatibility regardless of whether the collection uses string IDs or ObjectIds.
 *
 * @param {string|ObjectId} id
 * @returns {Object} { $in: [...] } query clause
 */
export const idFilter = (id) => {
  if (!id) return { $in: [] };
  const str = String(id);
  if (ObjectId.isValid(str)) {
    return { $in: [str, new ObjectId(str)] };
  }
  return str;
};

/**
 * Returns a MongoDB query filter matching messId either as a String or an ObjectId,
 * guaranteeing compatibility with both schema conventions.
 *
 * @param {string|ObjectId} messId
 * @returns {Object} { $in: [...] } query clause
 */
export const messIdFilter = (messId) => {
  if (!messId) return { $in: [] };
  const str = String(messId);
  if (ObjectId.isValid(str)) {
    return { $in: [str, new ObjectId(str)] };
  }
  return str;
};

/**
 * Ensures a staff user has an assigned messId. If missing or invalid,
 * falls back to the first active mess in the database and persists it to the user.
 *
 * @param {import('mongodb').Db} db
 * @param {Object} user
 * @returns {Promise<string|ObjectId>} The resolved messId (or null if no mess exists)
 */
export const resolveUserMessId = async (db, user) => {
  if (user?.messId) {
    return user.messId;
  }

  // Find default active mess
  const defaultMess =
    (await db.collection("messes").findOne({ status: "ACTIVE" })) ||
    (await db.collection("messes").findOne({}));

  if (defaultMess && user?._id) {
    const resolvedId = String(defaultMess._id);
    await db
      .collection("users")
      .updateOne({ _id: user._id }, { $set: { messId: resolvedId } });
    user.messId = resolvedId;
    return resolvedId;
  }

  return user?.messId || null;
};
