import express from "express";
import {
  getMyProfile,
  updateMyProfile,
  changePassword,
} from "../controllers/userController.js";
import { protect } from "../middleware/authMiddleware.js";
import { authorizeRoles } from "../middleware/roleMiddleware.js";

const router = express.Router();

// All logged-in users can manage their own profile and password
router.use(
  protect,
  authorizeRoles("USER", "ADMIN", "PMC", "MESS_MANAGER", "MESS_SECRETARY"),
);

router.get("/profile", getMyProfile);
router.patch("/profile", updateMyProfile);
router.patch("/password", changePassword);

export default router;
