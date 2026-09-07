import app from "../backend/server.js";
import { connectDB } from "../backend/config/db.js";

export default async function handler(req, res) {
  // Ensure database is connected on serverless cold-start
  await connectDB();
  return app(req, res);
}
