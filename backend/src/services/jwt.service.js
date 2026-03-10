/**
 * JWT Service — Token generation, verification, and cookie configuration.
 */
import jwt from "jsonwebtoken";
import config from "../config/index.js";

/**
 * Generate an access token (short-lived, 15 min).
 */
export const generateAccessToken = (payload) => {
  return jwt.sign(payload, config.jwt.accessSecret, {
    expiresIn: config.jwt.accessExpiresIn,
  });
};

/**
 * Generate a refresh token (long-lived, 7 days).
 */
export const generateRefreshToken = (payload) => {
  return jwt.sign(payload, config.jwt.refreshSecret, {
    expiresIn: config.jwt.refreshExpiresIn,
  });
};

/**
 * Verify an access token. Returns decoded payload or null.
 */
export const verifyAccessToken = (token) => {
  try {
    return jwt.verify(token, config.jwt.accessSecret);
  } catch {
    return null;
  }
};

/**
 * Verify a refresh token. Returns decoded payload or null.
 */
export const verifyRefreshToken = (token) => {
  try {
    return jwt.verify(token, config.jwt.refreshSecret);
  } catch {
    return null;
  }
};

/**
 * Generate a token pair (access + refresh).
 */
export const generateTokenPair = (user) => {
  const payload = { userId: user._id.toString(), username: user.username };
  return {
    accessToken: generateAccessToken(payload),
    refreshToken: generateRefreshToken(payload),
  };
};

/**
 * Cookie options for tokens. httpOnly + secure + sameSite.
 */
export const cookieOptions = {
  access: {
    httpOnly: true,
    secure: config.isProd,
    sameSite: config.isProd ? "none" : "lax",
    maxAge: 15 * 60 * 1000, // 15 min
    path: "/",
  },
  refresh: {
    httpOnly: true,
    secure: config.isProd,
    sameSite: config.isProd ? "none" : "lax",
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    path: "/",
  },
};

/**
 * Set both token cookies on the response.
 */
export const setTokenCookies = (res, accessToken, refreshToken) => {
  res.cookie("accessToken", accessToken, cookieOptions.access);
  res.cookie("refreshToken", refreshToken, cookieOptions.refresh);
};

/**
 * Clear both token cookies.
 */
export const clearTokenCookies = (res) => {
  res.clearCookie("accessToken", {
    path: "/",
    secure: config.isProd,
    sameSite: config.isProd ? "none" : "lax",
  });
  res.clearCookie("refreshToken", {
    path: "/",
    secure: config.isProd,
    sameSite: config.isProd ? "none" : "lax",
  });
};
