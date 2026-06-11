"""
PROJECT: Sign Language Recognition using ONNX & Flask-SocketIO
PURPOSE: Real-time gesture prediction from video landmarks
WORKFLOW: Frontend captures video -> Mediapipe extracts landmarks ->
          Send to backend -> ONNX model predicts gesture -> Return result to frontend
"""

# ============ IMPORTS ============
import os

_ASYNC_MODE = os.getenv("SOCKETIO_ASYNC_MODE", "eventlet").strip().lower()

if _ASYNC_MODE == "gevent":
    from gevent import monkey

    monkey.patch_all()
else:
    import eventlet

    eventlet.monkey_patch()

try:
    from dotenv import load_dotenv

    load_dotenv(override=True)
except ImportError:
    pass  # On Render, env vars are set via dashboard

import json
from datetime import datetime
import numpy as np
from flask import Flask, request, send_from_directory
from flask_socketio import SocketIO, emit
import onnxruntime as ort
from sentence_builder import SentenceBuilder

# ============ CONFIG ============
# Resolve paths relative to this file so it works from any working directory
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
# Path to pre-trained ONNX model (compiled neural network for inference)
MODEL_PATH = os.path.join(BASE_DIR, "model", "model.onnx")
# Path to class labels mapping (gesture names like "Hello", "Yes", "No")
CLASSES_PATH = os.path.join(BASE_DIR, "classes.json")

# ============ NORMALIZATION FUNCTION ============
"""
PURPOSE: Normalize landmark vectors for consistent model input
INPUT: vec - raw 1D array of 1530 values (42 hand landmarks * 3 + 468 face landmarks * 3)
PROCESS:
  1. Reshape to (510, 3) where each row is [x, y, z] coordinate
  2. Split into hand (first 42 pts) and face (remaining 468 pts)
  3. Find reference point (mean of face or hand)
  4. Center all points relative to reference
  5. Normalize by standard deviation to scale consistently
OUTPUT: Flattened normalized array (1530 values) ready for model
"""


def normalize_vector(vec):
    # Convert input to numpy float32 array
    arr = np.asarray(vec, dtype=np.float32)
    if arr.size == 0:
        return arr
    try:
        # Reshape from 1D (1530,) to 2D (510, 3) - each landmark has x,y,z
        pts = arr.reshape(-1, 3)
    except Exception as e:
        raise ValueError(f"Expected vector length 1530, got {arr.size}") from e

    # Separate hand and face landmarks
    hand_pts = pts[:42]  # First 42 landmarks are hand points
    face_pts = pts[42:]  # Remaining 468 landmarks are face points

    # Choose reference point: center of face if visible, else center of hand
    if np.any(face_pts):
        ref = np.mean(face_pts, axis=0)  # Average all face points
    else:
        ref = np.mean(hand_pts, axis=0)  # Average all hand points

    # Translate: Move all points so reference is at origin (subtract reference from x,y)
    pts[:, :2] = pts[:, :2] - ref[:2]

    # Scale: Normalize by standard deviation for consistent magnitude
    std = np.std(pts[:, :2])
    if std > 1e-6:  # Avoid division by zero
        pts[:, :2] = pts[:, :2] / std

    # Return as flat array of shape (1530,)
    return pts.flatten().astype(np.float32)


# ============ LOAD CONFIG ============
CONFIG_PATH = os.path.join(BASE_DIR, "config.json")
with open(CONFIG_PATH, encoding="utf-8") as f:
    CONFIG = json.load(f)

# ============ LOAD CLASSES MAPPING ============
with open(CLASSES_PATH, encoding="utf-8") as f:
    classes_map = json.load(f)
# Invert mapping: {0: "Hello", 1: "Yes", ...} for quick lookup by prediction index
inv_classes = {int(v): k for k, v in classes_map.items()}

# ============ LOAD ONNX MODEL ============
print("Loading ONNX model...")
session = None
onnx_input_name = None
onnx_output_name = None
expected_dim = None

if not os.path.exists(MODEL_PATH):
    print(f"WARNING: Model file not found at {MODEL_PATH}")
    print("Server will start but predictions will be unavailable.")
