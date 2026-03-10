/**
 * Socket.IO Initialization — Central socket setup with auth and room handlers.
 */
import { Server } from "socket.io";
import { corsOptions } from "../../config/cors.js";
import { socketAuth } from "../../middleware/auth.js";
import roomService from "../../services/room.service.js";
import { registerChatHandlers } from "./chatHandler.js";
import { registerRoomHandlers } from "./roomHandler.js";
import { registerSignalingHandlers } from "./signalingHandler.js";

let io = null;

// Simple in-memory rate limit for socket connections
const rateLimitMap = new Map();

/**
 * Initialize Socket.IO on the HTTP server.
 */
export const initializeSocket = (server) => {
  io = new Server(server, {
    cors: {
      origin: corsOptions.origin,
      methods: ["GET", "POST"],
      credentials: true,
    },
    pingTimeout: 30000,
    pingInterval: 10000,
    maxHttpBufferSize: 1e6, // 1MB max payload
    connectionStateRecovery: {
      maxDisconnectionDuration: 2 * 60 * 1000, // 2 min
    },
  });

  // Auth middleware — sets socket.userId, socket.username, socket.authenticated
  io.use(socketAuth);

  // Rate limiting at socket level
  io.use((socket, next) => {
    const clientIp =
      socket.handshake.headers["x-forwarded-for"] || socket.handshake.address;

    if (!rateLimitMap.has(clientIp)) {
      rateLimitMap.set(clientIp, { count: 0, resetAt: Date.now() + 60000 });
    }

    const entry = rateLimitMap.get(clientIp);
    if (Date.now() > entry.resetAt) {
      entry.count = 0;
      entry.resetAt = Date.now() + 60000;
    }

    entry.count++;
    if (entry.count > 20) {
      return next(new Error("Too many connections. Please try again later."));
    }

    next();
  });

  io.on("connection", (socket) => {
    console.log(
      `[Socket] Connected: ${socket.id} (${socket.username}, auth: ${socket.authenticated})`,
    );

    // Register all event handlers
    registerRoomHandlers(io, socket);
    registerChatHandlers(io, socket);
    registerSignalingHandlers(io, socket);

    // Handle disconnect
    socket.on("disconnect", (reason) => {
      console.log(`[Socket] Disconnected: ${socket.id} (${reason})`);
      handleDisconnect(io, socket);
    });

    // Handle errors
    socket.on("error", (err) => {
      console.error(`[Socket] Error on ${socket.id}:`, err.message);
    });
  });

  // Cleanup rate limit map every minute
  setInterval(() => {
    const now = Date.now();
    for (const [ip, entry] of rateLimitMap) {
      if (now > entry.resetAt + 60000) rateLimitMap.delete(ip);
    }
  }, 60000);

  return io;
};

/**
 * Handle socket disconnect — clean up room state, notify peers.
 */
const handleDisconnect = (io, socket) => {
  const result = roomService.leaveRoom(socket.id);

  if (result.code && !result.isEmpty) {
    // Notify remaining participants
    io.to(result.code).emit("user-left", {
      socketId: socket.id,
      username: socket.username,
    });
  }
};

/**
 * Get the Socket.IO instance.
 */
export const getIO = () => {
  if (!io) throw new Error("Socket.IO not initialized.");
  return io;
};
