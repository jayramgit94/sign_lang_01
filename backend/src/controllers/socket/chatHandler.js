/**
 * Chat Socket Handler — In-room messaging.
 */
import roomService from "../../services/room.service.js";
import { createRateLimiter } from "./rateLimit.js";
import { chatSchema } from "./schemas.js";

const allowChat = createRateLimiter({ windowMs: 10_000, max: 20 });

const emitInvalid = (event, socket) => {
  socket.emit("error", {
    message: "Invalid payload.",
    code: "INVALID_PAYLOAD",
    event,
  });
};

const emitRateLimit = (event, socket) => {
  socket.emit("error", {
    message: "Rate limit exceeded.",
    code: "RATE_LIMIT",
    event,
  });
};

export const registerChatHandlers = (io, socket) => {
  /**
   * Send a chat message to the room.
   * Sender is always taken from the authenticated socket — never from client payload.
   * @param {{ data: string }} payload
   */
  socket.on("chat-message", (payload) => {
    if (!allowChat(`${socket.id}:chat`)) {
      return emitRateLimit("chat-message", socket);
    }
    const parsed = chatSchema.safeParse(payload || {});
    if (!parsed.success) return emitInvalid("chat-message", socket);
    const { data } = parsed.data;

    const roomCode = roomService.getSocketRoom(socket.id);
    if (!roomCode) return;

    const sanitized = data.trim().slice(0, 2000);
    if (!sanitized) return;

    const message = {
      sender: (socket.username || "Guest").slice(0, 50),
      data: sanitized,
      socketId: socket.id,
    };

    roomService.addMessage(roomCode, message);
    io.to(roomCode).emit("chat-message", message);
  });
};
