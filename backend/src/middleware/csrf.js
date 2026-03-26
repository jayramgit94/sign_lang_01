/**
 * CSRF Protection Middleware
 * - Generates CSRF tokens in secure cookies
 * - Validates tokens on state-changing requests (POST, PATCH, DELETE)
 * - Uses double-submit cookie pattern for SPA security
 */

import crypto from "crypto";
import config from "../config/index.js";

const CSRF_TOKEN_LENGTH = 32;
const CSRF_COOKIE_NAME = "XSRF-TOKEN";
const CSRF_HEADER_NAME = "X-XSRF-TOKEN";
const CSRF_SIGNING_SECRET =
  process.env.CSRF_SECRET ||
  process.env.JWT_ACCESS_SECRET ||
  "dev-csrf-secret-change-me";
const CSRF_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * Generate CSRF token
 */
export const generateCsrfToken = () => {
  const nonce = crypto.randomBytes(CSRF_TOKEN_LENGTH).toString("hex");
  const ts = Date.now().toString();
  const payload = `${ts}.${nonce}`;
  const sig = crypto
    .createHmac("sha256", CSRF_SIGNING_SECRET)
    .update(payload)
    .digest("hex");
  return `${payload}.${sig}`;
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
      secure: config.isProd,
      // Cross-origin SPA (Vercel -> API domain) requires SameSite=None.
      sameSite: config.isProd ? "none" : "strict",
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
      path: "/",
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

  // Header/body token is always required for state-changing requests.
  if (!providedToken) {
    return res.status(403).json({
      message: "Missing CSRF token.",
      code: "CSRF_TOKEN_MISSING",
    });
  }

  // Preferred mode: double-submit cookie comparison.
  // Fallback mode: validate signed token if cookie is unavailable
  // (can happen with strict third-party cookie policies).
  const valid = cookieToken
    ? constantTimeEqual(providedToken, cookieToken)
    : verifySignedCsrfToken(providedToken);

  if (!valid) {
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
  if (!a || !b) {
    return false;
  }

  if (a.length !== b.length) {
    return false;
  }

  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }

  return result === 0;
}

function verifySignedCsrfToken(token) {
  if (!token || typeof token !== "string") return false;

  const parts = token.split(".");
  if (parts.length !== 3) return false;

  const [ts, nonce, signature] = parts;
  if (!ts || !nonce || !signature) return false;

  const tsNum = Number(ts);
  if (!Number.isFinite(tsNum)) return false;
  if (Date.now() - tsNum > CSRF_TTL_MS) return false;

  const payload = `${ts}.${nonce}`;
  const expectedSig = crypto
    .createHmac("sha256", CSRF_SIGNING_SECRET)
    .update(payload)
    .digest("hex");

  return constantTimeEqual(signature, expectedSig);
}
