/* =========================================================
   SignLang AI — Professional Video Call Frontend
   Chat · People · Predictions · Panels · Mobile-ready
   ========================================================= */

// =========== LOAD SIGNS DYNAMICALLY ===========
(async function loadSigns() {
  try {
    const res = await fetch("/api/classes");
    const data = await res.json();
    const signs = data.signs || {};

    // Join screen chips
    const joinDiv = document.getElementById("joinGestures");
    if (joinDiv) {
      joinDiv.innerHTML = Object.entries(signs)
        .map(
          ([name, info]) =>
            `<span class="join-chip">${info.emoji || ""} ${name}</span>`,
        )
        .join("");
    }

    // Signs panel grid
    const grid = document.getElementById("signsGrid");
    if (grid) {
      grid.innerHTML = Object.entries(signs)
        .map(
          ([name, info]) =>
            `<div class="sign-card"><span class="sign-emoji">${info.emoji || ""}</span><span class="sign-name">${name}</span></div>`,
        )
        .join("");
    }
  } catch (e) {
    console.log("Could not load signs from server:", e.message);
  }
})();

// =========== DOM REFS ===========
const $ = (s) => document.getElementById(s);
const joinScreen = $("joinScreen");
const callScreen = $("callScreen");
const usernameInput = $("usernameInput");
const joinBtn = $("joinBtn");

const video = $("video");
const canvas = $("canvas");
const overlay = $("overlay");
const videoWrapper = $("videoWrapper");
const videoNametag = $("videoNametag");
const videoArea = $("videoArea");

const labelBox = $("label");
const scoreBox = $("score");
const confidenceBar = $("confidenceBar");
const historyList = $("historyList");

const statusDot = $("statusDot");
const statusText = $("statusText");
const fpsBadge = $("fpsBadge");
const callTimer = $("callTimer");
const userCountNum = $("userCountNum");

const sidePanel = $("sidePanel");
const panelClose = $("panelClose");

const chatMessages = $("chatMessages");
const chatForm = $("chatForm");
const chatInput = $("chatInput");
const chatBadge = $("chatBadge");
const ctrlChatBadge = $("ctrlChatBadge");

const peopleList = $("peopleList");

const btnMirror = $("btnMirror");
const btnLandmarks = $("btnLandmarks");
const btnCam = $("btnCam");
const btnLeave = $("btnLeave");
const btnChat = $("btnChat");
const btnPeople = $("btnPeople");
const btnSigns = $("btnSigns");

// =========== CONFIG ===========
const SEND_INTERVAL_MS = 150;
const CONFIDENCE_THRESH = 0.55;
const HISTORY_MAX = 12;
const SMOOTHING_WINDOW = 3;

// =========== STATE ===========
let username = "Guest";
let lastSentTime = 0;
let handLandmarks = [];
let leftHandLandmarks = [];
let rightHandLandmarks = [];
let faceLandmarks = [];
let showLandmarks = true;
let isMirrored = true;
let cameraOn = true;
let predictionBuf = [];
let historyItems = [];
let frameCount = 0;
let lastFpsTime = performance.now();
let callStartTime = null;
let callTimerRef = null;
let unreadChat = 0;
let currentPanel = null; // 'chat' | 'people' | 'signs' | null
let mpInitialized = false;

// =========== AUTO-DETECT SERVER URL ===========
const SERVER_URL = (() => {
  const h = window.location.hostname;
  if (h === "localhost" || h === "127.0.0.1") {
    // Use the same port as the page if served by Flask, else default 5000
    return window.location.origin;
  }
  return window.location.origin;
})();

// =========== SOCKET.IO ===========
const sio = io(SERVER_URL, {
  transports: ["websocket", "polling"],
  reconnection: true,
  reconnectionAttempts: 15,
  reconnectionDelay: 2000,
  autoConnect: false, // Connect after join
});

// =========================================================
//  JOIN SCREEN
// =========================================================
joinBtn.addEventListener("click", handleJoin);
usernameInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") handleJoin();
});

function handleJoin() {
  const val = usernameInput.value.trim();
  username = val || "Guest";
  videoNametag.textContent = username;

  joinScreen.classList.add("hidden");
  callScreen.classList.remove("hidden");

  sio.connect();
  startCamera();
  startCallTimer();
}

// =========================================================
//  SOCKET EVENTS
// =========================================================
sio.on("connect", () => {
  statusDot.className = "status-indicator connected";
  statusText.textContent = "Connected";
  sio.emit("user_join", { username });
});

sio.on("disconnect", () => {
  statusDot.className = "status-indicator error";
  statusText.textContent = "Disconnected";
});

sio.on("connect_error", () => {
  statusDot.className = "status-indicator error";
  statusText.textContent = "Reconnecting…";
});

