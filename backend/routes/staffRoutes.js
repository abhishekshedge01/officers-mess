import express from "express";
import {
  addBookingCharge,
  getBookingCharges,
} from "../controllers/staffController.js";
import { protect } from "../middleware/authMiddleware.js";
import { authorizeRoles } from "../middleware/roleMiddleware.js";

const router = express.Router();

// Additional booking charges managed by Mess Manager and Secretary
router.use(protect, authorizeRoles("MESS_MANAGER", "MESS_SECRETARY"));

router.post("/bookings/:bookingId/charges", addBookingCharge);
router.get("/bookings/:bookingId/charges", getBookingCharges);

export default router;
