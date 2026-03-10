/**
 * CORS Configuration — Strict origin enforcement for production.
 */
import config from "./index.js";

const parseOrigins = () => {
  const origins = [];

  if (config.frontendUrl) {
    origins.push(config.frontendUrl.trim());
  }

  if (config.frontendUrls) {
    const extra = config.frontendUrls
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    origins.push(...extra);
  }

  return origins;
};

const devOrigins = [
  "http://localhost:8000",
  "http://127.0.0.1:8000",
  "http://localhost:3000",
  "http://127.0.0.1:3000",
];

const prodOrigins = [...parseOrigins(), /\.vercel\.app$/];

const allowedOrigins = config.isProd ? prodOrigins : devOrigins;

export const corsOptions = {
  origin: (origin, callback) => {
    // Allow server-to-server / health-check (no origin)
    if (!origin) return callback(null, true);

    const allowed = allowedOrigins.some((entry) =>
      entry instanceof RegExp ? entry.test(origin) : entry === origin,
    );

    return allowed
      ? callback(null, true)
      : callback(new Error(`CORS: origin ${origin} not allowed`));
  },
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  credentials: true,
  maxAge: 86400, // cache preflight for 24h
};

/** Socket.IO-compatible origins array */
export const socketCorsOrigins = config.isProd ? prodOrigins : devOrigins;
