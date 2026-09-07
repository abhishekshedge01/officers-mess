// controllers/backupController.js
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import {
  createBackup,
  listBackups,
  restoreBackup,
  replicateDatabase,
} from "../services/backupService.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BACKUP_DIR = path.resolve(
  __dirname,
  "..",
  process.env.BACKUP_DIR || "./backups"
);

/**
 * Trigger an immediate point-in-time snapshot backup of the database.
 */
export const triggerBackup = async (req, res) => {
  try {
    const { reason } = req.body || {};
    const result = await createBackup(reason || `MANUAL_ADMIN_${req.user?.rank || ""}_${req.user?.name || ""}`);
    return res.status(201).json({
      message: "Database backup created successfully",
      backup: result,
    });
  } catch (error) {
    console.error("TRIGGER BACKUP ERROR:", error);
    return res.status(500).json({ message: error.message || "Failed to create backup" });
  }
};

/**
 * List all available backups.
 */
export const getBackupsList = async (req, res) => {
  try {
    const backups = await listBackups();
    return res.status(200).json({
      total: backups.length,
      backups,
      replicaConfig: {
        replicaDbName: process.env.REPLICA_DB_NAME || "officers-mess-replica",
        autoBackupEnabled: process.env.AUTO_BACKUP_ENABLED === "true",
        intervalHours: process.env.AUTO_BACKUP_INTERVAL_HOURS || "24",
      },
    });
  } catch (error) {
    console.error("GET BACKUPS LIST ERROR:", error);
    return res.status(500).json({ message: "Failed to list backups" });
  }
};

/**
 * Restore database from a given backup file.
 */
export const restoreFromBackup = async (req, res) => {
  try {
    const { filename } = req.body || {};
    if (!filename) {
      return res.status(400).json({ message: "Backup filename is required for restore" });
    }

    const result = await restoreBackup(filename);
    return res.status(200).json({
      message: `Database successfully restored from ${filename}`,
      result,
    });
  } catch (error) {
    console.error("RESTORE BACKUP ERROR:", error);
    return res.status(500).json({ message: error.message || "Failed to restore backup" });
  }
};

/**
 * Trigger live replication from primary database to backup replica database.
 */
export const triggerReplication = async (req, res) => {
  try {
    const { targetUri, targetDbName } = req.body || {};
    const result = await replicateDatabase({ targetUri, targetDbName });
    return res.status(200).json({
      message: `Database replication to '${result.targetDatabase}' completed successfully`,
      replication: result,
    });
  } catch (error) {
    console.error("TRIGGER REPLICATION ERROR:", error);
    return res.status(500).json({ message: error.message || "Replication failed" });
  }
};

/**
 * Download a specific backup file.
 */
export const downloadBackupFile = async (req, res) => {
  try {
    const { filename } = req.params;
    const safeFilename = path.basename(filename);
    const filePath = path.join(BACKUP_DIR, safeFilename);

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ message: "Backup file not found" });
    }

    res.download(filePath, safeFilename);
  } catch (error) {
    console.error("DOWNLOAD BACKUP ERROR:", error);
    return res.status(500).json({ message: "Failed to download backup file" });
  }
};
