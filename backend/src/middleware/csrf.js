/**
 * CSRF Protection Middleware
 * - Generates CSRF tokens in secure cookies
 * - Validates tokens on state-changing requests (POST, PATCH, DELETE)
 * - Uses double-submit cookie pattern for SPA security
 */

import crypto from "crypto";

const CSRF_TOKEN_LENGTH = 32;
const CSRF_COOKIE_NAME = "XSRF-TOKEN";
const CSRF_HEADER_NAME = "X-XSRF-TOKEN";

/**
 * Generate CSRF token
 */
export const generateCsrfToken = () => {
  return crypto.randomBytes(CSRF_TOKEN_LENGTH).toString("hex");
};

/**
 * Middleware to generate and set CSRF token in secure cookie
 */
export const csrfProtection = (req, res, next) => {
  let token = req.cookies[CSRF_COOKIE_NAME];

  // Generate new token if doesn't exist
  if (!token) {
    token = generateCsrfToken();
    // Set httpOnly: false so JavaScript can read it for headers
    res.cookie(CSRF_COOKIE_NAME, token, {
      httpOnly: false,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
    });
  }

  // Store token in request for later use in templates/responses
  req.csrfToken = token;

  next();
};

/**
 * Middleware to validate CSRF token on state-changing requests
 * Skips GET, HEAD, OPTIONS requests (idempotent)
 */
export const verifyCsrfToken = (req, res, next) => {
  // Allow safe methods
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) {
    return next();
  }

  // Get token from header first, then body, then cookie (fallback)
  const tokenFromHeader = req.headers[CSRF_HEADER_NAME.toLowerCase()];
  const tokenFromBody = req.body?.csrfToken;
  const tokenFromCookie = req.cookies[CSRF_COOKIE_NAME];

  const providedToken = tokenFromHeader || tokenFromBody;
  const cookieToken = tokenFromCookie;

  // Validate token exists and matches
  if (!providedToken || !cookieToken) {
    return res.status(403).json({
      message: "Missing CSRF token.",
      code: "CSRF_TOKEN_MISSING",
    });
  }

  // Constant-time comparison to prevent timing attacks
  if (!constantTimeEqual(providedToken, cookieToken)) {
    return res.status(403).json({
      message: "Invalid CSRF token.",
      code: "CSRF_TOKEN_INVALID",
    });
  }

  next();
};

/**
 * Constant-time string comparison to prevent timing attacks
 */
function constantTimeEqual(a, b) {
  if (a.length !== b.length) {
    return false;
  }

  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }

  return result === 0;
}
