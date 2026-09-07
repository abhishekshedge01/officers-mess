import express from "express";
import {
  getBill,
  getMyBills,
  createPaymentOrder,
  verifyPayment,
  downloadInvoice,
  downloadReceipt,
  downloadMealReceipt,
  settleDemoPayment,
} from "../controllers/paymentController.js";
import { protect } from "../middleware/authMiddleware.js";

const router = express.Router();

// All payment/billing routes require authentication
router.use(protect);

router.get("/bills/my", getMyBills);
router.get("/bills/:billId", getBill);
router.post("/bills/:billId/order", createPaymentOrder);
router.post("/bills/:billId/settle-demo", settleDemoPayment);
router.post("/verify", verifyPayment);
router.get("/bills/:billId/invoice", downloadInvoice);
router.get("/bills/:billId/receipt", downloadReceipt);
router.get("/bills/:billId/meal-receipt", downloadMealReceipt);

export default router;

