import express from "express";
import { addBookingCharge } from "../controllers/staffController.js";
import { protect } from "../middleware/authMiddleware.js";
import { authorizeRoles } from "../middleware/roleMiddleware.js";

const router = express.Router();

// Test route for manager booking charge updates
router.use(protect, authorizeRoles("MESS_MANAGER"));
router.patch("/bookings/:bookingId/charges", addBookingCharge);

export default router;
