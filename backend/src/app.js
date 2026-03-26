/**
 * Apna Meet — Production-grade video call server.
 *
 * Architecture:
 *  - Express HTTP server with security middleware
 *  - Socket.IO for real-time signaling
 *  - MongoDB for persistent data
 *  - JWT + httpOnly cookies for authentication
 */
import dotenv from "dotenv";
dotenv.config();

import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import mongoose from "mongoose";
import { createServer } from "node:http";

// Config
import { corsOptions } from "./config/cors.js";
import { connectDB, getDBStatus } from "./config/db.js";
import config from "./config/index.js";

// Middleware
import { errorHandler, notFoundHandler } from "./middleware/errorHandler.js";
import { generalLimiter } from "./middleware/rateLimiter.js";
import { auditMiddleware } from "./services/audit.service.js";

// Routes
import authRoutes from "./routes/auth.routes.js";
import meetingRoutes from "./routes/meeting.routes.js";

// Socket
import { initializeSocket } from "./controllers/socket/index.js";

// ─── Express App ─────────────────────────────────────────────────
const app = express();
const server = createServer(app);

// Trust proxy (Render / Heroku / Vercel reverse proxy)
app.set("trust proxy", 1);

// ─── Security ────────────────────────────────────────────────────
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
    contentSecurityPolicy: false, // CSP configured at CDN/proxy level
  }),
);

// ─── CORS ────────────────────────────────────────────────────────
app.use(cors(corsOptions));

// ─── Body Parsing ────────────────────────────────────────────────
app.use(cookieParser());
app.use(express.json({ limit: "50kb" }));
app.use(express.urlencoded({ extended: true, limit: "50kb" }));

// Enforce HTTPS in production when running behind a trusted proxy.
if (config.isProd) {
  app.use((req, res, next) => {
    const isSecure = req.secure || req.headers["x-forwarded-proto"] === "https";
    if (isSecure) return next();
    return res.redirect(301, `https://${req.headers.host}${req.originalUrl}`);
  });
}

// ─── Rate Limiting ───────────────────────────────────────────────
app.use(generalLimiter);

// ─── Audit Logging ───────────────────────────────────────────────
app.use(auditMiddleware());

// ─── API Routes ──────────────────────────────────────────────────
app.use("/api/v1/auth", authRoutes);
app.use("/api/v1/meetings", meetingRoutes);

// ─── Health Check ────────────────────────────────────────────────
app.get("/health", (req, res) => {
  const dbState = getDBStatus();
  res.json({
    status: "ok",
    database: dbState,
    environment: config.isProd ? "production" : "development",
    timestamp: new Date().toISOString(),
    uptime: Math.floor(process.uptime()),
  });
});

// ─── 404 + Error Handler ─────────────────────────────────────────
app.use(notFoundHandler);
app.use(errorHandler);

// ─── Socket.IO ───────────────────────────────────────────────────
initializeSocket(server);

// ─── Start Server ────────────────────────────────────────────────
const start = async () => {
  console.log(
    `[Server] Environment: ${config.isProd ? "production" : "development"}`,
  );

  // Start listening immediately (health check works without DB)
  server.listen(config.port, () => {
    console.log(`[Server] Listening on port ${config.port}`);
  });

  // Connect to MongoDB with retries
  await connectDB();
};

start();

// ─── Graceful Shutdown ───────────────────────────────────────────
const shutdown = async (signal) => {
  console.log(`[Server] ${signal} received. Shutting down...`);

  server.close(() => {
    console.log("[Server] HTTP server closed.");
  });

  try {
    await mongoose.connection.close();
    console.log("[Server] MongoDB connection closed.");
  } catch (err) {
    console.error("[Server] Error during shutdown:", err.message);
  }

  process.exit(0);
};

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

// Prevent crashes from unhandled rejections
process.on("unhandledRejection", (err) => {
  console.error("[Server] Unhandled rejection:", err);
});

export default app;
