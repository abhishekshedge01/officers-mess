import dotenv from "dotenv";
dotenv.config();

import express from "express";
import cors from "cors";
import http from "http";
import https from "https";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { connectDB } from "./config/db.js";
import { initAutoBackupScheduler } from "./services/backupService.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Import API route modules
import authRoutes from "./routes/authRoutes.js";
import adminRoutes from "./routes/adminRoutes.js";
import pmcRoutes from "./routes/pmcRoutes.js";
import managerRoutes from "./routes/managerRoutes.js";
import secretaryRoutes from "./routes/secretaryRoutes.js";
import bookingRoutes from "./routes/bookingRoutes.js";
import roomRoutes from "./routes/roomRoutes.js";
import paymentRoutes from "./routes/paymentRoutes.js";
import dashboardRoutes from "./routes/dashboardRoutes.js";
import messRoutes from "./routes/messRoutes.js";
import notificationRoutes from "./routes/notificationRoutes.js";
import userRoutes from "./routes/userRoutes.js";
import staffRoutes from "./routes/staffRoutes.js";
import testRoutes from "./routes/testRoutes.js";
import allocationRoutes from "./routes/allocationRoutes.js";
import revenueRoutes from "./routes/revenueRoutes.js";
import { auditLogger } from "./middleware/auditMiddleware.js";

const app = express();

// Global middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(auditLogger);

// Health check endpoint
app.get("/", (req, res) => {
  res.json({ message: "Officers Mess API Running" });
});

// API Routes
app.use("/api/auth", authRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/pmc", pmcRoutes);
app.use("/api/manager", managerRoutes);
app.use("/api/secretary", secretaryRoutes);
app.use("/api/bookings", bookingRoutes);
app.use("/api/rooms", roomRoutes);
app.use("/api/payments", paymentRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/messes", messRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/users", userRoutes);
app.use("/api/staff", staffRoutes);
app.use("/api/test", testRoutes);
app.use("/api/allocations", allocationRoutes);
app.use("/api/revenue", revenueRoutes);

// Catch-all 404 handler
app.use((req, res) => {
  res
    .status(404)
    .json({ message: "API route not found", path: req.originalUrl });
});

// Global error handler
app.use((error, req, res, next) => {
  console.error("SERVER ERROR:", error);
  res.status(500).json({ message: "Internal server error" });
});

/**
 * Connect to database and start HTTP/HTTPS server.
 */
const startServer = async () => {
  await connectDB();
  const PORT = parseInt(process.env.PORT || "8000", 10);
  const HTTPS_PORT = parseInt(process.env.HTTPS_PORT || "8443", 10);
  const useHttps = process.env.USE_HTTPS === "true";

  // Always start HTTP listener
  const httpServer = http.createServer(app);
  httpServer.listen(PORT, () => {
    console.log(`🌐 HTTP Server running on http://localhost:${PORT}`);
  });

  // Check and start HTTPS server if enabled and certificates are found
  if (useHttps) {
    const keyPath = path.resolve(__dirname, process.env.SSL_KEY_PATH || "./ssl/server.key");
    const certPath = path.resolve(__dirname, process.env.SSL_CERT_PATH || "./ssl/server.cert");

    if (fs.existsSync(keyPath) && fs.existsSync(certPath)) {
      try {
        const sslOptions = {
          key: fs.readFileSync(keyPath),
          cert: fs.readFileSync(certPath),
        };

        const httpsServer = https.createServer(sslOptions, app);
        httpsServer.listen(HTTPS_PORT, () => {
          console.log(`🔒 Secure HTTPS Server running on https://localhost:${HTTPS_PORT}`);
        });
      } catch (sslErr) {
        console.error("⚠️ Failed to start HTTPS server:", sslErr.message);
      }
    } else {
      console.warn("⚠️ SSL certificates not found at", keyPath, "or", certPath);
      console.warn("Run 'npm run generate:ssl' to generate your local self-signed certificates.");
    }
  }

  // Activate automated background backup scheduler
  initAutoBackupScheduler();
};

// Start standalone server only when executed directly (not when imported in serverless)
if (process.env.NODE_ENV !== "test" && !process.env.VERCEL) {
  startServer();
}

export default app;
