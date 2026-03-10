/**
 * useWebRTC — Core WebRTC peer connection management hook.
 *
 * Handles:
 * - Peer connections lifecycle (create, offer, answer, ICE)
 * - Local media stream (camera/mic)
 * - Screen sharing
 * - Adaptive bitrate based on peer count
 * - ICE restart on failure
 * - Proper cleanup on unmount
 */
import { useCallback, useEffect, useRef, useState } from "react";
import {
  BITRATE_TIERS,
  ICE_SERVERS,
  MEDIA_CONSTRAINTS,
  SCREEN_CONSTRAINTS,
} from "../utils/constants";

const useWebRTC = ({ socket, username }) => {
  // --- Refs (mutable state not triggering re-renders) ---
  const connectionsRef = useRef(new Map()); // socketId → RTCPeerConnection
  const remoteStreamsRef = useRef(new Map()); // socketId → MediaStream
  const peerUsernamesRef = useRef(new Map()); // socketId → username
  const peerMediaRef = useRef(new Map()); // socketId → { video, audio }
  const localStreamRef = useRef(null);
  const screenStreamRef = useRef(null);
  const makingOfferRef = useRef(new Set()); // Glare resolution
  const pendingCandidatesRef = useRef(new Map()); // socketId → [candidates]

  // --- State ---
  const [localStream, setLocalStream] = useState(null);
  const [remoteStreams, setRemoteStreams] = useState([]); // [{ socketId, stream, username, video, audio }]
  const [video, setVideo] = useState(false);
  const [audio, setAudio] = useState(false);
  const [screen, setScreen] = useState(false);
  const [isConnected, setIsConnected] = useState(false);

  // Sync remoteStreamsRef → state (includes peer media status)
  const syncRemoteStreams = useCallback(() => {
    const streams = [];
    for (const [socketId, stream] of remoteStreamsRef.current) {
      const media = peerMediaRef.current.get(socketId) || {};
      streams.push({
        socketId,
        stream,
        username: peerUsernamesRef.current.get(socketId) || "Peer",
        video: media.video !== undefined ? media.video : true,
        audio: media.audio !== undefined ? media.audio : true,
      });
    }
    setRemoteStreams([...streams]);
  }, []);

  // --- Adaptive Bitrate ---
  const adjustBitrate = useCallback(async () => {
    const peerCount = connectionsRef.current.size;
    let tier = BITRATE_TIERS[1];
    for (const [threshold, t] of Object.entries(BITRATE_TIERS).sort(
      (a, b) => b[0] - a[0],
    )) {
      if (peerCount >= Number(threshold)) {
        tier = t;
        break;
      }
    }

    for (const pc of connectionsRef.current.values()) {
      const senders = pc.getSenders();
      for (const sender of senders) {
        if (!sender.track) continue;
        const params = sender.getParameters();
        if (!params.encodings?.[0]) continue;

        if (sender.track.kind === "video") {
          params.encodings[0].maxBitrate = tier.video * 1000;
        } else if (sender.track.kind === "audio") {
          params.encodings[0].maxBitrate = tier.audio * 1000;
        }

        try {
          await sender.setParameters(params);
        } catch {
          // Some browsers may not support this
        }
      }
    }
  }, []);

  // --- Create Peer Connection ---
  // @param {string} peerId
  // @param {string} peerUsername
  // @param {object} opts
  // @param {boolean} opts.suppressInitialNegotiation — skip the first
  //   onnegotiationneeded event (used when handleOffer creates the PC so we
  //   don't send a competing offer right after answering).
  const createPeerConnection = useCallback(
    (peerId, peerUsername, { suppressInitialNegotiation = false } = {}) => {
      if (connectionsRef.current.has(peerId)) {
        // Update username if provided
        if (peerUsername) peerUsernamesRef.current.set(peerId, peerUsername);
        return connectionsRef.current.get(peerId);
      }

      const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });

      // Store peer username
      if (peerUsername) peerUsernamesRef.current.set(peerId, peerUsername);

      // Add local tracks
      const stream = localStreamRef.current;
      if (stream) {
        const tracks = stream.getTracks();
        console.log(
          `[WebRTC] Adding ${tracks.length} local tracks to PC for ${peerId}:`,
          tracks.map((t) => `${t.kind}(${t.readyState})`).join(", "),
        );
        tracks.forEach((track) => {
          pc.addTrack(track, stream);
        });
      } else {
        console.warn(
          `[WebRTC] No local stream when creating PC for ${peerId} — remote side won't see/hear us`,
        );
      }

      // ICE candidate handler
      pc.onicecandidate = (event) => {
        if (event.candidate && socket) {
          socket.emit("ice-candidate", {
            to: peerId,
            candidate: event.candidate,
          });
        }
      };

      // Remote track handler
      pc.ontrack = (event) => {
        const [remoteStream] = event.streams;
        if (remoteStream) {
          console.log(
            `[WebRTC] Got remote track from ${peerId}: ${event.track.kind} (stream: ${remoteStream.id})`,
          );
          remoteStreamsRef.current.set(peerId, remoteStream);
          syncRemoteStreams();
        }
      };

      // Connection state monitoring
      pc.onconnectionstatechange = () => {
        const state = pc.connectionState;
        console.log(`[WebRTC] Connection to ${peerId}: ${state}`);

        if (state === "failed") {
          // ICE restart
          console.log(`[WebRTC] ICE restart for ${peerId}`);
          pc.restartIce();
        }

        if (state === "disconnected" || state === "closed") {
          // Clean up after delay (allow for reconnection)
          setTimeout(() => {
            if (
              pc.connectionState === "disconnected" ||
              pc.connectionState === "closed"
            ) {
              removePeer(peerId);
            }
          }, 5000);
        }
      };

      // Negotiation needed (for renegotiation — e.g. screen sharing)
      // The first fire is suppressed when the PC is created inside handleOffer
      // because we already handle negotiation explicitly in that path.
      let skipNextNegotiation = suppressInitialNegotiation;
      pc.onnegotiationneeded = async () => {
        if (skipNextNegotiation) {
          skipNextNegotiation = false;
          return;
        }
        try {
          makingOfferRef.current.add(peerId);
          const offer = await pc.createOffer();
          if (pc.signalingState !== "stable") return;
          await pc.setLocalDescription(offer);

          socket?.emit("offer", {
            to: peerId,
            offer: pc.localDescription,
          });
        } catch (err) {
          console.error("[WebRTC] Negotiation failed:", err);
        } finally {
          makingOfferRef.current.delete(peerId);
        }
      };

      connectionsRef.current.set(peerId, pc);
      adjustBitrate();
      return pc;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [socket, syncRemoteStreams, adjustBitrate],
  );

  // --- Remove Peer ---
  const removePeer = useCallback(
    (peerId) => {
      const pc = connectionsRef.current.get(peerId);
      if (pc) {
        pc.onicecandidate = null;
        pc.ontrack = null;
        pc.onconnectionstatechange = null;
        pc.onnegotiationneeded = null;
        pc.close();
        connectionsRef.current.delete(peerId);
      }
      remoteStreamsRef.current.delete(peerId);
      pendingCandidatesRef.current.delete(peerId);
      peerUsernamesRef.current.delete(peerId);
      peerMediaRef.current.delete(peerId);
      syncRemoteStreams();
      adjustBitrate();
    },
    [syncRemoteStreams, adjustBitrate],
  );

  // --- Refs for stable handler access (avoids effect re-registration) ---
  const createPeerConnectionRef = useRef(null);
  createPeerConnectionRef.current = createPeerConnection;
  const removePeerRef = useRef(null);
  removePeerRef.current = removePeer;

  // --- Participant tracking ---
  const [participantList, setParticipantList] = useState([]);

  // --- Signaling Handlers ---
  // NOTE: We use refs for createPeerConnection/removePeer so this effect
  // depends ONLY on `socket` (which is stable from useState). This prevents
  // handler deregistration/re-registration when callbacks change identity
  // (e.g. due to React Compiler auto-memoization or StrictMode double-mount).
  useEffect(() => {
    if (!socket) return;

    // When we join a room, create offers to all existing peers
    const handleRoomJoined = ({ participants }) => {
      console.log(
        `[WebRTC] Room joined. Existing participants: ${participants.length}`,
        participants.map((p) => `${p.username}(${p.socketId})`),
      );
      setIsConnected(true);
      setParticipantList(
        participants.map((p) => ({
          socketId: p.socketId,
          username: p.username || "Guest",
        })),
      );
      participants.forEach(({ socketId, username: peerName }) => {
        const pc = createPeerConnectionRef.current(socketId, peerName, {
          suppressInitialNegotiation: true,
        });
        (async () => {
          try {
            makingOfferRef.current.add(socketId);
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            socket.emit("offer", { to: socketId, offer: pc.localDescription });
            console.log(`[WebRTC] Sent offer to ${peerName} (${socketId})`);
          } catch (err) {
            console.error("[WebRTC] Offer creation failed:", err);
          } finally {
            makingOfferRef.current.delete(socketId);
          }
        })();
      });
    };

    // When a new user joins, DON'T create a PC yet.
    // Wait for their offer (sent from their handleRoomJoined).
    const handleUserJoined = ({ socketId, username: peerName }) => {
      if (peerName) peerUsernamesRef.current.set(socketId, peerName);
      setParticipantList((prev) => [
        ...prev,
        { socketId, username: peerName || "Guest" },
      ]);
      console.log(
        `[WebRTC] ${peerName} (${socketId}) joined — waiting for their offer`,
      );
    };

    // When a user leaves
    const handleUserLeft = ({ socketId }) => {
      removePeerRef.current(socketId);
      setParticipantList((prev) => prev.filter((p) => p.socketId !== socketId));
    };

    // Handle incoming SDP offer (with glare / rollback support)
    const handleOffer = async ({ from, offer, username: peerName }) => {
      console.log(`[WebRTC] Received offer from ${peerName} (${from})`);
      const pc = createPeerConnectionRef.current(from, peerName, {
        suppressInitialNegotiation: true,
      });

      try {
        const isGlare =
          makingOfferRef.current.has(from) && pc.signalingState !== "stable";

        if (isGlare) {
          // We are the impolite peer — ignore their offer
          console.log(`[WebRTC] Glare detected with ${from}, ignoring offer`);
          return;
        }

        // If we're in "have-local-offer" state (shouldn't happen after the
        // glare fix, but as a safety net), modern browsers will do implicit
        // rollback when setRemoteDescription is called with an offer.
        await pc.setRemoteDescription(new RTCSessionDescription(offer));

        // Flush pending ICE candidates
        const pending = pendingCandidatesRef.current.get(from) || [];
        for (const candidate of pending) {
          await pc.addIceCandidate(new RTCIceCandidate(candidate));
        }
        pendingCandidatesRef.current.delete(from);

        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);

        socket.emit("answer", {
          to: from,
          answer: pc.localDescription,
        });
        console.log(`[WebRTC] Sent answer to ${peerName} (${from})`);
      } catch (err) {
        console.error("[WebRTC] Handle offer error:", err);
      }
    };

    // Handle incoming SDP answer
    const handleAnswer = async ({ from, answer }) => {
      console.log(`[WebRTC] Received answer from ${from}`);
      const pc = connectionsRef.current.get(from);
      if (!pc) return;

      try {
        // Accept answer if we have a pending local offer
        if (pc.signalingState === "have-local-offer") {
          await pc.setRemoteDescription(new RTCSessionDescription(answer));

          // Flush pending ICE candidates
          const pending = pendingCandidatesRef.current.get(from) || [];
          for (const candidate of pending) {
            await pc.addIceCandidate(new RTCIceCandidate(candidate));
          }
          pendingCandidatesRef.current.delete(from);
        } else {
          console.warn(
            `[WebRTC] Dropping answer from ${from} — signalingState is "${pc.signalingState}" (expected "have-local-offer")`,
          );
        }
      } catch (err) {
        console.error("[WebRTC] Handle answer error:", err);
      }
    };

    // Handle incoming ICE candidate
    const handleIceCandidate = async ({ from, candidate }) => {
      const pc = connectionsRef.current.get(from);

      if (!pc || !pc.remoteDescription) {
        // Queue if remote description not set yet
        if (!pendingCandidatesRef.current.has(from)) {
          pendingCandidatesRef.current.set(from, []);
        }
        pendingCandidatesRef.current.get(from).push(candidate);
        return;
      }

      try {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (err) {
        console.error("[WebRTC] ICE candidate error:", err);
      }
    };

    // Handle remote peer media state changes (video/audio toggles)
    const handlePeerMediaUpdate = ({ socketId, video, audio }) => {
      const current = peerMediaRef.current.get(socketId) || {};
      if (typeof video === "boolean") current.video = video;
      if (typeof audio === "boolean") current.audio = audio;
      peerMediaRef.current.set(socketId, current);
      syncRemoteStreams();
    };

    socket.on("room-joined", handleRoomJoined);
    socket.on("user-joined", handleUserJoined);
    socket.on("user-left", handleUserLeft);
    socket.on("offer", handleOffer);
    socket.on("answer", handleAnswer);
    socket.on("ice-candidate", handleIceCandidate);
    socket.on("peer-media-update", handlePeerMediaUpdate);

    return () => {
      socket.off("room-joined", handleRoomJoined);
      socket.off("user-joined", handleUserJoined);
      socket.off("user-left", handleUserLeft);
      socket.off("offer", handleOffer);
      socket.off("answer", handleAnswer);
      socket.off("ice-candidate", handleIceCandidate);
      socket.off("peer-media-update", handlePeerMediaUpdate);
    };
  }, [socket]);

  // --- Start Local Stream ---
  const startLocalStream = useCallback(async () => {
    try {
      const stream =
        await navigator.mediaDevices.getUserMedia(MEDIA_CONSTRAINTS);
      localStreamRef.current = stream;
      setLocalStream(stream);

      // Default: video and audio ON
      setVideo(true);
      setAudio(true);

      return stream;
    } catch (err) {
      console.error("[WebRTC] getUserMedia failed:", err);

      // Fallback: try audio only
      try {
        const audioStream = await navigator.mediaDevices.getUserMedia({
          video: false,
          audio: MEDIA_CONSTRAINTS.audio,
        });
        localStreamRef.current = audioStream;
        setLocalStream(audioStream);
        setVideo(false);
        setAudio(true);
        return audioStream;
      } catch (audioErr) {
        console.error("[WebRTC] Audio-only fallback also failed:", audioErr);
        throw audioErr;
      }
    }
  }, []);

  // --- Toggle Video ---
  const toggleVideo = useCallback(() => {
    const stream = localStreamRef.current;
    if (!stream) return;

    const videoTrack = stream.getVideoTracks()[0];
    if (videoTrack) {
      videoTrack.enabled = !videoTrack.enabled;
      setVideo(videoTrack.enabled);
      socket?.emit("media-state-update", { video: videoTrack.enabled });
    }
  }, [socket]);

  // --- Toggle Audio ---
  const toggleAudio = useCallback(() => {
    const stream = localStreamRef.current;
    if (!stream) return;

    const audioTrack = stream.getAudioTracks()[0];
    if (audioTrack) {
      audioTrack.enabled = !audioTrack.enabled;
      setAudio(audioTrack.enabled);
      socket?.emit("media-state-update", { audio: audioTrack.enabled });
    }
  }, [socket]);

  // --- Toggle Screen Share ---
  const toggleScreenShare = useCallback(async () => {
    if (screen && screenStreamRef.current) {
      // Stop screen share — revert to camera
      screenStreamRef.current.getTracks().forEach((t) => t.stop());
      screenStreamRef.current = null;
      setScreen(false);

      // Replace screen track with camera track in all peer connections
      const cameraTrack = localStreamRef.current?.getVideoTracks()[0];
      if (cameraTrack) {
        for (const pc of connectionsRef.current.values()) {
          const sender = pc.getSenders().find((s) => s.track?.kind === "video");
          if (sender) await sender.replaceTrack(cameraTrack);
        }
      }
      return;
    }

    try {
      const screenStream =
        await navigator.mediaDevices.getDisplayMedia(SCREEN_CONSTRAINTS);
      screenStreamRef.current = screenStream;
      setScreen(true);

      const screenTrack = screenStream.getVideoTracks()[0];

      // Replace camera track with screen track in all peers
      for (const pc of connectionsRef.current.values()) {
        const sender = pc.getSenders().find((s) => s.track?.kind === "video");
        if (sender) await sender.replaceTrack(screenTrack);
      }

      // Handle user stopping screen share via browser UI
      screenTrack.onended = () => {
        toggleScreenShare();
      };
    } catch (err) {
      console.error("[WebRTC] Screen share failed:", err);
      setScreen(false);
    }
  }, [screen]);

  // --- Join Room ---
  const joinRoom = useCallback(
    (code, displayName) => {
      if (!socket || !code) {
        console.warn(
          "[WebRTC] joinRoom skipped — socket:",
          !!socket,
          "code:",
          code,
        );
        return;
      }

      const doJoin = () => {
        console.log(
          `[WebRTC] Emitting join-room: code=${code}, username=${displayName || username}, socketId=${socket.id}`,
        );
        socket.emit("join-room", {
          roomCode: code,
          username: displayName || username,
        });
      };

      if (socket.connected) {
        doJoin();
      } else {
        console.log("[WebRTC] Socket not connected yet, waiting for connect…");
        socket.once("connect", doJoin);
      }
    },
    [socket, username],
  );

  // --- Leave / End Call ---
  const endCall = useCallback(() => {
    // Stop all remote connections — snapshot keys first to avoid mutation during iteration
    const peerIds = [...connectionsRef.current.keys()];
    for (const peerId of peerIds) {
      removePeer(peerId);
    }

    // Stop local media
    localStreamRef.current?.getTracks().forEach((t) => t.stop());
    localStreamRef.current = null;
    setLocalStream(null);

    // Stop screen share
    screenStreamRef.current?.getTracks().forEach((t) => t.stop());
    screenStreamRef.current = null;

    setVideo(false);
    setAudio(false);
    setScreen(false);
    setIsConnected(false);

    socket?.emit("leave-room");
  }, [socket, removePeer]);

  // --- Cleanup on unmount ---
  // Empty deps → runs cleanup ONLY on actual unmount, not on re-renders.
  // Inline cleanup avoids depending on removePeer (whose identity could
  // change and cause the effect to re-run, killing all connections).
  useEffect(() => {
    return () => {
      for (const pc of connectionsRef.current.values()) {
        pc.onicecandidate = null;
        pc.ontrack = null;
        pc.onconnectionstatechange = null;
        pc.onnegotiationneeded = null;
        pc.close();
      }
      connectionsRef.current.clear();
      remoteStreamsRef.current.clear();
      pendingCandidatesRef.current.clear();
      peerUsernamesRef.current.clear();
      peerMediaRef.current.clear();
      localStreamRef.current?.getTracks().forEach((t) => t.stop());
      screenStreamRef.current?.getTracks().forEach((t) => t.stop());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    localStream,
    remoteStreams,
    participantList,
    video,
    audio,
    screen,
    isConnected,
    startLocalStream,
    joinRoom,
    endCall,
    toggleVideo,
    toggleAudio,
    toggleScreenShare,
  };
};

export default useWebRTC;