else:
    session_options = ort.SessionOptions()
    session_options.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_ALL
    cpu_count = os.cpu_count() or 1
    session_options.intra_op_num_threads = max(1, cpu_count - 1)
    session_options.inter_op_num_threads = 1
    session = ort.InferenceSession(
        MODEL_PATH,
        sess_options=session_options,
        providers=["CPUExecutionProvider"],
    )
    onnx_input = session.get_inputs()[0]
    onnx_output = session.get_outputs()[0]
    onnx_input_name = onnx_input.name
    onnx_output_name = onnx_output.name
    expected_dim = onnx_input.shape[-1]
    print("Loaded model:", MODEL_PATH)
    print("Input:", onnx_input_name, "Output:", onnx_output_name)

# ============ FLASK + SOCKETIO SETUP ============
app = Flask(__name__, static_folder="frontend")

# Allowed CORS origins — restrict to known frontends
# In production (Render), set CORS_ORIGINS env var to your frontend domains
# e.g. "https://chat.jayram.me,https://sign-lang-01.vercel.app"
_serve_port = int(os.getenv("PORT", "5000"))
_default_origins = (
    f"http://localhost:{_serve_port},http://127.0.0.1:{_serve_port},"
    "http://localhost:3000,http://localhost:8000,"
    "http://127.0.0.1:3000,http://127.0.0.1:8000,"
    "https://sign-lang-01.vercel.app,"
    "https://signlang-ai.onrender.com,"
    "https://chat.jayram.me"
)
ALLOWED_ORIGINS = [
    o.strip()
    for o in os.getenv("CORS_ORIGINS", _default_origins).split(",")
    if o.strip()
]

socketio = SocketIO(
    app,
    cors_allowed_origins=ALLOWED_ORIGINS,
    async_mode=_ASYNC_MODE,
    max_http_buffer_size=1_000_000,  # 1 MB max message size
    ping_timeout=30,
    ping_interval=15,
    allow_upgrades=True,
)

# ============ CONNECTION RATE LIMITING ============
# Track connection timestamps per IP for simple rate limiting
from collections import defaultdict
import time as _time

_conn_timestamps = defaultdict(list)
MAX_CONNECTIONS_PER_MINUTE = 20
MAX_TOTAL_CONNECTIONS = 100
_landmark_timestamps = defaultdict(list)
MAX_LANDMARKS_PER_10S = 120
LANDMARK_WINDOW_SECONDS = 10
LANDMARK_MIN_INTERVAL_MS = 300
METRICS_LOG_INTERVAL_SECONDS = 60
_metrics = {
    "landmark_allowed": 0,
    "landmark_blocked": 0,
    "landmark_errors": 0,
}
_last_metrics_log = _time.time()


def _check_rate_limit(ip):
    """Return True if connection should be allowed."""
    now = _time.time()
    # Clean old entries
    _conn_timestamps[ip] = [t for t in _conn_timestamps[ip] if now - t < 60]
    if len(_conn_timestamps[ip]) >= MAX_CONNECTIONS_PER_MINUTE:
        return False
    _conn_timestamps[ip].append(now)
    return True


def _check_landmark_rate_limit(sid):
    now = _time.time()
    _landmark_timestamps[sid] = [
        t for t in _landmark_timestamps[sid] if now - t < LANDMARK_WINDOW_SECONDS
    ]
    if len(_landmark_timestamps[sid]) >= MAX_LANDMARKS_PER_10S:
        return False
    _landmark_timestamps[sid].append(now)
    return True


def _get_landmark_retry_after_ms(sid):
    timestamps = _landmark_timestamps.get(sid, [])
    if not timestamps:
        return LANDMARK_MIN_INTERVAL_MS
    oldest = timestamps[0]
    retry_after = max(
        0, int((oldest + LANDMARK_WINDOW_SECONDS - _time.time()) * 1000)
    )
    return max(LANDMARK_MIN_INTERVAL_MS, retry_after)


