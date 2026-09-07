import express from "express";
import {
  getMyProfile,
  updateMyProfile,
  changePassword,
  getMyMess,
  getManagerBookings,
  approveBooking,
  rejectBooking,
} from "../controllers/managerController.js";
import { protect } from "../middleware/authMiddleware.js";
import { authorizeRoles } from "../middleware/roleMiddleware.js";

const router = express.Router();

// Mess Manager operations
router.use(protect, authorizeRoles("MESS_MANAGER"));

router.get("/profile", getMyProfile);
router.patch("/profile", updateMyProfile);
router.patch("/password", changePassword);
router.get("/my-mess", getMyMess);
router.get("/bookings", getManagerBookings);
router.patch("/bookings/:bookingId/approve", approveBooking);
router.patch("/bookings/:bookingId/reject", rejectBooking);

export default router;
