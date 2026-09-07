import express from "express";
import {
  createMess,
  getAllMesses,
  getMessesByCity,
  getMessById,
  assignMessStaff,
} from "../controllers/messController.js";
import { protect } from "../middleware/authMiddleware.js";
import { authorizeRoles } from "../middleware/roleMiddleware.js";

const router = express.Router();

// Public mess lookups
router.get("/", getAllMesses);
router.get("/city/:city", getMessesByCity);
router.get("/:id", getMessById);

// Admin mess administration
router.post("/", protect, authorizeRoles("ADMIN"), createMess);
router.post("/assign-staff", protect, authorizeRoles("ADMIN"), assignMessStaff);

export default router;
