// tests/backup-replication-test.mjs
import { MongoClient } from "mongodb";
import dotenv from "dotenv";
import {
  createBackup,
  listBackups,
  replicateDatabase,
  restoreBackup,
} from "../services/backupService.js";
import { connectDB, getDB } from "../config/db.js";

dotenv.config();

async function runTest() {
  console.log("=== STARTING DATABASE BACKUP & REPLICATION VERIFICATION ===");

  await connectDB();
  const db = getDB();

  // Test 1: Trigger snapshot backup
  console.log("\n1. Testing point-in-time snapshot backup creation...");
  const backupRes = await createBackup("TEST_RUN");
  console.log(`✓ Backup created: ${backupRes.filename}`);
  console.log(`  Size: ${backupRes.fileSizeKB} KB | Documents: ${backupRes.totalDocuments} | Collections: ${backupRes.totalCollections}`);

  // Test 2: List backups
  console.log("\n2. Testing backup file listing...");
  const backups = await listBackups();
  console.log(`✓ Total backups discovered: ${backups.length}`);
  const found = backups.find((b) => b.filename === backupRes.filename);
  if (!found) throw new Error("Newly created backup not returned in listing!");
  console.log(`✓ Verified backup metadata presence: ${found.filename}`);

  // Test 3: Test live database replication
  console.log("\n3. Testing live replica database synchronization...");
  const targetDbName = "officers-mess-test-replica";
  const repRes = await replicateDatabase({ targetDbName });
  console.log(`✓ Replication complete to '${targetDbName}'!`);
  console.log(`  Total Replicated Documents: ${repRes.totalReplicatedDocuments}`);

  // Verify contents in replica DB directly
  const replicaClient = new MongoClient(process.env.MONGO_URI || "mongodb://127.0.0.1:27017");
  await replicaClient.connect();
  const repDb = replicaClient.db(targetDbName);
  const repUsersCount = await repDb.collection("users").countDocuments();
  const primUsersCount = await db.collection("users").countDocuments();
  console.log(`✓ Primary users: ${primUsersCount} | Replica users: ${repUsersCount}`);
  if (repUsersCount !== primUsersCount) {
    throw new Error(`Data mismatch between primary (${primUsersCount}) and replica (${repUsersCount})!`);
  }

  // Cleanup test replica DB
  await repDb.dropDatabase();
  await replicaClient.close();
  console.log("✓ Test replica database verified and cleaned up.");

  console.log("\n=== ALL BACKUP & REPLICATION TESTS PASSED SUCCESSFULLY ===");
  process.exit(0);
}

runTest().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
