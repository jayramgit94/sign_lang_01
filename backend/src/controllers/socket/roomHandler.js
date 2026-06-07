/**
 * Room Socket Handler — Join/leave room events.
 */
import config from "../../config/index.js";
import roomService from "../../services/room.service.js";
import { createRateLimiter } from "./rateLimit.js";
import { joinRoomSchema, mediaStateSchema } from "./schemas.js";

const allowJoin = createRateLimiter({ windowMs: 60_000, max: 6 });
const allowLeave = createRateLimiter({ windowMs: 60_000, max: 12 });
const allowMediaUpdate = createRateLimiter({ windowMs: 10_000, max: 30 });
const allowRoomInfo = createRateLimiter({ windowMs: 10_000, max: 30 });

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

export const registerRoomHandlers = (io, socket) => {
  /**
   * Join a room.
   * @param {{ roomCode: string, username?: string }} data
   */
  socket.on("join-room", (data) => {
    if (!allowJoin(`${socket.id}:join`)) {
      return emitRateLimit("join-room", socket);
    }
    const parsed = joinRoomSchema.safeParse(data || {});
    if (!parsed.success) {
      return emitInvalid("join-room", socket);
    }

    const roomCode = parsed.data.roomCode.trim().toLowerCase();

    if (!roomCode) {
      return socket.emit("error", { message: "Room code is required." });
    }

    if (!/^[a-z]{6}$/.test(roomCode)) {
      return socket.emit("error", {
        message: "Room code must be exactly 6 letters.",
      });
    }

    const incomingName = parsed.data.username || "";
    const username = (socket.username || incomingName || "Guest").slice(0, 50);

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
      limits: {
        maxParticipants: result.room.settings.maxParticipants,
        meshRecommendedMax: config.room.meshRecommendedMax,
      },
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
    if (!allowLeave(`${socket.id}:leave`)) {
      return emitRateLimit("leave-room", socket);
    }
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
    if (!allowMediaUpdate(`${socket.id}:media`)) {
      return emitRateLimit("media-state-update", socket);
    }
    const parsed = mediaStateSchema.safeParse(data || {});
    if (!parsed.success) return emitInvalid("media-state-update", socket);
    const { video, audio } = parsed.data;
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
    if (!allowRoomInfo(`${socket.id}:info`)) {
      return callback?.({ error: "Rate limit exceeded.", code: "RATE_LIMIT" });
    }
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
