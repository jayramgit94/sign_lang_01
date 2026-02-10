// Determine if running in production based on NODE_ENV or hostname
const isProd =
  import.meta.env.MODE === "production" ||
  import.meta.env.PROD === true ||
  (typeof window !== "undefined" &&
    window.location.hostname !== "localhost" &&
    window.location.hostname !== "127.0.0.1");

// Get server URL from environment variables or use defaults
const rawBackendUrl = (import.meta.env.VITE_BACKEND_URL || "").trim();

// Production fallback for hosted backend (override via VITE_BACKEND_URL)
const prodFallback = "https://sign-lang-01.onrender.com";

const server = isProd
  ? rawBackendUrl || prodFallback
  : rawBackendUrl || "http://localhost:8001";

const normalizedServer = server.endsWith("/") ? server.slice(0, -1) : server;

if (isProd && !normalizedServer) {
  console.error(
    "Missing VITE_BACKEND_URL. Set it in Vercel environment variables.",
  );
}

console.log(
  `Environment: ${isProd ? "PRODUCTION" : "DEVELOPMENT"}, Backend: ${normalizedServer}`,
);

export default normalizedServer;
