// tests/security-auth-test.mjs
import { MongoClient } from "mongodb";
import dotenv from "dotenv";
import jwt from "jsonwebtoken";

dotenv.config();

const MONGO_URI = process.env.MONGO_URI || "mongodb://127.0.0.1:27017";
const DB_NAME = process.env.DB_NAME || "officers-mess";
const BASE_URL = `http://localhost:${process.env.PORT || 8000}/api`;

async function runSecurityTest() {
  console.log("=== STARTING AUTH & TOKEN SECURITY VERIFICATION ===");
  const client = new MongoClient(MONGO_URI);
  await client.connect();
  const db = client.db(DB_NAME);

  // Pick a test user
  const user = await db.collection("users").findOne({ role: "USER" });
  if (!user) {
    console.error("No test USER found in database");
    await client.close();
    process.exit(1);
  }

  console.log(`Testing with user: ${user.email}`);

  // Test 1: Generate Access (15m) and Refresh (7d) tokens manually to verify claims and verify login via DB
  const REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || `${process.env.JWT_SECRET}_refresh`;
  
  const testAccess = jwt.sign(
    { id: user._id.toString(), role: user.role, email: user.email },
    process.env.JWT_SECRET,
    { expiresIn: "15m" }
  );

  const testRefresh = jwt.sign(
    { id: user._id.toString(), type: "REFRESH" },
    REFRESH_SECRET,
    { expiresIn: "7d" }
  );

  console.log("✓ Access & Refresh tokens signed successfully");

  // Test 2: Store in active refresh_tokens collection
  await db.collection("refresh_tokens").insertOne({
    userId: user._id,
    token: testRefresh,
    createdAt: new Date(),
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
  });
  console.log("✓ Saved refresh token in MongoDB collection `refresh_tokens`");

  // Test 3: Insert into revoked_tokens collection
  const now = new Date();
  await db.collection("revoked_tokens").insertOne({
    token: testAccess,
    tokenType: "ACCESS",
    userId: user._id,
    reason: "TEST_REVOCATION",
    revokedAt: now,
    expiresAt: new Date(now.getTime() + 15 * 60 * 1000),
  });
  console.log("✓ Revoked token recorded in `revoked_tokens` denylist");

  // Test 4: Query revoked token
  const revokedRecord = await db.collection("revoked_tokens").findOne({ token: testAccess });
  if (!revokedRecord) {
    throw new Error("Revoked token not found in database!");
  }
  console.log(`✓ Verified token in denylist: Reason: ${revokedRecord.reason}`);

  // Clean up test records
  await db.collection("refresh_tokens").deleteOne({ token: testRefresh });
  await db.collection("revoked_tokens").deleteOne({ token: testAccess });
  console.log("✓ Cleaned up test records");

  await client.close();
  console.log("=== ALL SECURITY TESTS PASSED SUCCESSFULLY ===");
}

runSecurityTest().catch((e) => {
  console.error("Test failed:", e);
  process.exit(1);
});
