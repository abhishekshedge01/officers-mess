import express from "express";
import {
  createRoom,
  getRooms,
  updateRoom,
  getAvailableRooms,
  getOccupancy,
} from "../controllers/roomController.js";
import { protect } from "../middleware/authMiddleware.js";
import { authorizeRoles } from "../middleware/roleMiddleware.js";

const router = express.Router();

// Public / unauthenticated room availability check
router.get("/available", getAvailableRooms);

// Occupancy grid for staff and management
router.get(
  "/occupancy",
  protect,
  authorizeRoles("MESS_MANAGER", "MESS_SECRETARY", "PMC", "ADMIN"),
  getOccupancy,
);

// View mess rooms (Manager, Secretary, PMC)
router.get(
  "/",
  protect,
  authorizeRoles("MESS_MANAGER", "MESS_SECRETARY", "PMC"),
  getRooms,
);

// Room creation and updates (Manager only)
router.post("/", protect, authorizeRoles("MESS_MANAGER"), createRoom);
router.patch("/:roomId", protect, authorizeRoles("MESS_MANAGER"), updateRoom);

export default router;
