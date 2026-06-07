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
  skipSuccessfulRequests: true,
});

/** Strict limiter for sensitive operations: 5 / 15 min */
export const strictLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Rate limit exceeded for this operation." },
});

/** Read-heavy limiter: 60 req / 5 min per IP */
export const readLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many requests. Please slow down." },
});

/** Stats limiter: 30 req / 5 min per IP */
export const statsLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many stats requests. Please slow down." },
});
