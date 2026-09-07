import express from "express";
import { getMessRevenue } from "../controllers/revenueController.js";
import { protect } from "../middleware/authMiddleware.js";
import { authorizeRoles } from "../middleware/roleMiddleware.js";

const router = express.Router();

// Mess revenue overview for Mess Manager, PMC, and Secretary
router.get(
  "/overview",
  protect,
  authorizeRoles("MESS_MANAGER", "PMC", "MESS_SECRETARY"),
  getMessRevenue,
);

export default router;
