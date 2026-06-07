/**
 * WebRTC Signaling Handler — Relay offers, answers, and ICE candidates.
 *
 * The server acts as a pure relay for WebRTC signaling.
 * No media passes through the server.
 */
import roomService from "../../services/room.service.js";
import { createRateLimiter } from "./rateLimit.js";
import {
  answerSchema,
  candidateSchema,
  captionSchema,
  offerSchema,
  renegotiateSchema,
} from "./schemas.js";

const allowSignal = createRateLimiter({ windowMs: 10_000, max: 60 });
const allowCaption = createRateLimiter({ windowMs: 10_000, max: 30 });

const getSize = (value) => {
  try {
    return JSON.stringify(value).length;
  } catch {
    return 0;
  }
};

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

const emitInvalidPeer = (event, socket) => {
  socket.emit("error", {
    message: "Target peer is not in your room.",
    code: "INVALID_PEER",
    event,
  });
};

/** Returns true when both sockets share the same room. */
const peersInSameRoom = (socket, peerSocketId, event) => {
  const myRoom = roomService.getSocketRoom(socket.id);
  const theirRoom = roomService.getSocketRoom(peerSocketId);
  if (!myRoom || !theirRoom || myRoom !== theirRoom) {
    if (event === "offer" || event === "answer") {
      emitInvalidPeer(event, socket);
    }
    return false;
  }
  return true;
};

export const registerSignalingHandlers = (io, socket) => {
  socket.on("offer", (data) => {
    const parsed = offerSchema.safeParse(data);
    if (!parsed.success) return emitInvalid("offer", socket);
    const { to, offer } = parsed.data;
    if (!to || !offer) return;
    if (!allowSignal(`${socket.id}:offer`)) {
      return emitRateLimit("offer", socket);
    }
    if (getSize(offer) > 50_000) return emitInvalid("offer", socket);
    if (!peersInSameRoom(socket, to, "offer")) return;

    io.to(to).emit("offer", {
      from: socket.id,
      offer,
      username: socket.username,
    });
  });

  socket.on("answer", (data) => {
    const parsed = answerSchema.safeParse(data);
    if (!parsed.success) return emitInvalid("answer", socket);
    const { to, answer } = parsed.data;
    if (!to || !answer) return;
    if (!allowSignal(`${socket.id}:answer`)) {
      return emitRateLimit("answer", socket);
    }
    if (getSize(answer) > 50_000) return emitInvalid("answer", socket);
    if (!peersInSameRoom(socket, to, "answer")) return;

    io.to(to).emit("answer", {
      from: socket.id,
      answer,
    });
  });

  socket.on("ice-candidate", (data) => {
    const parsed = candidateSchema.safeParse(data);
    if (!parsed.success) return emitInvalid("ice-candidate", socket);
    const { to, candidate } = parsed.data;
    if (!to || !candidate) return;
    if (!allowSignal(`${socket.id}:ice`)) {
      return emitRateLimit("ice-candidate", socket);
    }
    if (getSize(candidate) > 10_000) return;
    if (!peersInSameRoom(socket, to, "ice-candidate")) return;

    io.to(to).emit("ice-candidate", {
      from: socket.id,
      candidate,
    });
  });

  socket.on("renegotiate", (data) => {
    const parsed = renegotiateSchema.safeParse(data);
    if (!parsed.success) return emitInvalid("renegotiate", socket);
    const { to } = parsed.data;
    if (!to) return;
    if (!allowSignal(`${socket.id}:renegotiate`)) {
      return emitRateLimit("renegotiate", socket);
    }
    if (!peersInSameRoom(socket, to, "renegotiate")) return;

    io.to(to).emit("renegotiate", {
      from: socket.id,
    });
  });

  socket.on("caption", (data) => {
    const parsed = captionSchema.safeParse(data);
    if (!parsed.success) return emitInvalid("caption", socket);
    const { text, score, isSentence } = parsed.data;
    if (!allowCaption(`${socket.id}:caption`)) {
      return emitRateLimit("caption", socket);
    }

    const roomCode = roomService.getSocketRoom(socket.id);
    if (!roomCode) return;

    socket.to(roomCode).emit("caption", {
      from: socket.id,
      username: socket.username,
      text,
      score: score || 0,
      isSentence: !!isSentence,
      timestamp: Date.now(),
    });
  });
};
