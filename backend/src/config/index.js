/**
 * Central Configuration — Single source of truth for all server settings.
 * All values sourced from environment variables with secure defaults.
 */
import dotenv from "dotenv";
dotenv.config();

const config = {
  // ── Server ──
  port: parseInt(process.env.PORT, 10) || 8001,
  nodeEnv: process.env.NODE_ENV || "development",
  isProd: process.env.NODE_ENV === "production",

  // ── MongoDB ──
  mongoUri: process.env.MONGODB_URI,

  // ── JWT Secrets — MUST be set in production ──
  jwt: {
    accessSecret:
      process.env.JWT_ACCESS_SECRET || "dev-access-secret-change-me",
    refreshSecret:
      process.env.JWT_REFRESH_SECRET || "dev-refresh-secret-change-me",
    accessExpiresIn: "15m",
    refreshExpiresIn: "7d",
    accessMaxAge: 15 * 60 * 1000, // 15 min in ms
    refreshMaxAge: 7 * 24 * 60 * 60 * 1000, // 7 days in ms
  },

  // ── CORS — Frontend origins ──
  frontendUrl: process.env.FRONTEND_URL || "http://localhost:8000",
  frontendUrls: process.env.FRONTEND_URLS || "",

  // ── Rate Limiting ──
  rateLimit: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // per IP
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: "Too many requests, please try again later." },
  },

  // ── Room Defaults ──
  room: {
    /** Hard cap enforced by room.service (set via ROOM_MAX_PARTICIPANTS). */
    maxParticipants: parseInt(process.env.ROOM_MAX_PARTICIPANTS, 10) || 50,
    /** Mesh WebRTC performs best below this; SFU recommended beyond. */
    meshRecommendedMax: parseInt(process.env.ROOM_MESH_RECOMMENDED_MAX, 10) || 12,
    maxMessageHistory: 100,
    emptyRoomTTL: 5 * 60 * 1000,
    codeLength: 6,
  },

  // ── Bcrypt ──
  bcryptRounds: 12,

  // ── Password Policy ──
  password: {
    minLength: 8,
    maxLength: 128,
  },

  // ── Email / SMTP ──
  mail: {
    host: process.env.SMTP_HOST || "",
    port: parseInt(process.env.SMTP_PORT || "0", 10) || 0,
    secure: process.env.SMTP_SECURE === "true",
    user: process.env.SMTP_USER || "",
    pass: process.env.SMTP_PASS || "",
    from: process.env.MAIL_FROM || "Apna Meet <no-reply@apnameet.local>",
  },
};

// ── Validation ──
if (config.isProd) {
  const required = ["MONGODB_URI", "JWT_ACCESS_SECRET", "JWT_REFRESH_SECRET"];
  const missing = required.filter((k) => !process.env[k]);
  if (missing.length > 0) {
    console.error(`FATAL: Missing required env vars: ${missing.join(", ")}`);
    process.exit(1);
  }

  if (
    !config.mail.host ||
    !config.mail.port ||
    !config.mail.user ||
    !config.mail.pass
  ) {
    console.warn(
      "[Config] SMTP is not configured. Forgot-password emails will not be sent.",
    );
  }
}

export default config;
