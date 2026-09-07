// scripts/test-auth.js
import { MongoClient } from "mongodb";

const user = "rishikeshtechofficial_db_user";
const pass = "Rishi@Shedge@2006@2005";
const host = "mainprojectsdb.cby2tqt.mongodb.net";

// Test variations of authSource and password encoding
const tests = [
  { name: "Default Atlas SRV", uri: `mongodb+srv://${encodeURIComponent(user)}:${encodeURIComponent(pass)}@${host}/?retryWrites=true&w=majority` },
  { name: "With /admin authSource", uri: `mongodb+srv://${encodeURIComponent(user)}:${encodeURIComponent(pass)}@${host}/admin?retryWrites=true&w=majority` },
  { name: "Explicit authSource=admin param", uri: `mongodb+srv://${encodeURIComponent(user)}:${encodeURIComponent(pass)}@${host}/?retryWrites=true&w=majority&authSource=admin` },
  { name: "Raw Unencoded Pass", uri: `mongodb+srv://${user}:${pass}@${host}/?retryWrites=true&w=majority` },
];

async function run() {
  for (const t of tests) {
    console.log(`Testing: ${t.name}...`);
    const c = new MongoClient(t.uri, { serverSelectionTimeoutMS: 5000 });
    try {
      await c.connect();
      console.log(`✅ SUCCESS with: ${t.name}!`);
      await c.close();
      return t.uri;
    } catch (err) {
      console.log(`  ❌ Failed: ${err.message}`);
    }
  }
}

run();
