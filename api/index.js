import app from "../backend/server.js";
import { connectDB } from "../backend/config/db.js";

export default async function handler(req, res) {
  try {
    // Ensure database is connected on serverless cold-start
    await connectDB();
    return app(req, res);
  } catch (err) {
    console.error("SERVERLESS HANDLER ERROR:", err);
    return res.status(500).json({
      error: "SERVERLESS_INIT_ERROR",
      message: err.message,
      stack: err.stack,
    });
  }
}
