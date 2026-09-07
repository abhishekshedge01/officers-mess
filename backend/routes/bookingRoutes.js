import express from "express";
import {
  createBooking,
  getMyBookings,
  getBookingById,
  cancelBooking,
  getMessBookings,
  checkIn,
  requestCheckout,
  checkOut,
} from "../controllers/bookingController.js";
import { protect } from "../middleware/authMiddleware.js";
import { authorizeRoles } from "../middleware/roleMiddleware.js";

const router = express.Router();

// User booking actions
router.post("/", protect, authorizeRoles("USER"), createBooking);
router.get("/my", protect, authorizeRoles("USER"), getMyBookings);
router.get("/:bookingId", protect, getBookingById);
router.patch(
  "/:bookingId/cancel",
  protect,
  authorizeRoles("USER"),
  cancelBooking,
);
router.patch(
  "/:bookingId/request-checkout",
  protect,
  authorizeRoles("USER"),
  requestCheckout,
);

// Mess bookings monitoring & operations
router.get(
  "/mess/all",
  protect,
  authorizeRoles("MESS_MANAGER", "MESS_SECRETARY", "PMC"),
  getMessBookings,
);
router.patch(
  "/:bookingId/check-in",
  protect,
  authorizeRoles("MESS_MANAGER"),
  checkIn,
);
router.patch(
  "/:bookingId/check-out",
  protect,
  authorizeRoles("MESS_MANAGER"),
  checkOut,
);

export default router;
