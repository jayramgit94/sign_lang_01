/**
 * useSignLanguage — Sign language recognition via the ONNX server.
 *
 * Captures landmarks from local video using MediaPipe Holistic,
 * flattens them into a 1530-length vector matching the server's expected format:
 *   [leftHand(21×3) + rightHand(21×3) + face(468×3)] = 126 + 1404 = 1530
 * Sends to Python inference server, receives predictions, and broadcasts
 * captions to room peers.
 *
 * Supports multiple simultaneous signers — each user's caption is
 * tracked independently with per-user auto-clear timers.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { io as socketIO } from "socket.io-client";
import { SIGN_LANG_SERVER_URL } from "../utils/constants";

/** Minimum interval between landmark sends (ms) — ~6-7 fps */
const SEND_INTERVAL_MS = 150;
/** Minimum prediction confidence to display */
const CONFIDENCE_THRESHOLD = 0.6;

/**
 * Flatten an array of MediaPipe landmarks [{x,y,z}, ...] into [x,y,z,x,y,z,...].
 */
const flattenLandmarks = (landmarks) => {
  const out = [];
  for (const pt of landmarks) {
    out.push(pt.x, pt.y, pt.z);
  }
  return out;
};

const useSignLanguage = ({ localStream, socket, username }) => {
  const [isEnabled, setIsEnabled] = useState(false);
  const [captionText, setCaptionText] = useState("");
  const [captionScore, setCaptionScore] = useState(0);
  const [correctedSentence, setCorrectedSentence] = useState("");
  const [remoteCaptions, setRemoteCaptions] = useState([]); // [{ username, text, score, timestamp }]

  const signSocketRef = useRef(null);
  const holisticRef = useRef(null);
  const cameraRef = useRef(null);
  const videoElRef = useRef(null);
  const captionTimeoutRef = useRef(null);
  const lastSentTimeRef = useRef(0);
  // Per-user clear timers for remote captions
  const remoteCaptionTimersRef = useRef(new Map()); // username → timeoutId

  // Listen for remote captions from room peers (supports multiple signers)
  useEffect(() => {
    if (!socket) return;

    const handleCaption = ({ username: sender, text, score, timestamp }) => {
      // Clear any existing timer for this sender
      const existingTimer = remoteCaptionTimersRef.current.get(sender);
      if (existingTimer) clearTimeout(existingTimer);

      // Update or add caption for this sender (keep all other senders' captions)
      setRemoteCaptions((prev) => {
        const updated = prev.filter((c) => c.username !== sender);
        updated.push({ username: sender, text, score, timestamp });
        return updated;
      });

      // Set per-user auto-clear timer (5 seconds)
      const timerId = setTimeout(() => {
        setRemoteCaptions((prev) => prev.filter((c) => c.username !== sender));
        remoteCaptionTimersRef.current.delete(sender);
      }, 5000);
      remoteCaptionTimersRef.current.set(sender, timerId);
    };

    socket.on("caption", handleCaption);
    return () => {
      socket.off("caption", handleCaption);
      // Clear all timers on unmount
      for (const timer of remoteCaptionTimersRef.current.values()) {
        clearTimeout(timer);
      }
      remoteCaptionTimersRef.current.clear();
    };
  }, [socket]);

  // Connect to sign language inference server
  const connectSignServer = useCallback(() => {
    if (!SIGN_LANG_SERVER_URL) {
      console.warn("[SignLang] No server URL configured.");
      return null;
    }

    const signSocket = socketIO(SIGN_LANG_SERVER_URL, {
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionAttempts: 5,
      timeout: 10000,
    });

    signSocket.on("connect", () => {
      console.log("[SignLang] Connected to inference server.");
    });

    // Server responds with { label, score } (or { error })
    signSocket.on("prediction", (data) => {
      if (data.error) {
        console.warn("[SignLang] Prediction error:", data.error);
        return;
      }

      if (data.label && data.score > CONFIDENCE_THRESHOLD) {
        setCaptionText(data.label);
        setCaptionScore(data.score);

        // Broadcast to room peers via main socket
        socket?.emit("caption", {
          text: data.label,
          score: data.score,
        });

        // Clear local caption after 3 seconds
        clearTimeout(captionTimeoutRef.current);
        captionTimeoutRef.current = setTimeout(() => {
          setCaptionText("");
          setCaptionScore(0);
        }, 3000);
      }
    });

    signSocket.on("connect_error", (err) => {
      console.warn("[SignLang] Connection error:", err.message);
    });

    // Corrected sentence from Grok API (after pause detection)
    signSocket.on("corrected_sentence", (data) => {
      console.log("[SignLang] Sentence:", data.raw, "→", data.corrected);
      setCorrectedSentence(data.corrected);

      // Broadcast corrected sentence to room peers
      socket?.emit("caption", {
        text: data.corrected,
        score: 1.0,
        isSentence: true,
      });

      // Clear after 8 seconds (sentences stay longer than single words)
      setTimeout(() => setCorrectedSentence(""), 8000);
    });

    signSocketRef.current = signSocket;
    return signSocket;
  }, [socket]);

  // Initialize MediaPipe Holistic and start processing
  const startRecognition = useCallback(async () => {
    if (!localStream) {
      console.warn("[SignLang] No local stream available.");
      return;
    }

    const signSocket = connectSignServer();
    if (!signSocket) return;

    // Create a hidden video element for MediaPipe
    const videoEl = document.createElement("video");
    videoEl.srcObject = localStream;
    videoEl.setAttribute("playsinline", "");
    videoEl.muted = true;
    videoElRef.current = videoEl;

    try {
      // Load MediaPipe Holistic (CDN-loaded scripts)
      const Holistic = window.Holistic;
      const Camera = window.Camera;

      if (!Holistic || !Camera) {
        console.error(
          "[SignLang] MediaPipe scripts not loaded. Ensure CDN scripts are in index.html.",
        );
        signSocket.disconnect();
        return;
      }

      const holistic = new Holistic({
        locateFile: (file) =>
          `https://cdn.jsdelivr.net/npm/@mediapipe/holistic/${file}`,
      });

      holistic.setOptions({
        modelComplexity: 0,
        smoothLandmarks: true,
        enableSegmentation: false,
        refineFaceLandmarks: false,
        minDetectionConfidence: 0.5,
        minTrackingConfidence: 0.5,
      });

      holistic.onResults((results) => {
        if (!signSocketRef.current?.connected) return;

        // Throttle: skip if too soon since last send
        const now = performance.now();
        if (now - lastSentTimeRef.current < SEND_INTERVAL_MS) return;

        // Need at least one hand to make a prediction
        const hasLeftHand = !!results.leftHandLandmarks;
        const hasRightHand = !!results.rightHandLandmarks;
        if (!hasLeftHand && !hasRightHand) return;

        // Build the 1530-length vector matching the server's expected format:
        //   [leftHand(21×3=63) + rightHand(21×3=63) + face(468×3=1404)]
        let handVector = [];
        if (hasLeftHand) {
          handVector.push(...flattenLandmarks(results.leftHandLandmarks));
        } else {
          // Pad left hand with zeros (21 points × 3 = 63 values)
          handVector.push(...new Array(63).fill(0));
        }
        if (hasRightHand) {
          handVector.push(...flattenLandmarks(results.rightHandLandmarks));
        } else {
          // Pad right hand with zeros
          handVector.push(...new Array(63).fill(0));
        }
        // Ensure exactly 126 hand values
        handVector = handVector.slice(0, 126);
        while (handVector.length < 126) handVector.push(0);

        // Face landmarks (468 points × 3 = 1404 values)
        let faceVector = results.faceLandmarks
          ? flattenLandmarks(results.faceLandmarks)
          : [];
        faceVector = faceVector.slice(0, 1404);
        while (faceVector.length < 1404) faceVector.push(0);

        // Concatenate: hand(126) + face(1404) = 1530
        const fullVector = handVector.concat(faceVector).slice(0, 1530);

        // Send as "landmark" (singular) — matches server event name
        signSocketRef.current.emit("landmark", {
          vector: fullVector,
          normalized: false,
        });

        lastSentTimeRef.current = now;
      });

      holisticRef.current = holistic;

      // Start camera processing
      await videoEl.play();
      const camera = new Camera(videoEl, {
        onFrame: async () => {
          await holistic.send({ image: videoEl });
        },
        width: 640,
        height: 480,
      });
      camera.start();
      cameraRef.current = camera;

      setIsEnabled(true);
    } catch (err) {
      console.error("[SignLang] Initialization failed:", err);
      signSocket.disconnect();
    }
  }, [localStream, connectSignServer]);

  // Stop recognition
  const stopRecognition = useCallback(() => {
    cameraRef.current?.stop();
    cameraRef.current = null;

    holisticRef.current?.close();
    holisticRef.current = null;

    if (videoElRef.current) {
      videoElRef.current.srcObject = null;
      videoElRef.current.remove();
      videoElRef.current = null;
    }

    signSocketRef.current?.disconnect();
    signSocketRef.current = null;

    clearTimeout(captionTimeoutRef.current);
    setCaptionText("");
    setCaptionScore(0);
    setIsEnabled(false);
  }, []);

  // Toggle
  const toggle = useCallback(() => {
    if (isEnabled) {
      stopRecognition();
    } else {
      startRecognition();
    }
  }, [isEnabled, startRecognition, stopRecognition]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopRecognition();
    };
  }, [stopRecognition]);

  return {
    isEnabled,
    toggle,
    captionText,
    captionScore,
    correctedSentence,
    remoteCaptions,
  };
};

export default useSignLanguage;