def _log_metrics_if_due():
    global _last_metrics_log
    now = _time.time()
    if now - _last_metrics_log < METRICS_LOG_INTERVAL_SECONDS:
        return
    _last_metrics_log = now
    print(
        "[Metrics] landmarks allowed={allowed} blocked={blocked} errors={errors}".format(
            allowed=_metrics["landmark_allowed"],
            blocked=_metrics["landmark_blocked"],
            errors=_metrics["landmark_errors"],
        )
    )
    _metrics["landmark_allowed"] = 0
    _metrics["landmark_blocked"] = 0
    _metrics["landmark_errors"] = 0


# ============ CONNECTED USERS TRACKING ============
# { sid: { "username": str, "sid": str } }
connected_users = {}

# Per-user sentence builders: { sid: SentenceBuilder }
sentence_builders = {}


def _make_sentence_callback(sid):
    """Create a callback that emits corrected sentence to the specific user."""

    def on_sentence(raw_words, corrected):
        print(f"[Sentence] {sid}: '{raw_words}' → '{corrected}'")
        socketio.emit(
            "corrected_sentence",
            {
                "raw": raw_words,
                "corrected": corrected,
            },
            to=sid,
        )

    return on_sentence


def broadcast_users():
    """Send updated user list to all clients"""
    users = list(connected_users.values())
    socketio.emit("users_update", {"users": users})


# ============ ROUTES ============
@app.route("/")
def index():
    """Serve the main HTML page"""
    return send_from_directory("frontend", "index.html")


@app.route("/api/classes")
def api_classes():
    """Return signs and class mapping for dynamic frontend."""
    signs = CONFIG.get("signs", {})
    return {"signs": signs, "classes": classes_map}


@app.route("/api/metrics")
def api_metrics():
    """Return basic server metrics for monitoring."""
    return {
        "connectedUsers": len(connected_users),
        "landmarksAllowed": _metrics["landmark_allowed"],
        "landmarksBlocked": _metrics["landmark_blocked"],
        "landmarkErrors": _metrics["landmark_errors"],
        "landmarkRateLimit": {
            "maxPerWindow": MAX_LANDMARKS_PER_10S,
            "windowSeconds": LANDMARK_WINDOW_SECONDS,
            "minIntervalMs": LANDMARK_MIN_INTERVAL_MS,
            "activeSids": len(_landmark_timestamps),
        },
    }


@app.route("/<path:path>")
def static_files(path):
    """Serve static files (CSS, JS, MediaPipe models)"""
    return send_from_directory("frontend", path)


# ============ SOFTMAX FUNCTION ============
"""
Convert model logits (raw output scores) to probabilities (0-1 range, sum to 1)
Used to get confidence scores for each gesture prediction
"""


def softmax(x):
    # Subtract max for numerical stability (prevents overflow)
    ex = np.exp(x - np.max(x))
    # Divide by sum to normalize to probability distribution
    return ex / ex.sum(axis=-1, keepdims=True)


# ============ SOCKETIO: USER MANAGEMENT ============
@socketio.on("user_join")
def handle_user_join(data):
    """User joined the room"""
    # Rate limit check
    ip = request.remote_addr or "unknown"
    if not _check_rate_limit(ip):
        emit("error", {"message": "Too many connections. Try again later."})
        return
    if len(connected_users) >= MAX_TOTAL_CONNECTIONS:
        emit("error", {"message": "Server at capacity. Try again later."})
        return
    username = data.get("username", "Guest")[:20]
    sid = request.sid
    connected_users[sid] = {"username": username, "sid": sid}
    sentence_builders[sid] = SentenceBuilder(on_sentence=_make_sentence_callback(sid))
    print(f"[+] {username} joined (sid={sid}), total={len(connected_users)}")
    broadcast_users()


@socketio.on("disconnect")
def handle_disconnect():
    """User disconnected"""
    sid = request.sid
    user = connected_users.pop(sid, None)
    builder = sentence_builders.pop(sid, None)
    _landmark_timestamps.pop(sid, None)
    if builder:
        builder.flush()  # Process any remaining words before cleanup
    name = user["username"] if user else "Unknown"
    print(f"[-] {name} left (sid={sid}), total={len(connected_users)}")
    broadcast_users()


