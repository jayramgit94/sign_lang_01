/**
 * Auth Controller — Registration, Login, Token Refresh, Logout.
 * Uses JWT with httpOnly cookies.
 */
import { User } from "../models/user.model.js";
import {
  clearTokenCookies,
  cookieOptions,
  generateAccessToken,
  generateTokenPair,
  setTokenCookies,
  verifyRefreshToken,
} from "../services/jwt.service.js";

/**
 * POST /api/v1/auth/register
 */
export const register = async (req, res, next) => {
  try {
    const { name, username, password } = req.body;

    // Check if username already exists
    const existing = await User.findOne({ username });
    if (existing) {
      return res.status(409).json({ message: "Username already taken." });
    }

    // Create user (password hashing is handled by pre-save hook)
    const user = await User.create({ name, username, password });

    // Generate tokens
    const tokens = generateTokenPair(user);

    // Store refresh token
    user.refreshToken = tokens.refreshToken;
    await user.save();

    // Set cookies
    setTokenCookies(res, tokens.accessToken, tokens.refreshToken);

    res.status(201).json({
      message: "Registration successful.",
      user: user.toJSON(),
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

    const user = await User.findOne({ username });
    if (!user) {
      return res.status(401).json({ message: "Invalid credentials." });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({ message: "Invalid credentials." });
    }

    // Generate tokens
    const tokens = generateTokenPair(user);

    // Store refresh token
    user.refreshToken = tokens.refreshToken;
    await user.save();

    // Set cookies
    setTokenCookies(res, tokens.accessToken, tokens.refreshToken);

    res.status(200).json({
      message: "Login successful.",
      user: user.toJSON(),
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
    const refreshToken = req.cookies?.refreshToken;

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

    // Generate new access token
    const newAccessToken = generateAccessToken({
      userId: user._id.toString(),
      username: user.username,
    });

    res.cookie("accessToken", newAccessToken, cookieOptions.access);

    res.status(200).json({ message: "Token refreshed." });
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
