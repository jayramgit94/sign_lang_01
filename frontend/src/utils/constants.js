/**
 * Constants — Centralized app configuration.
 */
export const ICE_SERVERS = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
  { urls: "stun:stun2.l.google.com:19302" },
];

// Add TURN servers from env if provided
if (import.meta.env.VITE_TURN_URL) {
  ICE_SERVERS.push({
    urls: import.meta.env.VITE_TURN_URL,
    username: import.meta.env.VITE_TURN_USERNAME || "",
    credential: import.meta.env.VITE_TURN_CREDENTIAL || "",
  });
}

export const MEDIA_CONSTRAINTS = {
  video: {
    width: { ideal: 1280, max: 1920 },
    height: { ideal: 720, max: 1080 },
    frameRate: { ideal: 30, max: 30 },
    facingMode: "user",
  },
  audio: {
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
    sampleRate: 48000,
  },
};

export const SCREEN_CONSTRAINTS = {
  video: {
    cursor: "always",
    width: { ideal: 1920 },
    height: { ideal: 1080 },
    frameRate: { ideal: 15, max: 30 },
  },
  audio: false,
};

/**
 * Adaptive bitrate thresholds (kbps) based on number of peers.
 */
export const BITRATE_TIERS = {
  1: { video: 2500, audio: 128 }, // 1-on-1
  2: { video: 1500, audio: 96 }, // 3 people
  3: { video: 1000, audio: 64 }, // 4 people
  5: { video: 600, audio: 48 }, // 6 people
  8: { video: 400, audio: 32 }, // 9+ people
};

export const SIGN_LANG_SERVER_URL =
  import.meta.env.VITE_SIGN_LANG_URL ||
  (import.meta.env.DEV ? "http://localhost:5000" : "");

export const MAX_CHAT_MESSAGE_LENGTH = 2000;

export const CONNECTION_QUALITY = {
  EXCELLENT: "excellent",
  GOOD: "good",
  FAIR: "fair",
  POOR: "poor",
};
