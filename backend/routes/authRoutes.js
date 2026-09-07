import express from "express";
import {
  register,
  login,
  logout,
  refreshToken,
  getRevokedTokens,
  revokeTokenManually,
} from "../controllers/authController.js";
import { protect } from "../middleware/authMiddleware.js";

const router = express.Router();

// Public authentication routes — no JWT required.
router.post("/register", register);
router.post("/login", login);
router.post("/refresh", refreshToken);

// Protected routes
router.post("/logout", protect, logout);
router.get("/revoked-tokens", protect, getRevokedTokens);
router.post("/revoke-token", protect, revokeTokenManually);

export default router;
