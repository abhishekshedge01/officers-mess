import express from "express";
import {
  allocateBooking,
  getBookingAllocation,
} from "../controllers/allocationController.js";
import { protect } from "../middleware/authMiddleware.js";
import { authorizeRoles } from "../middleware/roleMiddleware.js";

const router = express.Router();

// View room allocation details
router.get(
  "/bookings/:bookingId",
  protect,
  authorizeRoles("USER", "MESS_MANAGER", "MESS_SECRETARY", "PMC"),
  getBookingAllocation,
);

// Room allocation action (Mess Manager only)
router.post(
  "/bookings/:bookingId/allocate",
  protect,
  authorizeRoles("MESS_MANAGER"),
  allocateBooking,
);

export default router;
