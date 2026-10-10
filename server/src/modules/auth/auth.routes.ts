import { Router } from "express";
import { authenticate } from "../../middleware/authenticate";
import { authLimiter, registerLimiter } from "../../middleware/rateLimit";
import * as authController from "./auth.controller";

const router = Router();

// Public
router.post("/register", registerLimiter, authController.register);
router.post("/login", authLimiter, authController.login);
router.post("/refresh", authLimiter, authController.refresh);
router.post("/logout", authController.logout);

// Protected
router.get("/me", authenticate, authController.me);

export default router;
