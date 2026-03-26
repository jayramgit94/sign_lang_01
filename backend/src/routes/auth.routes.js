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
  verifyEmail,
  forgotPassword,
  resetPassword,
  getAuditLogsAdmin,
} from "../controllers/auth.controller.js";
import { optionalAuth, requireAuth } from "../middleware/auth.js";
import { authLimiter } from "../middleware/rateLimiter.js";
import { validate } from "../middleware/validate.js";
import {
  loginSchema,
  registerSchema,
  verifyEmailSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
} from "../validators/auth.validator.js";
import { csrfProtection, verifyCsrfToken } from "../middleware/csrf.js";

const router = Router();

// CSRF protection on state-changing endpoints
router.use(csrfProtection);
router.use(verifyCsrfToken);

// Bootstrap endpoint for SPA clients to read XSRF cookie token
router.get("/csrf-token", (req, res) => {
  res.status(200).json({ csrfToken: req.csrfToken });
});

router.post("/register", authLimiter, validate(registerSchema), register);
router.post("/login", authLimiter, validate(loginSchema), login);
router.post("/refresh", refresh);
router.post("/logout", optionalAuth, logout);
router.post("/verify-email", validate(verifyEmailSchema), verifyEmail);
router.post(
  "/forgot-password",
  authLimiter,
  validate(forgotPasswordSchema),
  forgotPassword,
);
router.post(
  "/reset-password",
  authLimiter,
  validate(resetPasswordSchema),
  resetPassword,
);
router.get("/me", requireAuth, getMe);
router.get("/audit-logs", requireAuth, getAuditLogsAdmin);

export default router;
