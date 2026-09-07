// scripts/restore-db.js
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { connectDB } from "../config/db.js";
import { listBackups, restoreBackup } from "../services/backupService.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function run() {
  console.log("==================================================");
  console.log("OFFICERS MESS - OFFLINE DATABASE RESTORE UTILITY");
  console.log("==================================================");

  await connectDB();

  const backups = await listBackups();
  if (!backups.length) {
    console.error("❌ No backup JSON files found in backend/backups/");
    process.exit(1);
  }

  // Pick target file (from argument or latest backup)
  const argFile = process.argv[2];
  const target = argFile ? path.basename(argFile) : backups[0].filename;

  console.log(`\nRestoring database from snapshot: ${target}...`);

  try {
    const result = await restoreBackup(target);
    console.log("✅ Database restoration completed successfully!");
    console.log(`Timestamp: ${result.restoredAt}`);
    console.log("\nRestored Collections & Document Counts:");
    console.table(result.results);
    console.log("\nYour MongoDB database 'officers-mess' is fully populated and ready!");
    process.exit(0);
  } catch (error) {
    console.error("❌ Restore failed:", error.message);
    process.exit(1);
  }
}

run();
