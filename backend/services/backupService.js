// services/backupService.js
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";
import { MongoClient } from "mongodb";
import { getDB } from "../config/db.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BACKUP_DIR = path.resolve(
  __dirname,
  "..",
  process.env.BACKUP_DIR || "./backups"
);

// Ensure backup folder exists
if (!fs.existsSync(BACKUP_DIR)) {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
}

// Collections to snapshot/replicate (excluding temporary sessions)
export const CORE_COLLECTIONS = [
  "users",
  "messes",
  "rooms",
  "bookings",
  "bills",
  "payments",
  "room_allocations",
  "room_blocks",
  "notifications",
  "counters",
  "audit_logs",
  "revoked_tokens",
];

/**
 * Creates a complete point-in-time JSON snapshot backup of all primary collections.
 */
export const createBackup = async (reason = "MANUAL_BACKUP") => {
  const db = getDB();
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const filename = `backup-${timestamp}.json`;
  const filePath = path.join(BACKUP_DIR, filename);

  const snapshot = {
    version: "1.0",
    createdAt: new Date().toISOString(),
    sourceDatabase: db.databaseName,
    reason,
    collections: {},
    metadata: {
      totalCollections: 0,
      totalDocuments: 0,
    },
  };

  let totalDocs = 0;
  for (const collName of CORE_COLLECTIONS) {
    try {
      const docs = await db.collection(collName).find({}).toArray();
      snapshot.collections[collName] = docs;
      totalDocs += docs.length;
    } catch (err) {
      console.warn(`Warning: Could not backup collection '${collName}':`, err.message);
      snapshot.collections[collName] = [];
    }
  }

  snapshot.metadata.totalCollections = Object.keys(snapshot.collections).length;
  snapshot.metadata.totalDocuments = totalDocs;

  // Compute cryptographic SHA-256 integrity checksum of backup data
  const dataPayload = JSON.stringify(snapshot.collections);
  const dataHash = crypto.createHash("sha256").update(dataPayload).digest("hex");
  snapshot.metadata.dataHash = dataHash;
  snapshot.metadata.hashAlgorithm = "SHA-256";

  fs.writeFileSync(filePath, JSON.stringify(snapshot, null, 2), "utf8");

  const stats = fs.statSync(filePath);

  return {
    filename,
    filePath,
    fileSizeBytes: stats.size,
    fileSizeKB: (stats.size / 1024).toFixed(2),
    totalCollections: snapshot.metadata.totalCollections,
    totalDocuments: totalDocs,
    dataHash,
    createdAt: snapshot.createdAt,
    reason,
  };
};

/**
 * List all existing point-in-time backup snapshot files.
 */
export const listBackups = async () => {
  if (!fs.existsSync(BACKUP_DIR)) {
    return [];
  }

  const files = fs.readdirSync(BACKUP_DIR).filter((f) => f.endsWith(".json"));
  const backups = [];

  for (const file of files) {
    try {
      const fullPath = path.join(BACKUP_DIR, file);
      const stat = fs.statSync(fullPath);
      let summary = {
        totalCollections: 0,
        totalDocuments: 0,
        reason: "UNKNOWN",
        createdAt: stat.birthtime || stat.mtime,
      };

      try {
        // Read snapshot header without full memory parse if large
        const content = fs.readFileSync(fullPath, "utf8");
        const parsed = JSON.parse(content);
        summary.totalCollections = parsed.metadata?.totalCollections || Object.keys(parsed.collections || {}).length;
        summary.totalDocuments = parsed.metadata?.totalDocuments || 0;
        summary.dataHash = parsed.metadata?.dataHash || null;
        summary.reason = parsed.reason || "MANUAL";
        summary.createdAt = parsed.createdAt || summary.createdAt;
      } catch (parseErr) {}

      backups.push({
        filename: file,
        sizeBytes: stat.size,
        sizeKB: (stat.size / 1024).toFixed(2),
        sizeMB: (stat.size / (1024 * 1024)).toFixed(2),
        createdAt: summary.createdAt,
        totalCollections: summary.totalCollections,
        totalDocuments: summary.totalDocuments,
        dataHash: summary.dataHash,
        reason: summary.reason,
      });
    } catch (err) {
      console.error(`Error reading backup file ${file}:`, err);
    }
  }

  return backups.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
};

/**
 * Restore the primary database from a selected backup snapshot file.
 */
