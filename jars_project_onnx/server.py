"""
PROJECT: Sign Language Recognition using ONNX & Flask-SocketIO
PURPOSE: Real-time gesture prediction from video landmarks
WORKFLOW: Frontend captures video -> Mediapipe extracts landmarks -> 
          Send to backend -> ONNX model predicts gesture -> Return result to frontend
"""

# ============ IMPORTS ============
import eventlet
eventlet.monkey_patch()  # Monkey patch for eventlet async support

import json
import os
import numpy as np
from flask import Flask, request, send_from_directory
from flask_socketio import SocketIO, emit
import onnxruntime as ort

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
    hand_pts = pts[:42]        # First 42 landmarks are hand points
    face_pts = pts[42:]        # Remaining 468 landmarks are face points

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


# ============ LOAD CLASSES MAPPING ============
# Load JSON file that maps class indices to gesture names
# Example: {"0": "Hello", "1": "Yes", "2": "No", "3": "Thank You"}
with open(CLASSES_PATH, "r") as f:
    classes_map = json.load(f)
# Invert mapping: {0: "Hello", 1: "Yes", ...} for quick lookup by prediction index
inv_classes = {int(v): k for k, v in classes_map.items()}

# ============ LOAD ONNX MODEL ============
# ONNX: Open Neural Network Exchange format (portable, optimized inference)
# Load pre-trained model for real-time inference on landmarks
print("Loading ONNX model...")
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
# Cache input/output metadata
onnx_input = session.get_inputs()[0]
onnx_output = session.get_outputs()[0]
onnx_input_name = onnx_input.name
onnx_output_name = onnx_output.name
expected_dim = onnx_input.shape[-1]
print("Loaded model:", MODEL_PATH)
print("Input:", onnx_input_name, "Output:", onnx_output_name)

# ============ FLASK + SOCKETIO SETUP ============
# Flask: Web framework to serve frontend and handle HTTP requests
# SocketIO: Real-time bidirectional communication between client & server
app = Flask(__name__, static_folder="frontend")  # Serve files from frontend/ folder
socketio = SocketIO(app, cors_allowed_origins="*", async_mode="eventlet")

# ============ ROUTES ============
@app.route("/")
def index():
    """Serve the main HTML page"""
    return send_from_directory("frontend", "index.html")

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

# ============ SOCKETIO EVENT HANDLER ============
# Receives landmark vectors from frontend, runs inference, returns prediction
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
        # Get landmark vector from client
        vec = data.get("vector")
        if vec is None:
            emit("prediction", {"error": "No vector provided"})
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
            emit("prediction", {"error": f"Invalid vector length: expected {expected_dim}, got {x.shape[1]}"})
            return

        # Run ONNX model inference
        # Input: x shape (1, 1530)
        # Output: logits shape (1, num_classes)
        outputs = session.run([onnx_output_name], {onnx_input_name: x.astype(np.float32)})
        logits = np.asarray(outputs[0], dtype=np.float32)[0]  # Extract first (only) result
        
        # Convert logits to probabilities
        probs = softmax(logits)
        
        # Get prediction: find gesture with highest probability
        idx = int(np.argmax(probs))
        label = inv_classes.get(idx, "unknown")
        score = float(probs[idx])

        # Send prediction back to client
        emit("prediction", {"label": label, "score": score})
    except Exception as e:
        # Send error message if something fails
        emit("prediction", {"error": str(e)})


# ============ MAIN: START SERVER ============
if __name__ == "__main__":
    host = os.getenv("HOST", "0.0.0.0")
    port = int(os.getenv("PORT", "5000"))
    print(f"Starting server on http://{host}:{port}")
    # socketio.run: Start Flask+SocketIO server
    # host="0.0.0.0": Listen on all network interfaces
    # port=5000: Use port 5000
    socketio.run(app, host=host, port=port)
