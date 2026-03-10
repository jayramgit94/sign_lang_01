/**
 * Room Service — In-memory room state management with O(1) lookups.
 *
 * Manages rooms, participants, messages, and socket-to-room mapping.
 * Designed for single-server deployment. For multi-server, swap with Redis adapter.
 */
import config from "../config/index.js";

class RoomService {
  constructor() {
    /** @type {Map<string, Room>} roomCode → Room */
    this.rooms = new Map();

    /** @type {Map<string, string>} socketId → roomCode */
    this.socketToRoom = new Map();

    /** @type {Map<string, UserInfo>} socketId → { userId, username } */
    this.socketToUser = new Map();

    // Cleanup stale rooms every 5 minutes
    this._cleanupInterval = setInterval(() => this._cleanup(), 5 * 60 * 1000);
  }

  /**
   * Create or retrieve a room.
   * @returns {{ room, isNew }}
   */
  createRoom(code, hostSocketId, hostInfo, settings = {}) {
    if (this.rooms.has(code)) {
      return { room: this.rooms.get(code), isNew: false };
    }

    const room = {
      code,
      hostSocketId,
      participants: new Map(), // socketId → { userId, username, video, audio }
      messages: [],
      settings: {
        maxParticipants:
          settings.maxParticipants || config.room.maxParticipants,
        muteOnJoin: settings.muteOnJoin ?? false,
      },
      createdAt: Date.now(),
    };

    this.rooms.set(code, room);
    return { room, isNew: true };
  }

  /**
   * Add a participant to a room.
   * @returns {{ success, room?, error? }}
   */
  joinRoom(code, socketId, userInfo) {
    let room = this.rooms.get(code);

    // Auto-create room if it doesn't exist (first person to join is host)
    if (!room) {
      const result = this.createRoom(code, socketId, userInfo);
      room = result.room;
    }

    // Check capacity
    if (room.participants.size >= room.settings.maxParticipants) {
      return { success: false, error: "Room is full." };
    }

    // Check if already in another room
    const existingRoom = this.socketToRoom.get(socketId);
    if (existingRoom && existingRoom !== code) {
      this.leaveRoom(socketId);
    }

    // Add participant
    room.participants.set(socketId, {
      userId: userInfo.userId || null,
      username: userInfo.username || "Guest",
      video: false,
      audio: false,
      joinedAt: Date.now(),
    });

    // Update mappings
    this.socketToRoom.set(socketId, code);
    this.socketToUser.set(socketId, {
      userId: userInfo.userId || null,
      username: userInfo.username || "Guest",
    });

    return { success: true, room };
  }

  /**
   * Remove a participant from their current room.
   * @returns {{ room?, wasHost, isEmpty }}
   */
  leaveRoom(socketId) {
    const code = this.socketToRoom.get(socketId);
    if (!code) return { room: null, wasHost: false, isEmpty: true };

    const room = this.rooms.get(code);
    if (!room) {
      this.socketToRoom.delete(socketId);
      this.socketToUser.delete(socketId);
      return { room: null, wasHost: false, isEmpty: true };
    }

    const wasHost = room.hostSocketId === socketId;
    room.participants.delete(socketId);
    this.socketToRoom.delete(socketId);
    this.socketToUser.delete(socketId);

    const isEmpty = room.participants.size === 0;

    // Transfer host if needed
    if (wasHost && !isEmpty) {
      const [newHostId] = room.participants.keys();
      room.hostSocketId = newHostId;
    }

    // Remove empty rooms immediately
    if (isEmpty) {
      this.rooms.delete(code);
    }

    return { room: isEmpty ? null : room, wasHost, isEmpty, code };
  }

  /**
   * Get room by code.
   */
  getRoom(code) {
    return this.rooms.get(code) || null;
  }

  /**
   * Get all participant socket IDs for a room (excluding a specific socket).
   */
  getRoomPeers(code, excludeSocketId = null) {
    const room = this.rooms.get(code);
    if (!room) return [];

    const peers = [];
    for (const [socketId, info] of room.participants) {
      if (socketId !== excludeSocketId) {
        peers.push({ socketId, ...info });
      }
    }
    return peers;
  }

  /**
   * Get participant info by socketId.
   */
  getParticipantInfo(socketId) {
    return this.socketToUser.get(socketId) || null;
  }

  /**
   * Get room code for a socket.
   */
  getSocketRoom(socketId) {
    return this.socketToRoom.get(socketId) || null;
  }

  /**
   * Update participant media state.
   */
  updateParticipantMedia(socketId, updates) {
    const code = this.socketToRoom.get(socketId);
    if (!code) return;

    const room = this.rooms.get(code);
    if (!room) return;

    const participant = room.participants.get(socketId);
    if (participant) {
      Object.assign(participant, updates);
    }
  }

  /**
   * Add a chat message to the room (FIFO with cap).
   */
  addMessage(code, message) {
    const room = this.rooms.get(code);
    if (!room) return;

    room.messages.push({
      ...message,
      timestamp: Date.now(),
    });

    // Cap at 100 messages
    if (room.messages.length > 100) {
      room.messages = room.messages.slice(-100);
    }
  }

  /**
   * Get recent messages for a room.
   */
  getMessages(code, limit = 50) {
    const room = this.rooms.get(code);
    if (!room) return [];
    return room.messages.slice(-limit);
  }

  /**
   * Check if a socket is the host of its current room.
   */
  isHost(socketId) {
    const code = this.socketToRoom.get(socketId);
    if (!code) return false;
    const room = this.rooms.get(code);
    return room?.hostSocketId === socketId;
  }

  /**
   * Get current stats.
   */
  getStats() {
    let totalParticipants = 0;
    for (const room of this.rooms.values()) {
      totalParticipants += room.participants.size;
    }
    return {
      rooms: this.rooms.size,
      participants: totalParticipants,
      sockets: this.socketToRoom.size,
    };
  }

  /**
   * Cleanup stale rooms (empty + older than 10 min).
   */
  _cleanup() {
    const now = Date.now();
    const staleThreshold = 10 * 60 * 1000;

    for (const [code, room] of this.rooms) {
      if (
        room.participants.size === 0 &&
        now - room.createdAt > staleThreshold
      ) {
        this.rooms.delete(code);
      }
    }
  }

  /**
   * Shutdown cleanup.
   */
  destroy() {
    clearInterval(this._cleanupInterval);
    this.rooms.clear();
    this.socketToRoom.clear();
    this.socketToUser.clear();
  }
}

// Singleton instance
const roomService = new RoomService();
export default roomService;
