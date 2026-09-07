import express from "express";
import {
  createMess,
  getAllMesses,
  updateMess,
  deleteMess,
  assignPMCToMess,
  createUser,
  createPMC,
  getAllUsers,
  updateUser,
  getAuditLogs,
  exportAuditLogs,
} from "../controllers/adminController.js";
import {
  triggerBackup,
  getBackupsList,
  restoreFromBackup,
  triggerReplication,
  downloadBackupFile,
} from "../controllers/backupController.js";
import { protect } from "../middleware/authMiddleware.js";
import { authorizeRoles } from "../middleware/roleMiddleware.js";

const router = express.Router();

// All admin routes require ADMIN authentication
router.use(protect, authorizeRoles("ADMIN"));

// Mess management
router.post("/messes", createMess);
router.get("/messes", getAllMesses);
router.patch("/messes/:messId", updateMess);
router.delete("/messes/:messId", deleteMess);
router.patch("/messes/:messId/pmc", assignPMCToMess);

// User and PMC management
router.post("/pmcs", createPMC);
router.post("/users", createUser);
router.get("/users", getAllUsers);
router.patch("/users/:userId", updateUser);

// Audit & API Monitoring Logs
router.get("/audit-logs", getAuditLogs);
router.get("/audit-logs/export", exportAuditLogs);

// Database Replication & Backups
router.post("/backups", triggerBackup);
router.get("/backups", getBackupsList);
router.post("/backups/restore", restoreFromBackup);
router.post("/backups/replicate", triggerReplication);
router.get("/backups/download/:filename", downloadBackupFile);

export default router;

