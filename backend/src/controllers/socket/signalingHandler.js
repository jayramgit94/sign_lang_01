/**
 * WebRTC Signaling Handler — Relay offers, answers, and ICE candidates.
 *
 * The server acts as a pure relay for WebRTC signaling.
 * No media passes through the server.
 */
import roomService from "../../services/room.service.js";

export const registerSignalingHandlers = (io, socket) => {
  /**
   * Relay SDP offer to a specific peer.
   * @param {{ to: string, offer: RTCSessionDescriptionInit }} data
   */
  socket.on("offer", (data) => {
    const { to, offer } = data || {};
    if (!to || !offer) return;

    // Verify both sockets are in the same room
    const myRoom = roomService.getSocketRoom(socket.id);
    const theirRoom = roomService.getSocketRoom(to);
    if (!myRoom || myRoom !== theirRoom) return;

    io.to(to).emit("offer", {
      from: socket.id,
      offer,
      username: socket.username,
    });
  });

  /**
   * Relay SDP answer to a specific peer.
   * @param {{ to: string, answer: RTCSessionDescriptionInit }} data
   */
  socket.on("answer", (data) => {
    const { to, answer } = data || {};
    if (!to || !answer) return;

    const myRoom = roomService.getSocketRoom(socket.id);
    const theirRoom = roomService.getSocketRoom(to);
    if (!myRoom || myRoom !== theirRoom) return;

    io.to(to).emit("answer", {
      from: socket.id,
      answer,
    });
  });

  /**
   * Relay ICE candidate to a specific peer.
   * @param {{ to: string, candidate: RTCIceCandidateInit }} data
   */
  socket.on("ice-candidate", (data) => {
    const { to, candidate } = data || {};
    if (!to || !candidate) return;

    const myRoom = roomService.getSocketRoom(socket.id);
    const theirRoom = roomService.getSocketRoom(to);
    if (!myRoom || myRoom !== theirRoom) return;

    io.to(to).emit("ice-candidate", {
      from: socket.id,
      candidate,
    });
  });

  /**
   * Handle renegotiation (e.g., when screen sharing starts/stops).
   */
  socket.on("renegotiate", (data) => {
    const { to } = data || {};
    if (!to) return;

    const myRoom = roomService.getSocketRoom(socket.id);
    const theirRoom = roomService.getSocketRoom(to);
    if (!myRoom || myRoom !== theirRoom) return;

    io.to(to).emit("renegotiate", {
      from: socket.id,
    });
  });

  /**
   * Broadcast caption/sign language text to room peers.
   */
  socket.on("caption", (data) => {
    const { text, score, isSentence } = data || {};
    if (!text) return;

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
