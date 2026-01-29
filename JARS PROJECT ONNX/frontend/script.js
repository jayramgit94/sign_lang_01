/*
PROJECT: Sign Language Recognition - FRONTEND (Client-side)
PURPOSE: Capture video from webcam, extract landmarks using MediaPipe, 
         send to backend for prediction, display results in real-time
WORKFLOW: 
  1. Start webcam and get video stream
  2. For each frame: Extract hand+face landmarks using MediaPipe Holistic
  3. Flatten landmarks to 1D vector (1530 values)
  4. Send vector to backend via SocketIO
  5. Receive prediction and display on screen
*/

// ============ DOM ELEMENTS ============
// Get HTML elements to display predictions and video
const video = document.getElementById("video"); // Video element for webcam
const labelBox = document.getElementById("label"); // Shows predicted gesture
const scoreBox = document.getElementById("score"); // Shows confidence score

// ============ PERFORMANCE TUNING ============
// Limit how often we send data to backend (ms)
const SEND_INTERVAL_MS = 100; // 10 FPS
let lastSentTime = 0;

// ============ SOCKETIO CONNECTION ============
// Connect to backend server via WebSocket (real-time communication)
const sio = io("http://localhost:5000");

// Listen for "prediction" event from backend
sio.on("prediction", (data) => {
  // Receive prediction results from server
  if (data.error) {
    // If error occurred, display error message
    labelBox.innerText = "Error: " + data.error;
    scoreBox.innerText = "";
    return;
  }
  // Display gesture name and confidence score
  labelBox.innerText = "Prediction: " + data.label;
  scoreBox.innerText = "Score: " + data.score.toFixed(3); // Show score with 3 decimals
});

// ============ WEBCAM SETUP ============
// Request access to user's webcam
navigator.mediaDevices.getUserMedia({ video: true }).then((stream) => {
  // Connect video stream to <video> element
  video.srcObject = stream;
});

// ============ LANDMARK STORAGE ============
// Store detected landmarks from current frame
let handLandmarks = []; // 21 hand joints * 3 (x,y,z) = 63 values per hand
let faceLandmarks = []; // 468 face points * 3 (x,y,z) = 1404 values

// ============ MEDIAPIPE HOLISTIC MODEL ============
// Holistic: Detects pose (body), hand, and face landmarks in one model
const holistic = new Holistic({
  // Load MediaPipe model from CDN
  locateFile: (file) =>
    `https://cdn.jsdelivr.net/npm/@mediapipe/holistic/${file}`,
});

// Configure model options
holistic.setOptions({
  modelComplexity: 0, // 0=light (faster), 1=full accuracy
  smoothLandmarks: true, // Smooth results across frames
  refineFaceLandmarks: false, // Disable extra face refinement for speed
  minDetectionConfidence: 0.5, // Minimum 50% confidence to detect
  minTrackingConfidence: 0.5, // Minimum 50% confidence to track
});

// Callback: Called when MediaPipe detects landmarks
holistic.onResults((results) => {
  // Choose only ONE hand (prioritize right hand over left)
  if (results.rightHandLandmarks) {
    handLandmarks = results.rightHandLandmarks;
  } else if (results.leftHandLandmarks) {
    handLandmarks = results.leftHandLandmarks;
  } else {
    handLandmarks = []; // No hand detected
  }

  // Get face landmarks (if detected)
  faceLandmarks = results.faceLandmarks || [];
});

// ============ CAMERA LOOP ============
// Setup camera with frame callback
const camera = new Camera(video, {
  // Called for each video frame
  onFrame: async () => {
    // Get canvas element
    const canvas = document.getElementById("canvas");
    const ctx = canvas.getContext("2d");

    // Set canvas size to match video
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    // Draw current video frame on canvas
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    // Run MediaPipe Holistic on this frame (detects landmarks)
    await holistic.send({ image: canvas });

    // Send detected landmarks to backend server
    sendToServer();
  },
  width: 480,
  height: 360,
});
// Start the camera loop (continuous frame processing)
camera.start();

// ============ FLATTEN LANDMARKS TO VECTOR ============
/**
 * Convert array of landmark objects to flat 1D array
 * INPUT: [{x: 0.5, y: 0.3, z: -0.1}, {x: 0.6, y: 0.4, z: 0.0}, ...]
 * OUTPUT: [0.5, 0.3, -0.1, 0.6, 0.4, 0.0, ...]
 * Each point becomes 3 consecutive values (x, y, z)
 */
function flattenLandmarks(arr) {
  let out = [];
  for (let pt of arr) {
    // Push x, y, z coordinates for each landmark point
    out.push(pt.x, pt.y, pt.z);
  }
  return out;
}

// ============ SEND LANDMARKS TO BACKEND ============
/**
 * PURPOSE: Send landmark vector to backend server for prediction
 * PROCESS:
 *   1. Check if hand is detected (if not, show "No hand detected")
 *   2. Flatten hand landmarks: 21 points * 3 = 63 values
 *   3. Flatten face landmarks: 468 points * 3 = 1404 values
 *   4. Combine: 63 + 1404 = 1467, pad to exactly 1530 values
 *   5. Send to backend via SocketIO
 */
function sendToServer() {
  const now = performance.now();
  if (now - lastSentTime < SEND_INTERVAL_MS) {
    return;
  }
  // ============ VALIDATION: CHECK IF HAND DETECTED ============
  // Do NOT predict if no hand is visible - model needs hand input
  if (handLandmarks.length === 0) {
    labelBox.innerText = "Prediction: No hand detected";
    scoreBox.innerText = "";
    return; // Exit early, don't send empty vector
  }

  // ============ FLATTEN LANDMARKS ============
  // Convert hand landmark objects to flat array: [x1, y1, z1, x2, y2, z2, ...]
  let handVec = flattenLandmarks(handLandmarks);
  // Convert face landmarks to flat array (or empty if not detected)
  let faceVec = faceLandmarks.length > 0 ? flattenLandmarks(faceLandmarks) : [];

  // ============ TRUNCATE TO EXPECTED SIZE ============
  // Cut extra values if landmarks have more than expected
  handVec = handVec.slice(0, 126); // Hand: max 42 points * 3 = 126 values
  faceVec = faceVec.slice(0, 1404); // Face: max 468 points * 3 = 1404 values

  // ============ PAD WITH ZEROS ============
  // Fill missing values with zeros to reach expected dimensions
  while (handVec.length < 126) handVec.push(0); // Pad hand vector to 126
  while (faceVec.length < 1404) faceVec.push(0); // Pad face vector to 1404

  // ============ COMBINE INTO SINGLE VECTOR ============
  // Concatenate: [hand (126) + face (1404) = 1530 total]
  const full = handVec.concat(faceVec).slice(0, 1530);

  // ============ SEND TO BACKEND ============
  // Emit SocketIO event with landmark vector
  sio.emit("landmark", {
    vector: full, // 1530-dimensional vector
    normalized: false, // Backend will normalize it
  });
  lastSentTime = now;
}