// Users list
sio.on("users_update", (data) => {
  const users = data.users || [];
  userCountNum.textContent = users.length;
  renderPeople(users);
});

// Chat message from server
sio.on("chat_message", (data) => {
  appendChat(data.username, data.message, data.time, data.sid === sio.id);
  if (currentPanel !== "chat") {
    unreadChat++;
    updateChatBadge();
  }
});

// Prediction result
sio.on("prediction", handlePrediction);

// Corrected sentence from Grok API
sio.on("corrected_sentence", (data) => {
  console.log("[Sentence]", data.raw, "→", data.corrected);
  const sentenceEl = $("sentenceBox");
  if (sentenceEl) {
    sentenceEl.textContent = data.corrected;
    sentenceEl.classList.add("show");
    setTimeout(() => sentenceEl.classList.remove("show"), 8000);
  }
  // Also add to history
  const t = new Date().toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  historyItems.unshift({ label: `💬 ${data.corrected}`, score: 1.0, time: t });
  if (historyItems.length > HISTORY_MAX) historyItems.pop();
  renderHistory();
});

// =========================================================
//  PREDICTION DISPLAY (smoothed)
// =========================================================
function handlePrediction(data) {
  if (data.error) {
    labelBox.textContent = "Error";
    labelBox.className = "pred-main no-hand";
    scoreBox.textContent = data.error;
    confidenceBar.style.width = "0%";
    return;
  }

  predictionBuf.push({ label: data.label, score: data.score });
  if (predictionBuf.length > SMOOTHING_WINDOW) predictionBuf.shift();

  // Most common label
  const counts = {};
  for (const p of predictionBuf) counts[p.label] = (counts[p.label] || 0) + 1;
  let bestLabel = data.label,
    bestCount = 0;
  for (const [lbl, cnt] of Object.entries(counts)) {
    if (cnt > bestCount) {
      bestLabel = lbl;
      bestCount = cnt;
    }
  }

  const scores = predictionBuf
    .filter((p) => p.label === bestLabel)
    .map((p) => p.score);
  const avg = scores.reduce((a, b) => a + b, 0) / scores.length;

  if (avg < CONFIDENCE_THRESH) {
    labelBox.textContent = "Detecting…";
    labelBox.className = "pred-main no-hand";
    scoreBox.textContent = `${(avg * 100).toFixed(0)}%`;
    confidenceBar.style.width = `${(avg * 100).toFixed(0)}%`;
    return;
  }

  labelBox.textContent = bestLabel;
  labelBox.className = "pred-main detected";
  scoreBox.textContent = `${(avg * 100).toFixed(1)}% confidence`;
  confidenceBar.style.width = `${(avg * 100).toFixed(0)}%`;

  // History (no consecutive dupes)
  if (!historyItems[0] || historyItems[0].label !== bestLabel) {
    const t = new Date().toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    historyItems.unshift({ label: bestLabel, score: avg, time: t });
    if (historyItems.length > HISTORY_MAX) historyItems.pop();
    renderHistory();
  }
}

function renderHistory() {
  if (!historyItems.length) {
    historyList.innerHTML =
      '<div class="history-empty">No signs detected yet</div>';
    return;
  }
  historyList.innerHTML = historyItems
    .map(
      (h) =>
        `<div class="history-item"><span class="h-label">${h.label}</span><span class="h-score">${(h.score * 100).toFixed(0)}%</span><span class="h-time">${h.time}</span></div>`,
    )
    .join("");
}

// =========================================================
//  CHAT
// =========================================================
chatForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const msg = chatInput.value.trim();
  if (!msg) return;
  sio.emit("chat_send", { message: msg });
  chatInput.value = "";
});

