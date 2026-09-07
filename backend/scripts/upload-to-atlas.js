// scripts/upload-to-atlas.js
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { MongoClient } from "mongodb";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const user = "rishikeshtechofficial_db_user";
const password = "OfficersMess2026";
const clusterHost = "mainprojectsdb.cby2tqt.mongodb.net";
const dbName = "officers-mess";

const uri = `mongodb+srv://${user}:${password}@${clusterHost}/${dbName}?retryWrites=true&w=majority`;

const backupsDir = path.resolve(__dirname, "..", "backups");

async function upload() {
  console.log("==================================================");
  console.log("UPLOADING LOCAL DATABASE TO MONGODB ATLAS CLOUD");
  console.log("==================================================");
  console.log(`Connecting to: ${clusterHost}...`);

  const client = new MongoClient(uri, {
    serverSelectionTimeoutMS: 20000,
  });

  try {
    await client.connect();
    console.log("✅ Successfully authenticated and connected to MongoDB Atlas!");

    const db = client.db(dbName);

    // Pick latest backup snapshot
    const files = fs.readdirSync(backupsDir).filter((f) => f.endsWith(".json"));
    if (!files.length) {
      throw new Error("No backup snapshots found in backend/backups/");
    }

    files.sort().reverse();
    const targetFile = path.join(backupsDir, files[0]);
    console.log(`Loading snapshot archive: ${files[0]}...`);

    const snapshot = JSON.parse(fs.readFileSync(targetFile, "utf8"));
    const collections = snapshot.collections || {};

    let totalDocs = 0;
    const summary = {};

    for (const [collName, docs] of Object.entries(collections)) {
      if (!Array.isArray(docs)) continue;

      const coll = db.collection(collName);
      await coll.deleteMany({});

      if (docs.length > 0) {
        await coll.insertMany(docs);
      }

      summary[collName] = docs.length;
      totalDocs += docs.length;
      console.log(`  ✓ Uploaded '${collName}': ${docs.length} documents`);
    }

    console.log("\nSetting up database indexes on Atlas...");
    await Promise.all([
      db.collection("users").createIndex({ email: 1 }, { unique: true }),
      db.collection("rooms").createIndex({ messId: 1, roomNumber: 1 }, { unique: true }),
      db.collection("bookings").createIndex({ messId: 1, checkInDate: 1, checkOutDate: 1, status: 1 }),
      db.collection("bills").createIndex({ bookingId: 1 }, { unique: true }),
      db.collection("sessions").createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
      db.collection("refresh_tokens").createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
      db.collection("revoked_tokens").createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
    ]);

    console.log("✅ Indexes configured successfully on Atlas!");
    console.log("\n==================================================");
    console.log(`🎉 SUCCESS! Uploaded ${totalDocs} documents across ${Object.keys(summary).length} collections to Atlas!`);
    console.log("==================================================");
  } catch (err) {
    console.error("❌ Upload error:", err.message);
    process.exit(1);
  } finally {
    await client.close();
  }
}

upload();