# ============ SOCKETIO: CHAT ============
@socketio.on("chat_send")
def handle_chat(data):
    """Broadcast chat message to all users"""
    sid = request.sid
    user = connected_users.get(sid, {"username": "Guest"})
    message = data.get("message", "")[:500]  # Limit length
    if not message.strip():
        return
    time_str = datetime.now().strftime("%I:%M %p")
    socketio.emit(
        "chat_message",
        {
            "username": user["username"],
            "message": message,
            "time": time_str,
            "sid": sid,
        },
    )


# ============ SOCKETIO: LANDMARK PREDICTION ============
@socketio.on("landmark")
def handle_landmark(data):
    """
    EVENT: Receives landmark data from frontend
    DATA: {"vector": [1530 float values], "normalized": bool}
    PROCESS:
      1. Extract vector from client message
      2. Normalize if needed
      3. Reshape to (1, 1530) for model input
      4. Run ONNX model inference
      5. Apply softmax to get probabilities
      6. Find class with highest probability
      7. Map class index to gesture name
      8. Send prediction back to client
    """
    try:
        sid = request.sid
        if not _check_landmark_rate_limit(sid):
            _metrics["landmark_blocked"] += 1
            emit("prediction", {"error": "Rate limit exceeded. Slow down."})
            emit("slowdown", {"minIntervalMs": _get_landmark_retry_after_ms(sid)})
            return

        # Check if model is loaded
        if session is None:
            _metrics["landmark_errors"] += 1
            emit("prediction", {"error": "Model not loaded on server"})
            return

        # Get landmark vector from client
        vec = data.get("vector")
        if vec is None or not isinstance(vec, (list, tuple)):
            _metrics["landmark_errors"] += 1
            emit("prediction", {"error": "No vector provided"})
            return
        if expected_dim and len(vec) > expected_dim * 2:
            _metrics["landmark_errors"] += 1
            emit("prediction", {"error": "Vector size too large"})
            return

        # Normalize vector if not already normalized
        if data.get("normalized", False):
            # Already normalized, just convert to numpy
            x = np.asarray(vec, dtype=np.float32).reshape(1, -1)
        else:
            # Apply normalization function
            x = normalize_vector(np.asarray(vec, dtype=np.float32)).reshape(1, -1)

        # Validate input dimension
        if x.shape[1] != expected_dim:
            _metrics["landmark_errors"] += 1
            emit(
                "prediction",
                {
                    "error": f"Invalid vector length: expected {expected_dim}, got {x.shape[1]}"
                },
            )
            return

        # Run ONNX model inference
        # Input: x shape (1, 1530)
        # Output: logits shape (1, num_classes)
        outputs = session.run(
            [onnx_output_name], {onnx_input_name: x.astype(np.float32)}
        )
        logits = np.asarray(outputs[0], dtype=np.float32)[
            0
        ]  # Extract first (only) result

        # Convert logits to probabilities
        probs = softmax(logits)

        # Get prediction: find gesture with highest probability
        idx = int(np.argmax(probs))
        label = inv_classes.get(idx, "unknown")
        score = float(probs[idx])

        # Send prediction back to client
        emit("prediction", {"label": label, "score": score})
        _metrics["landmark_allowed"] += 1
        _log_metrics_if_due()

        # Feed into sentence builder for grammar correction
        builder = sentence_builders.get(sid)
        if builder:
            builder.add_word(label, score)
    except Exception as e:
        _metrics["landmark_errors"] += 1
        _log_metrics_if_due()
        # Send error message if something fails
        emit("prediction", {"error": str(e)})


# ============ MAIN: START SERVER ============
if __name__ == "__main__":
    host = os.getenv("HOST", "0.0.0.0")
    port = int(os.getenv("PORT", "5000"))
    print(f"Starting server on http://{host}:{port}")
    print(
        f"Model classes: {len(inv_classes)}, Output dim: {session.get_outputs()[0].shape if session else 'N/A'}"
    )
    print(f"CORS origins: {ALLOWED_ORIGINS}")
    # socketio.run: Start Flask+SocketIO server
    # host="0.0.0.0": Listen on all network interfaces
    socketio.run(app, host=host, port=port)