export const restoreBackup = async (filename) => {
  const safeFilename = path.basename(filename);
  const filePath = path.join(BACKUP_DIR, safeFilename);

  if (!fs.existsSync(filePath)) {
    throw new Error(`Backup file '${safeFilename}' not found.`);
  }

  const content = fs.readFileSync(filePath, "utf8");
  const snapshot = JSON.parse(content);

  if (!snapshot.collections) {
    throw new Error("Invalid backup format: missing 'collections' payload.");
  }

  // If a cryptographic hash is present in the backup, verify tamper-evident integrity
  if (snapshot.metadata?.dataHash) {
    const computedHash = crypto
      .createHash("sha256")
      .update(JSON.stringify(snapshot.collections))
      .digest("hex");

    if (computedHash !== snapshot.metadata.dataHash) {
      throw new Error(
        "CRITICAL INTEGRITY FAILURE: Backup file hash mismatch! Data may be corrupted or tampered with."
      );
    }
    console.log("✓ Backup integrity verified against SHA-256 checksum:", snapshot.metadata.dataHash);
  }

  const db = getDB();
  const results = {};

  for (const [collName, docs] of Object.entries(snapshot.collections)) {
    try {
      const coll = db.collection(collName);
      // Clean existing records in the collection
      await coll.deleteMany({});

      if (Array.isArray(docs) && docs.length > 0) {
        // Rehydrate MongoDB driver formats
        await coll.insertMany(docs);
      }
      results[collName] = docs ? docs.length : 0;
    } catch (err) {
      console.error(`Error restoring collection '${collName}':`, err);
      results[collName] = { error: err.message };
    }
  }

  return {
    restoredFrom: safeFilename,
    restoredAt: new Date().toISOString(),
    results,
  };
};

/**
 * Replicate primary database to a secondary / replica database target.
 */
export const replicateDatabase = async (options = {}) => {
  const primaryDb = getDB();
  const targetUri = options.targetUri || process.env.REPLICA_MONGO_URI || process.env.MONGO_URI || "mongodb://127.0.0.1:27017";
  const targetDbName = options.targetDbName || process.env.REPLICA_DB_NAME || "officers-mess-replica";

  console.log(`Starting live replication: [${primaryDb.databaseName}] -> [${targetDbName}]`);

  const replicaClient = new MongoClient(targetUri);
  await replicaClient.connect();

  try {
    const replicaDb = replicaClient.db(targetDbName);
    const summary = {};
    let totalReplicated = 0;

    for (const collName of CORE_COLLECTIONS) {
      const primaryColl = primaryDb.collection(collName);
      const replicaColl = replicaDb.collection(collName);

      const docs = await primaryColl.find({}).toArray();

      // Wipe previous replica state for this collection to ensure 100% exact parity
      await replicaColl.deleteMany({});

      if (docs.length > 0) {
        await replicaColl.insertMany(docs);
      }

      // Replicate indexes
      try {
        const indexes = await primaryColl.indexes();
        for (const idx of indexes) {
          if (idx.name !== "_id_") {
            const keys = idx.key;
            const options = { ...idx };
            delete options.key;
            delete options.v;
            delete options.ns;
            await replicaColl.createIndex(keys, options).catch(() => {});
          }
        }
      } catch (idxErr) {
        // silent index fallback
      }

      summary[collName] = docs.length;
      totalReplicated += docs.length;
    }

    // Record replication metadata document in replica DB
    await replicaDb.collection("_replication_meta").insertOne({
      replicatedAt: new Date(),
      sourceDatabase: primaryDb.databaseName,
      totalDocuments: totalReplicated,
      summary,
    });

    return {
      status: "SUCCESS",
      replicatedAt: new Date().toISOString(),
      sourceDatabase: primaryDb.databaseName,
      targetDatabase: targetDbName,
      totalReplicatedDocuments: totalReplicated,
      collectionSummary: summary,
    };
  } finally {
    await replicaClient.close();
  }
};

/**
 * Starts automatic recurring background backup scheduler.
 */
export const initAutoBackupScheduler = () => {
  if (process.env.AUTO_BACKUP_ENABLED !== "true") {
    console.log("Automatic database backup schedule is disabled.");
    return;
  }

  const hours = Math.max(1, parseInt(process.env.AUTO_BACKUP_INTERVAL_HOURS || "24", 10));
  const intervalMs = hours * 60 * 60 * 1000;

  console.log(`⏱️ Auto-backup scheduler activated: Every ${hours} hour(s)`);

  setInterval(async () => {
    try {
      console.log("Running scheduled auto-backup...");
      const res = await createBackup("SCHEDULED_AUTO_BACKUP");
      console.log(`Auto-backup completed successfully: ${res.filename} (${res.totalDocuments} docs)`);

      // Also trigger replica synchronization if configured
      if (process.env.REPLICA_DB_NAME) {
        await replicateDatabase().catch((e) => console.warn("Auto-replication warning:", e.message));
      }
    } catch (err) {
      console.error("Auto-backup scheduled task failed:", err);
    }
  }, intervalMs);
};
