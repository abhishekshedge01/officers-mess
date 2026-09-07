import express from "express";
import {
  getMyMess,
  updateManager,
  updateSecretary,
  changePMCPassword,
  getPMCBookings,
} from "../controllers/pmcController.js";
import { protect } from "../middleware/authMiddleware.js";
import { authorizeRoles } from "../middleware/roleMiddleware.js";

const router = express.Router();

// PMC operations (read-only for booking monitoring)
router.use(protect, authorizeRoles("PMC"));

router.get("/my-mess", getMyMess);
router.patch("/my-mess/manager", updateManager);
router.patch("/my-mess/secretary", updateSecretary);
router.patch("/password", changePMCPassword);
router.get("/bookings", getPMCBookings);

export default router;
