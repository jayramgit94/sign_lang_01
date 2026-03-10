/**
 * Auth Routes
 */
import { Router } from "express";
import {
  getMe,
  login,
  logout,
  refresh,
  register,
} from "../controllers/auth.controller.js";
import { optionalAuth, requireAuth } from "../middleware/auth.js";
import { authLimiter } from "../middleware/rateLimiter.js";
import { validate } from "../middleware/validate.js";
import { loginSchema, registerSchema } from "../validators/auth.validator.js";

const router = Router();

router.post("/register", authLimiter, validate(registerSchema), register);
router.post("/login", authLimiter, validate(loginSchema), login);
router.post("/refresh", refresh);
router.post("/logout", optionalAuth, logout);
router.get("/me", requireAuth, getMe);

export default router;