function appendChat(name, text, time, isSelf) {
  // Remove empty placeholder
  const empty = chatMessages.querySelector(".chat-empty");
  if (empty) empty.remove();

  const div = document.createElement("div");
  div.className = `chat-msg${isSelf ? " self" : ""}`;
  div.innerHTML = `
    <div class="chat-msg-name">${isSelf ? "You" : escapeHtml(name)}</div>
    <div class="chat-msg-text">${escapeHtml(text)}</div>
    <div class="chat-msg-time">${time || ""}</div>
  `;
  chatMessages.appendChild(div);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

function updateChatBadge() {
  const show = unreadChat > 0;
  chatBadge.textContent = unreadChat;
  chatBadge.classList.toggle("hidden", !show);
  ctrlChatBadge.textContent = unreadChat;
  ctrlChatBadge.classList.toggle("hidden", !show);
}

function escapeHtml(s) {
  const d = document.createElement("div");
  d.textContent = s;
  return d.innerHTML;
}

// =========================================================
//  PEOPLE
// =========================================================
function renderPeople(users) {
  if (!users.length) {
    peopleList.innerHTML = '<div class="history-empty">No one here yet</div>';
    return;
  }
  peopleList.innerHTML = users
    .map((u) => {
      const initials = u.username.slice(0, 2).toUpperCase();
      const isYou = u.sid === sio.id;
      return `<div class="person-row">
      <div class="person-avatar">${initials}</div>
      <div class="person-name">${escapeHtml(u.username)}${isYou ? " (You)" : ""}</div>
      ${isYou ? '<span class="person-badge">You</span>' : ""}
    </div>`;
    })
    .join("");
}

// =========================================================
//  SIDE PANEL TOGGLING
// =========================================================
function openPanel(name) {
  if (currentPanel === name) {
    closePanel();
    return;
  }
  currentPanel = name;
  sidePanel.classList.add("open");

  // Activate correct tab + content
  document
    .querySelectorAll(".panel-tab")
    .forEach((t) => t.classList.toggle("active", t.dataset.tab === name));
  document
    .querySelectorAll(".panel-content")
    .forEach((c) => c.classList.toggle("active", c.dataset.content === name));

  // Highlight toolbar button
  btnChat.classList.toggle("active", name === "chat");
  btnPeople.classList.toggle("active", name === "people");
  btnSigns.classList.toggle("active", name === "signs");

  if (name === "chat") {
    unreadChat = 0;
    updateChatBadge();
  }
}

function closePanel() {
  currentPanel = null;
  sidePanel.classList.remove("open");
  btnChat.classList.remove("active");
  btnPeople.classList.remove("active");
  btnSigns.classList.remove("active");
  document
    .querySelectorAll(".panel-tab")
    .forEach((t) => t.classList.remove("active"));
}

// Bottom bar buttons
btnChat.addEventListener("click", () => openPanel("chat"));
btnPeople.addEventListener("click", () => openPanel("people"));
btnSigns.addEventListener("click", () => openPanel("signs"));
panelClose.addEventListener("click", closePanel);

// Panel tab clicks
document.querySelectorAll(".panel-tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    const name = tab.dataset.tab;
    if (name) openPanel(name);
  });
});

// =========================================================
//  CAMERA CONTROLS
// =========================================================
function startCamera() {
  if (mpInitialized) return;
  mpInitialized = true;
  initMediaPipe();
}

// Camera toggle
btnCam.addEventListener("click", () => {
  cameraOn = !cameraOn;
  const tracks = video.srcObject && video.srcObject.getVideoTracks();
  if (tracks)
    tracks.forEach((t) => {
      t.enabled = cameraOn;
    });
  btnCam.classList.toggle("off", !cameraOn);
  btnCam.querySelector(".material-icons-round").textContent = cameraOn
    ? "videocam"
    : "videocam_off";
});

// Mirror toggle
videoWrapper.classList.add("mirrored");
btnMirror.classList.add("active");
btnMirror.addEventListener("click", () => {
  isMirrored = !isMirrored;
  videoWrapper.classList.toggle("mirrored", isMirrored);
  btnMirror.classList.toggle("active", isMirrored);
});

// Landmarks toggle
btnLandmarks.classList.add("active");
btnLandmarks.addEventListener("click", () => {
  showLandmarks = !showLandmarks;
  btnLandmarks.classList.toggle("active", showLandmarks);
  if (!showLandmarks) {
    const ctx = overlay.getContext("2d");
    ctx.clearRect(0, 0, overlay.width, overlay.height);
  }
});

// Leave room
btnLeave.addEventListener("click", () => {
  if (video.srcObject) {
    video.srcObject.getTracks().forEach((t) => t.stop());
    video.srcObject = null;
  }
  mpInitialized = false;
  holisticReady = false;
  latestResults = null;
  predictionBuf = [];
  sio.disconnect();
  clearInterval(callTimerRef);
  callScreen.classList.add("hidden");
  joinScreen.classList.remove("hidden");
});

// =========================================================
//  CALL TIMER
// =========================================================
function startCallTimer() {
  callStartTime = Date.now();
  callTimerRef = setInterval(() => {
    const diff = Math.floor((Date.now() - callStartTime) / 1000);
    const m = String(Math.floor(diff / 60)).padStart(2, "0");
    const s = String(diff % 60).padStart(2, "0");
    callTimer.textContent = `${m}:${s}`;
  }, 1000);
}

// =========================================================
//  MEDIAPIPE HOLISTIC
// =========================================================
let holisticReady = false;
let latestResults = null;

