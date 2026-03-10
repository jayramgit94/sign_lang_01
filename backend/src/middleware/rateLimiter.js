/**
 * Rate Limiting — Protect against brute force and abuse.
 */
import rateLimit from "express-rate-limit";

/** General API rate limiter: 100 req / 15 min per IP */
export const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many requests. Please try again later." },
});

/** Auth rate limiter: 15 attempts / 15 min per IP (login/register) */
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 15,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    message: "Too many authentication attempts. Please wait 15 minutes.",
  },
  skipSuccessfulRequests: false,
});

/** Strict limiter for sensitive operations: 5 / 15 min */
export const strictLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Rate limit exceeded for this operation." },
});
