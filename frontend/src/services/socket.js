/**
 * Socket Service — Singleton Socket.IO connection manager.
 */
import { io } from "socket.io-client";

const SOCKET_URL =
  import.meta.env.VITE_API_URL ||
  (import.meta.env.DEV ? "http://localhost:8001" : "");

let socket = null;

/**
 * Get or create the socket connection.
 * @param {string} [username] - Guest username fallback
 */
export const getSocket = (username) => {
  // Reuse existing socket — whether connected, connecting, or reconnecting.
  // Socket.IO's built-in reconnection handles recovery automatically.
  // Only `disconnectSocket()` sets `socket = null` for intentional cleanup.
  if (socket) return socket;

  socket = io(SOCKET_URL, {
    withCredentials: true, // Send cookies for JWT auth
    transports: ["websocket", "polling"],
    reconnection: true,
    reconnectionAttempts: 10,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 10000,
    timeout: 10000,
    auth: {
      username: username || "Guest",
    },
  });

  socket.on("connect", () => {
    console.log("[Socket] Connected:", socket.id);
  });

  socket.on("connect_error", (err) => {
    console.warn("[Socket] Connection error:", err.message);
  });

  socket.on("disconnect", (reason) => {
    console.log("[Socket] Disconnected:", reason);
  });

  return socket;
};

/**
 * Disconnect and cleanup the socket.
 */
export const disconnectSocket = () => {
  if (socket) {
    socket.removeAllListeners();
    socket.disconnect();
    socket = null;
  }
};

/**
 * Get existing socket without creating new one.
 */
export const getCurrentSocket = () => socket;
