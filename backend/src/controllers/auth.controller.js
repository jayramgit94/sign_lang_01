/**
 * Auth Controller — Registration, Login, Token Refresh, Logout.
 * Uses JWT with httpOnly cookies.
 */
import { User } from "../models/user.model.js";
import {
  clearTokenCookies,
  generateAccessToken,
  generateRefreshToken,
  generateTokenPair,
  setTokenCookies,
  verifyRefreshToken,
} from "../services/jwt.service.js";
import { getAuditLogs, logAudit } from "../services/audit.service.js";
import {
  isEmailServiceConfigured,
  sendPasswordResetEmail,
} from "../services/email.service.js";
import config from "../config/index.js";
import crypto from "crypto";
import { getClientIpFromRequest } from "../utils/clientIp.js";

/**
 * POST /api/v1/auth/register
 */
export const register = async (req, res, next) => {
  try {
    const { name, username, password, email } = req.body;
    const normalizedEmail = email?.trim().toLowerCase();

    // Check if username already exists
    const existing = await User.findOne({ username });
    if (existing) {
      await logAudit({
        username,
        action: "register",
        resource: "user",
        ip: getClientIpFromRequest(req),
        userAgent: req.headers["user-agent"],
        success: false,
        details: "Username already taken",
      });
      return res.status(409).json({
        message: "This username is already registered.",
        code: "USERNAME_TAKEN",
      });
    }

    // Check if email already exists
    if (normalizedEmail) {
      const existingEmail = await User.findOne({ email: normalizedEmail });
      if (existingEmail) {
        await logAudit({
          username,
          action: "register",
          resource: "user",
          ip: getClientIpFromRequest(req),
          userAgent: req.headers["user-agent"],
          success: false,
          details: "Email already registered",
        });
        return res.status(409).json({
          message: "This email is already registered.",
          code: "EMAIL_ALREADY_REGISTERED",
        });
      }
    }

    // Create user (password hashing is handled by pre-save hook)
    const user = await User.create({
      name,
      username,
      email: normalizedEmail,
      password,
    });

    // Generate email verification token only when email is provided
    const emailVerificationToken = normalizedEmail
      ? user.generateEmailVerificationToken()
      : undefined;
    await user.save();

    // Generate tokens (account starts unverified but can login)
    const tokens = generateTokenPair(user);
    user.refreshToken = tokens.refreshToken;
    await user.save();

    // Set cookies
    setTokenCookies(res, tokens.accessToken, tokens.refreshToken);

    await logAudit({
      userId: user._id,
      username: user.username,
      action: "register",
      resource: "user",
      ip: getClientIpFromRequest(req),
      userAgent: req.headers["user-agent"],
      success: true,
      details: "User registration successful",
    });

    res.status(201).json({
      message: normalizedEmail
        ? "Registration successful. Please verify your email."
        : "Registration successful.",
      user: user.toJSON(),
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      emailVerificationToken, // Send to frontend to trigger verification email
    });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/v1/auth/login
 */
export const login = async (req, res, next) => {
  try {
    const { username, password } = req.body;
    const clientIp = getClientIpFromRequest(req);

    const user = await User.findOne({ username });
    if (!user) {
      await logAudit({
        username,
        action: "login",
        resource: "user",
        ip: clientIp,
        userAgent: req.headers["user-agent"],
        success: false,
        details: "User not found",
      });
      return res.status(404).json({
        message: "No account found with this username.",
        code: "USER_NOT_FOUND",
      });
    }

    // Check if account is locked
    if (user.isLocked()) {
      await logAudit({
        userId: user._id,
        username: user.username,
        action: "login",
        resource: "user",
        ip: clientIp,
        userAgent: req.headers["user-agent"],
        success: false,
        details: "Account locked due to too many failed login attempts",
      });
      return res.status(403).json({
        message:
          "Account locked due to too many failed login attempts. Try again in 30 minutes.",
        code: "ACCOUNT_LOCKED",
      });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      // Increment failed login attempts
      await user.incrementLoginAttempts();

      await logAudit({
        userId: user._id,
        username: user.username,
        action: "login",
        resource: "user",
        ip: clientIp,
        userAgent: req.headers["user-agent"],
        success: false,
        details: `Invalid password. Attempt ${user.loginAttempts + 1} of 5`,
      });

      return res.status(401).json({
        message: "Incorrect password.",
        code: "WRONG_PASSWORD",
        attemptsRemaining: 5 - (user.loginAttempts + 1),
      });
    }

    // Reset login attempts on successful login
    if (user.loginAttempts > 0) {
      await user.resetLoginAttempts();
    }

    // Update last login info
    user.lastLoginAt = new Date();
    user.lastLoginIP = clientIp;

    // Generate tokens
    const tokens = generateTokenPair(user);

    // Store refresh token
    user.refreshToken = tokens.refreshToken;
    await user.save();

    // Set cookies
    setTokenCookies(res, tokens.accessToken, tokens.refreshToken);

    await logAudit({
      userId: user._id,
      username: user.username,
      action: "login",
      resource: "user",
      ip: clientIp,
      userAgent: req.headers["user-agent"],
      success: true,
      details: "Successful login",
    });

    res.status(200).json({
      message: "Login successful.",
      user: user.toJSON(),
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/v1/auth/refresh
 */
export const refresh = async (req, res, next) => {
  try {
    // Accept refresh token from cookie or request body (cross-origin fallback)
    const refreshToken = req.cookies?.refreshToken || req.body?.refreshToken;

    if (!refreshToken) {
      return res.status(401).json({ message: "No refresh token." });
    }

    const decoded = verifyRefreshToken(refreshToken);
    if (!decoded) {
      return res.status(401).json({ message: "Invalid refresh token." });
    }

    // Find user and verify stored refresh token matches
    const user = await User.findById(decoded.userId);
    if (!user || user.refreshToken !== refreshToken) {
      return res.status(401).json({ message: "Token reuse detected." });
    }

    // Generate new tokens (rotation — old refresh token is invalidated)
    const newAccessToken = generateAccessToken({
      userId: user._id.toString(),
      username: user.username,
    });
    const newRefreshToken = generateRefreshToken({
      userId: user._id.toString(),
      username: user.username,
    });

    user.refreshToken = newRefreshToken;
    await user.save();

    setTokenCookies(res, newAccessToken, newRefreshToken);

    res.status(200).json({
      message: "Token refreshed.",
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/v1/auth/logout
 */
export const logout = async (req, res, next) => {
  try {
    // Clear refresh token in DB if user is authenticated
    if (req.user?.userId) {
      await User.findByIdAndUpdate(req.user.userId, { refreshToken: null });
    }

    clearTokenCookies(res);
    res.status(200).json({ message: "Logged out." });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/v1/auth/me — Get current user info.
 */
export const getMe = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.userId).select(
      "-password -refreshToken",
    );
    if (!user) {
      return res.status(404).json({ message: "User not found." });
    }
    res.status(200).json({ user });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/v1/auth/verify-email
 * Verify email with token from registration
 */
export const verifyEmail = async (req, res, next) => {
  try {
    const { token } = req.body;

    if (!token) {
      return res.status(400).json({ message: "Verification token required." });
    }

    const user = await User.findOne({
      emailVerificationToken: token,
      emailVerificationExpires: { $gt: Date.now() },
    });

    if (!user) {
      return res
        .status(400)
        .json({ message: "Invalid or expired verification token." });
    }

    user.emailVerified = true;
    user.emailVerificationToken = null;
    user.emailVerificationExpires = null;
    await user.save();

    await logAudit({
      userId: user._id,
      username: user.username,
      action: "email_verification",
      resource: "user",
      ip: getClientIpFromRequest(req),
      userAgent: req.headers["user-agent"],
      success: true,
      details: "Email verified successfully",
    });

    res.status(200).json({
      message: "Email verified successfully.",
      user: user.toJSON(),
    });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/v1/auth/forgot-password
 * Request password reset token
 */
export const forgotPassword = async (req, res, next) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ message: "Email is required." });
    }

    const user = await User.findOne({ email });

    // Always return success for security (don't reveal if email exists)
    if (!user) {
      return res.status(200).json({
        message: "If email exists, you will receive a password reset link.",
      });
    }

    // Generate reset token
    const resetToken = user.generatePasswordResetToken();
    await user.save();

    const resetUrl = `${config.frontendUrl}/reset-password?token=${resetToken}`;

    // Send reset email when SMTP is configured
    const emailResult = await sendPasswordResetEmail({
      to: user.email,
      username: user.username,
      resetUrl,
    });

    await logAudit({
      userId: user._id,
      username: user.username,
      action: "password_reset_request",
      resource: "user",
      ip: getClientIpFromRequest(req),
      userAgent: req.headers["user-agent"],
      success: true,
      details: "Password reset token generated",
    });

    res.status(200).json({
      message: "If email exists, you will receive a password reset link.",
      // Dev fallback when SMTP is not configured
      resetToken:
        process.env.NODE_ENV === "development" && !emailResult.sent
          ? resetToken
          : undefined,
      resetUrl:
        process.env.NODE_ENV === "development" && !emailResult.sent
          ? resetUrl
          : undefined,
      mailStatus: emailResult.sent
        ? "EMAIL_SENT"
        : isEmailServiceConfigured()
          ? "EMAIL_SEND_FAILED"
          : "EMAIL_NOT_CONFIGURED",
    });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/v1/auth/reset-password
 * Reset password with token
 */
export const resetPassword = async (req, res, next) => {
  try {
    const { token, newPassword } = req.body;

    if (!token || !newPassword) {
      return res
        .status(400)
        .json({ message: "Token and new password are required." });
    }

    const user = await User.findOne({
      passwordResetToken: token,
      passwordResetExpires: { $gt: Date.now() },
    });

    if (!user) {
      return res
        .status(400)
        .json({ message: "Invalid or expired reset token." });
    }

    // Update password
    user.password = newPassword;
    user.clearPasswordResetToken();
    user.loginAttempts = 0; // Reset failed login attempts
    user.lockUntil = null; // Unlock account
    await user.save();

    await logAudit({
      userId: user._id,
      username: user.username,
      action: "password_reset",
      resource: "user",
      ip: getClientIpFromRequest(req),
      userAgent: req.headers["user-agent"],
      success: true,
      details: "Password reset successfully",
    });

    res.status(200).json({
      message: "Password reset successfully. Please login with new password.",
    });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/v1/auth/audit-logs
 * Admin-only audit log access
 */
export const getAuditLogsAdmin = async (req, res, next) => {
  try {
    const currentUser = await User.findById(req.user.userId).select("role username");
    if (!currentUser || currentUser.role !== "admin") {
      return res.status(403).json({
        message: "Admin access required.",
        code: "ADMIN_REQUIRED",
      });
    }

    const limit = Math.min(Number(req.query.limit) || 100, 500);
    const logs = await getAuditLogs(limit);

    await logAudit({
      userId: currentUser._id,
      username: currentUser.username,
      action: "view_audit_logs",
      resource: "admin",
      ip: getClientIpFromRequest(req),
      userAgent: req.headers["user-agent"],
      success: true,
      details: `Fetched ${logs.length} audit logs`,
    });

    res.status(200).json({
      logs,
      count: logs.length,
    });
  } catch (err) {
    next(err);
  }
};
