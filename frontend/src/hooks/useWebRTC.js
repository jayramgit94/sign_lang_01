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
  ADAPTIVE_BITRATE_FACTORS,
  ADAPTIVE_VIDEO_PROFILES,
  ADAPTIVE_VIDEO_THRESHOLDS,
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
  const roomCodeRef = useRef(null); // For auto-rejoin on reconnect
  const roomUsernameRef = useRef(null);

  // --- State ---
  const [localStream, setLocalStream] = useState(null);
  const [remoteStreams, setRemoteStreams] = useState([]); // [{ socketId, stream, username, video, audio }]
  const [video, setVideo] = useState(false);
  const [audio, setAudio] = useState(false);
  const [screen, setScreen] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [canScreenShare, setCanScreenShare] = useState(false);
  const [screenShareSupportReason, setScreenShareSupportReason] =
    useState("Screen sharing is not available on this device/browser.");
  const [screenShareError, setScreenShareError] = useState("");
  const videoProfileRef = useRef("high");
  const bitrateFactorRef = useRef(1);

  // Detect screen-share support once on mount
  useEffect(() => {
    if (typeof window === "undefined" || typeof navigator === "undefined") {
      setCanScreenShare(false);
      setScreenShareSupportReason("Screen sharing is unavailable in this environment.");
      return;
    }

    const ua = navigator.userAgent || "";
    const isIOS = /iPhone|iPad|iPod/i.test(ua);
    const hasDisplayMedia = !!navigator.mediaDevices?.getDisplayMedia;
    const isSecure =
      window.isSecureContext ||
      window.location.hostname === "localhost" ||
      window.location.hostname === "127.0.0.1";

    if (!hasDisplayMedia) {
      setCanScreenShare(false);
      setScreenShareSupportReason(
        "Your browser does not support screen sharing. Try latest Chrome or Edge.",
      );
      return;
    }

    if (!isSecure) {
      setCanScreenShare(false);
      setScreenShareSupportReason(
        "Screen sharing requires HTTPS (or localhost in development).",
      );
      return;
    }

    if (isIOS) {
      setCanScreenShare(false);
      setScreenShareSupportReason(
        "Screen sharing is limited on iOS browsers. Use desktop or Android Chrome.",
      );
      return;
    }

    setCanScreenShare(true);
    setScreenShareSupportReason("");
  }, []);

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

        const factor = bitrateFactorRef.current || 1;
        const audioFactor = Math.max(0.75, factor);

        if (sender.track.kind === "video") {
          params.encodings[0].maxBitrate = Math.round(tier.video * factor * 1000);
        } else if (sender.track.kind === "audio") {
          params.encodings[0].maxBitrate = Math.round(tier.audio * audioFactor * 1000);
        }

        try {
          await sender.setParameters(params);
        } catch {
          // Some browsers may not support this
        }
      }
    }
  }, []);

  const applyAdaptiveVideoConstraints = useCallback(
    async (profileId) => {
      if (screenStreamRef.current) return;

      const stream = localStreamRef.current;
      const track = stream?.getVideoTracks?.()[0];
      if (!track || typeof track.applyConstraints !== "function") return;

      if (videoProfileRef.current === profileId) return;

      const profile = ADAPTIVE_VIDEO_PROFILES[profileId];
      if (!profile) return;

      try {
        await track.applyConstraints({
          width: { ideal: profile.width, max: profile.width },
          height: { ideal: profile.height, max: profile.height },
          frameRate: { ideal: profile.fps, max: profile.fps },
        });
        videoProfileRef.current = profileId;
      } catch {
        // Ignore constraint failures on unsupported devices.
      }
    },
    [],
  );

  const measureNetworkAndAdapt = useCallback(async () => {
    const connections = connectionsRef.current;
    if (!connections || connections.size === 0) return;

    let totalRtt = 0;
    let rttCount = 0;
    let totalPacketsLost = 0;
    let totalPacketsReceived = 0;

    for (const pc of connections.values()) {
      if (pc.connectionState !== "connected") continue;

      try {
        const report = await pc.getStats();
        report.forEach((stat) => {
          if (stat.type === "candidate-pair" && stat.state === "succeeded") {
            totalRtt += stat.currentRoundTripTime || 0;
            rttCount++;
          }
          if (stat.type === "inbound-rtp" && stat.kind === "video") {
            totalPacketsLost += stat.packetsLost || 0;
            totalPacketsReceived += stat.packetsReceived || 0;
          }
        });
      } catch {
        // Stats may not be available
      }
    }

    if (rttCount === 0) return;

    const avgRttMs = (totalRtt / rttCount) * 1000;
    const totalPackets = totalPacketsLost + totalPacketsReceived;
    const lossPct = totalPackets > 0 ? (totalPacketsLost / totalPackets) * 100 : 0;

    let nextProfile = "high";
    if (
      avgRttMs >= ADAPTIVE_VIDEO_THRESHOLDS.low.rttMs ||
      lossPct >= ADAPTIVE_VIDEO_THRESHOLDS.low.lossPct
    ) {
      nextProfile = "low";
    } else if (
      avgRttMs >= ADAPTIVE_VIDEO_THRESHOLDS.medium.rttMs ||
      lossPct >= ADAPTIVE_VIDEO_THRESHOLDS.medium.lossPct
    ) {
      nextProfile = "medium";
    }

    bitrateFactorRef.current =
      ADAPTIVE_BITRATE_FACTORS[nextProfile] ?? ADAPTIVE_BITRATE_FACTORS.high;

    await applyAdaptiveVideoConstraints(nextProfile);
    await adjustBitrate();
  }, [adjustBitrate, applyAdaptiveVideoConstraints]);

  useEffect(() => {
    const intervalId = setInterval(() => {
      void measureNetworkAndAdapt();
    }, 8000);

    return () => clearInterval(intervalId);
  }, [measureNetworkAndAdapt]);

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
  }, [socket, syncRemoteStreams]);

  // --- Re-join room on socket reconnect ---
  useEffect(() => {
    if (!socket) return;

    const handleReconnect = () => {
      if (!roomCodeRef.current) return;

      console.log(
        `[WebRTC] Socket reconnected, re-joining room ${roomCodeRef.current}`,
      );

      // Clean up stale peer connections from before disconnect
      for (const peerId of [...connectionsRef.current.keys()]) {
        removePeerRef.current(peerId);
      }

      socket.emit("join-room", {
        roomCode: roomCodeRef.current,
        username: roomUsernameRef.current || "Guest",
      });
    };

    socket.on("connect", handleReconnect);
    return () => socket.off("connect", handleReconnect);
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
  const toggleVideo = useCallback(async () => {
    const stream = localStreamRef.current;
    if (!stream) return;

    let videoTrack = stream.getVideoTracks()[0];

    // Normal path: flip the enabled flag on the current live camera track.
    if (videoTrack && videoTrack.readyState === "live") {
      videoTrack.enabled = !videoTrack.enabled;
      setVideo(videoTrack.enabled);
      socket?.emit("media-state-update", { video: videoTrack.enabled });
      return;
    }

    // Recovery path: the stream has no live video track (e.g. started audio-only
    // or camera track ended). Request a fresh camera track and publish it.
    if (videoTrack) {
      try {
        stream.removeTrack(videoTrack);
      } catch {
        // removeTrack can fail in some browsers if the track was already detached.
      }
      videoTrack.stop();
      videoTrack = null;
    }

    try {
      const camStream = await navigator.mediaDevices.getUserMedia({
        video: MEDIA_CONSTRAINTS.video,
        audio: false,
      });

      const newTrack = camStream.getVideoTracks()[0];
      if (!newTrack) {
        setVideo(false);
        socket?.emit("media-state-update", { video: false });
        return;
      }

      stream.addTrack(newTrack);

      for (const pc of connectionsRef.current.values()) {
        try {
          const sender = pc.getSenders().find((s) => s.track?.kind === "video");
          if (sender) {
            await sender.replaceTrack(newTrack);
          } else {
            pc.addTrack(newTrack, stream);
          }
        } catch (err) {
          console.error("[WebRTC] Failed to attach new camera track:", err);
        }
      }

      newTrack.onended = () => {
        setVideo(false);
        socket?.emit("media-state-update", { video: false });
      };

      setVideo(true);
      socket?.emit("media-state-update", { video: true });
    } catch (err) {
      console.error("[WebRTC] Could not re-enable camera:", err);
      setVideo(false);
      socket?.emit("media-state-update", { video: false });
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
  const stopScreenShare = useCallback(async () => {
    if (!screenStreamRef.current) {
      setScreen(false);
      return;
    }

    screenStreamRef.current.getTracks().forEach((t) => t.stop());
    screenStreamRef.current = null;
    setScreen(false);
    socket?.emit("screen-share", { active: false });

    const cameraTrack = localStreamRef.current?.getVideoTracks()?.[0];
    if (!cameraTrack) {
      console.warn("[WebRTC] Camera track not available after screen share stop");
      return;
    }

    const errors = [];
    for (const pc of connectionsRef.current.values()) {
      try {
        const sender = pc.getSenders().find((s) => s.track?.kind === "video");
        if (sender) {
          await sender.replaceTrack(cameraTrack);
        }
      } catch (err) {
        console.error("[WebRTC] Failed to replace screen with camera track:", err);
        errors.push(err);
      }
    }

    if (errors.length > 0) {
      console.warn(`[WebRTC] ${errors.length} peers failed to restore camera track`);
    }
  }, [socket]);

  const toggleScreenShare = useCallback(async () => {
    setScreenShareError("");

    if (!canScreenShare) {
      setScreenShareError(
        screenShareSupportReason ||
          "Screen sharing is not available on this device/browser.",
      );
      return;
    }

    if (screenStreamRef.current) {
      await stopScreenShare();
      return;
    }

    try {
      // Request screen
      const screenStream =
        await navigator.mediaDevices.getDisplayMedia(SCREEN_CONSTRAINTS);
      screenStreamRef.current = screenStream;
      setScreen(true);

      // Emit socket event to notify peers
      socket?.emit("screen-share", { active: true });

      const screenTrack = screenStream.getVideoTracks()[0];
      if (!screenTrack) {
        console.error("[WebRTC] No video track in screen stream");
        setScreen(false);
        return;
      }

      // Replace camera track with screen track in all peers
      const trackErrors = [];
      for (const pc of connectionsRef.current.values()) {
        try {
          const sender = pc.getSenders().find((s) => s.track?.kind === "video");
          if (sender) {
            await sender.replaceTrack(screenTrack);
          }
        } catch (err) {
          console.error("[WebRTC] Failed to replace track with screen:", err);
          trackErrors.push(err);
        }
      }

      // Handle user stopping screen share via browser UI
      screenTrack.onended = () => {
        if (!screenStreamRef.current) return;
        void stopScreenShare();
      };

      if (trackErrors.length > 0) {
        console.warn(
          `[WebRTC] ${trackErrors.length} peers failed to update screen track`,
        );
      }
    } catch (err) {
      console.error("[WebRTC] Screen share failed:", err);
      setScreen(false);

      const messageByName = {
        NotAllowedError:
          "Screen sharing permission denied. Please allow screen sharing.",
        NotFoundError: "No screen or window source found to share.",
        AbortError: "Screen sharing was cancelled.",
        NotSupportedError: "Screen sharing is not supported in this browser.",
      };

      setScreenShareError(
        messageByName[err?.name] ||
          "Could not start screen sharing. Please try again.",
      );
    }
  }, [canScreenShare, screenShareSupportReason, stopScreenShare, socket]);

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

      roomCodeRef.current = code;
      roomUsernameRef.current = displayName || username;

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
    roomCodeRef.current = null;
    roomUsernameRef.current = null;

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
    const connectionsSnapshot = connectionsRef.current;
    const remoteStreamsSnapshot = remoteStreamsRef.current;
    const pendingCandidatesSnapshot = pendingCandidatesRef.current;
    const peerUsernamesSnapshot = peerUsernamesRef.current;
    const peerMediaSnapshot = peerMediaRef.current;

    return () => {
      for (const pc of connectionsSnapshot.values()) {
        pc.onicecandidate = null;
        pc.ontrack = null;
        pc.onconnectionstatechange = null;
        pc.onnegotiationneeded = null;
        pc.close();
      }
      connectionsSnapshot.clear();
      remoteStreamsSnapshot.clear();
      pendingCandidatesSnapshot.clear();
      peerUsernamesSnapshot.clear();
      peerMediaSnapshot.clear();
      localStreamRef.current?.getTracks().forEach((t) => t.stop());
      screenStreamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  return {
    localStream,
    remoteStreams,
    participantList,
    video,
    audio,
    screen,
    canScreenShare,
    screenShareSupportReason,
    screenShareError,
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
