/**
 * Global Error Handler — Catches all unhandled errors.
 * Never leaks stack traces or internal details in production.
 */
import config from "../config/index.js";

// eslint-disable-next-line no-unused-vars
export const errorHandler = (err, req, res, _next) => {
  // CORS errors
  if (err.message?.startsWith("CORS")) {
    return res.status(403).json({ message: "Origin not allowed." });
  }

  // Mongoose validation errors
  if (err.name === "ValidationError") {
    const errors = Object.values(err.errors).map((e) => ({
      field: e.path,
      message: e.message,
    }));
    return res.status(400).json({ message: "Validation failed.", errors });
  }

  // Mongoose duplicate key
  if (err.code === 11000) {
    const field = Object.keys(err.keyValue || {})[0] || "field";
    return res.status(409).json({ message: `${field} already exists.` });
  }

  // JWT errors
  if (err.name === "JsonWebTokenError" || err.name === "TokenExpiredError") {
    return res.status(401).json({ message: "Invalid or expired token." });
  }

  // Default
  const statusCode = err.statusCode || 500;
  const message = config.isProd
    ? "Internal server error."
    : err.message || "Internal server error.";

  if (!config.isProd) {
    console.error("Unhandled error:", err);
  }

  res.status(statusCode).json({ message });
};

/**
 * 404 handler — Catch all unmatched routes.
 */
export const notFoundHandler = (req, res) => {
  res
    .status(404)
    .json({ message: `Route ${req.method} ${req.path} not found.` });
};
