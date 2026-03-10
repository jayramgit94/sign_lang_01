/**
 * Chat Socket Handler — In-room messaging.
 */
import roomService from "../../services/room.service.js";

export const registerChatHandlers = (io, socket) => {
  /**
   * Send a chat message to the room.
   * @param {{ data: string, sender: string }} payload
   */
  socket.on("chat-message", (payload) => {
    const { data, sender } = payload || {};

    if (!data || typeof data !== "string") return;

    const roomCode = roomService.getSocketRoom(socket.id);
    if (!roomCode) return;

    // Sanitize and limit message length
    const sanitized = data.trim().slice(0, 2000);
    if (!sanitized) return;

    const message = {
      sender: sender || socket.username || "Guest",
      data: sanitized,
      socketId: socket.id,
    };

    // Store message
    roomService.addMessage(roomCode, message);

    // Broadcast to room (including sender for confirmation)
    io.to(roomCode).emit("chat-message", message);
  });
};
