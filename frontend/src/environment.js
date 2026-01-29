// Determine if running in production based on NODE_ENV or hostname
const isProd =
  import.meta.env.MODE === "production" ||
  import.meta.env.PROD === true ||
  (typeof window !== "undefined" &&
    window.location.hostname !== "localhost" &&
    window.location.hostname !== "127.0.0.1");

// Get server URL from environment variables or use defaults
const server = isProd
  ? import.meta.env.VITE_BACKEND_URL || ""
  : import.meta.env.VITE_BACKEND_URL || "http://localhost:8001";

console.log(
  `Environment: ${isProd ? "PRODUCTION" : "DEVELOPMENT"}, Backend: ${server}`,
);

export default server;
