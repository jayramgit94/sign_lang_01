/**
 * Room Socket Handler — Join/leave room events.
 */
import roomService from "../../services/room.service.js";

export const registerRoomHandlers = (io, socket) => {
  /**
   * Join a room.
   * @param {{ roomCode: string, username?: string }} data
   */
  socket.on("join-room", (data) => {
    const roomCode = (data?.roomCode || "").trim().toLowerCase();

    if (!roomCode) {
      return socket.emit("error", { message: "Room code is required." });
    }

    if (!/^[a-z]{6}$/.test(roomCode)) {
      return socket.emit("error", {
        message: "Room code must be exactly 6 letters.",
      });
    }

    const username = socket.username || data.username || "Guest";

    const result = roomService.joinRoom(roomCode, socket.id, {
      userId: socket.userId,
      username,
    });

    if (!result.success) {
      return socket.emit("error", { message: result.error });
    }

    // Join Socket.IO room
    socket.join(roomCode);

    // Get existing peers
    const peers = roomService.getRoomPeers(roomCode, socket.id);

    // Send existing participants to the new user
    socket.emit("room-joined", {
      roomCode,
      participants: peers.map((p) => ({
        socketId: p.socketId,
        username: p.username,
      })),
      messages: roomService.getMessages(roomCode),
      isHost: roomService.isHost(socket.id),
    });

    // Notify existing participants about the new user
    socket.to(roomCode).emit("user-joined", {
      socketId: socket.id,
      username,
    });

    console.log(
      `[Room] ${username} (${socket.id}) joined ${roomCode}. ` +
        `Participants: ${peers.length + 1}`,
    );
  });

  /**
   * Leave current room explicitly.
   */
  socket.on("leave-room", () => {
    const result = roomService.leaveRoom(socket.id);

    if (result.code) {
      socket.leave(result.code);

      if (!result.isEmpty) {
        // Notify remaining participants
        io.to(result.code).emit("user-left", {
          socketId: socket.id,
          username: socket.username,
        });

        // If host left, notify about new host
        if (result.wasHost && result.room) {
          io.to(result.code).emit("host-changed", {
            socketId: result.room.hostSocketId,
          });
        }
      }
    }
  });

  /**
   * Update media state (video/audio on/off).
   */
  socket.on("media-state-update", (data) => {
    const { video, audio } = data || {};
    const roomCode = roomService.getSocketRoom(socket.id);

    if (roomCode) {
      const updates = {};
      if (typeof video === "boolean") updates.video = video;
      if (typeof audio === "boolean") updates.audio = audio;

      roomService.updateParticipantMedia(socket.id, updates);

      socket.to(roomCode).emit("peer-media-update", {
        socketId: socket.id,
        ...updates,
      });
    }
  });

  /**
   * Get current room info.
   */
  socket.on("get-room-info", (callback) => {
    const roomCode = roomService.getSocketRoom(socket.id);
    if (!roomCode) return callback?.({ error: "Not in a room." });

    const room = roomService.getRoom(roomCode);
    if (!room) return callback?.({ error: "Room not found." });

    const peers = roomService.getRoomPeers(roomCode);
    callback?.({
      roomCode,
      participants: peers.map((p) => ({
        socketId: p.socketId,
        username: p.username,
        video: p.video,
        audio: p.audio,
      })),
      isHost: roomService.isHost(socket.id),
    });
  });
};