function initMediaPipe() {
  const holistic = new Holistic({
    locateFile: (file) =>
      `https://cdn.jsdelivr.net/npm/@mediapipe/holistic/${file}`,
  });
  holistic.setOptions({
    modelComplexity: 0,
    smoothLandmarks: true,
    refineFaceLandmarks: false,
    minDetectionConfidence: 0.5,
    minTrackingConfidence: 0.5,
  });
  holistic.onResults((results) => {
    latestResults = results;
    // Track both hands separately to match training data format
    leftHandLandmarks = results.leftHandLandmarks || [];
    rightHandLandmarks = results.rightHandLandmarks || [];
    // Keep combined for backward compat (detection check)
    handLandmarks = rightHandLandmarks.length
      ? rightHandLandmarks
      : leftHandLandmarks;
    faceLandmarks = results.faceLandmarks || [];
  });

  const camera = new Camera(video, {
    onFrame: async () => {
      if (!cameraOn) return;
      const vw = video.videoWidth || 640;
      const vh = video.videoHeight || 480;
      if (canvas.width !== vw) canvas.width = vw;
      if (canvas.height !== vh) canvas.height = vh;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(video, 0, 0, vw, vh);
      await holistic.send({ image: canvas });
      try {
        drawOverlay();
      } catch (e) {
        /* don't block predictions */
      }
      sendToServer();
      // FPS
      frameCount++;
      const now = performance.now();
      if (now - lastFpsTime >= 1000) {
        fpsBadge.textContent = `${frameCount} FPS`;
        frameCount = 0;
        lastFpsTime = now;
      }
    },
    width: 640,
    height: 480,
  });
  camera.start();
  holisticReady = true;
}

// =========================================================
//  DRAW LANDMARKS
// =========================================================
function drawOverlay() {
  const vw = video.videoWidth || 640;
  const vh = video.videoHeight || 480;
  if (overlay.width !== vw) overlay.width = vw;
  if (overlay.height !== vh) overlay.height = vh;
  const ctx = overlay.getContext("2d");
  ctx.clearRect(0, 0, overlay.width, overlay.height);
  if (!showLandmarks || !latestResults) return;

  if (latestResults.rightHandLandmarks) {
    drawConnectors(ctx, latestResults.rightHandLandmarks, HAND_CONNECTIONS, {
      color: "#7c6cf0",
      lineWidth: 2,
    });
    drawLandmarks(ctx, latestResults.rightHandLandmarks, {
      color: "#a29bfe",
      lineWidth: 1,
      radius: 3,
    });
  }
  if (latestResults.leftHandLandmarks) {
    drawConnectors(ctx, latestResults.leftHandLandmarks, HAND_CONNECTIONS, {
      color: "#00d68f",
      lineWidth: 2,
    });
    drawLandmarks(ctx, latestResults.leftHandLandmarks, {
      color: "#55efc4",
      lineWidth: 1,
      radius: 3,
    });
  }
  if (latestResults.faceLandmarks) {
    drawConnectors(ctx, latestResults.faceLandmarks, FACEMESH_TESSELATION, {
      color: "rgba(124,108,240,0.12)",
      lineWidth: 1,
    });
  }
}

// =========================================================
//  SEND LANDMARKS TO BACKEND
// =========================================================
function flattenLandmarks(arr) {
  const out = [];
  for (const pt of arr) out.push(pt.x, pt.y, pt.z);
  return out;
}

function sendToServer() {
  const now = performance.now();
  if (now - lastSentTime < SEND_INTERVAL_MS) return;
  if (!sio.connected) {
    labelBox.textContent = "Connecting…";
    labelBox.className = "pred-main no-hand";
    scoreBox.textContent = "Waiting for server";
    confidenceBar.style.width = "0%";
    return;
  }
  if (!leftHandLandmarks.length && !rightHandLandmarks.length) {
    labelBox.textContent = "Show your hand\u2026";
    labelBox.className = "pred-main no-hand";
    scoreBox.textContent = "";
    confidenceBar.style.width = "0%";
    return;
  }
  // Build vector matching training format: [allHands(42pts=126), face(468pts=1404)] = 1530
  // Training uses mp.solutions.hands which iterates detected hands in order
  // Holistic gives left/right separately — combine both
  let hv = [];
  if (leftHandLandmarks.length) hv.push(...flattenLandmarks(leftHandLandmarks));
  if (rightHandLandmarks.length)
    hv.push(...flattenLandmarks(rightHandLandmarks));
  hv = hv.slice(0, 126);
  while (hv.length < 126) hv.push(0);

  let fv = faceLandmarks.length ? flattenLandmarks(faceLandmarks) : [];
  fv = fv.slice(0, 1404);
  while (fv.length < 1404) fv.push(0);

  const full = hv.concat(fv).slice(0, 1530);
  sio.emit("landmark", { vector: full, normalized: false });
  lastSentTime = now;
}
