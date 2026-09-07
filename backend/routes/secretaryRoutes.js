import express from "express";
import {
  getMyMess,
  getMyProfile,
  updateMyProfile,
  changePassword,
} from "../controllers/secretaryController.js";
import { getMessBookings } from "../controllers/bookingController.js";
import { protect } from "../middleware/authMiddleware.js";
import { authorizeRoles } from "../middleware/roleMiddleware.js";

const router = express.Router();

// Mess Secretary operations (read-only for booking monitoring)
router.use(protect, authorizeRoles("MESS_SECRETARY"));

router.get("/my-mess", getMyMess);
router.get("/profile", getMyProfile);
router.patch("/profile", updateMyProfile);
router.patch("/password", changePassword);
router.get("/bookings", getMessBookings);

export default router;
