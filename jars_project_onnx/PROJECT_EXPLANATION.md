# Sign Language Recognition Project - Complete Explanation

## 📋 Project Overview
This is a **Real-time Sign Language Recognition System** using:
- **Frontend**: MediaPipe + WebSocket (live gesture detection)
- **Backend**: Flask + ONNX (inference server)
- **ML Model**: PyTorch MLP trained on landmark data

---

## 🔄 Complete Workflow

### Phase 1: Data Collection
**File**: `save_landmarks.py`
```
1. Open webcam
2. Extract hand (21 points) + face (468 points) landmarks using MediaPipe
3. Create fixed-size vector (1530 values)
4. Save to JSONL with gesture label
5. Result: data_Hello.jsonl, data_Yes.jsonl, etc.
```

### Phase 2: Data Preprocessing
**File**: `preprocess/create_dataset.py`
```
1. Load all JSONL files from data_raw/
2. Normalize each vector using normalize_vector()
3. Combine into X.npy (features) and y.npy (labels)
4. Create classes.json mapping (gesture → ID)
```

### Phase 3: Model Training
**File**: `model/train.py`
```
1. Load X.npy (1530-D features) and y.npy (labels)
2. Split 80/20 train/test
3. Train MLP: 1530 → 512 → 256 → num_classes
4. Save as model.pth (PyTorch) and model.onnx (inference)
```

### Phase 4: Live Prediction
**Files**: `server.py` (backend) + `frontend/script.js` (frontend)
```
1. Frontend: Capture video → MediaPipe extracts landmarks
2. Frontend: Send 1530-D vector to backend via WebSocket
3. Backend: Normalize vector → ONNX model inference
4. Backend: Apply softmax → Return prediction + confidence
5. Frontend: Display gesture name and score
```

---

## 🏗️ Project Structure

```
├── save_landmarks.py           # Data collection (webcam recording)
├── server.py                   # Backend Flask/SocketIO server
├── classes.json                # Gesture label mapping
├── requirements.txt            # Python dependencies
│
├── preprocess/
│   ├── create_dataset.py      # Load raw data → Create X.npy, y.npy
│   ├── normalize.py           # Normalization function (center + scale)
│   └── __pycache__/
│
├── model/
│   ├── train.py              # Train MLP model
│   ├── model.pth             # PyTorch model weights
│   └── model.onnx            # ONNX model (for inference)
│
├── frontend/
│   ├── index.html            # Main HTML page
│   ├── script.js             # Frontend JavaScript (MediaPipe + WebSocket)
│   ├── style.css             # CSS styling
│   └── mediapipe/            # MediaPipe resources
│
├── data_raw/                 # Raw JSONL files (recordings)
│   ├── data_Hello.jsonl
│   ├── data_Yes.jsonl
│   └── ...
│
└── data_processed/           # Preprocessed numpy arrays
    ├── X.npy                 # Features (N, 1530)
    └── y.npy                 # Labels (N,)
```

---

## 📊 Vector Dimensions

**Total Input Size**: 1530 values

```
Hand Landmarks (42 points):
  21 points/hand × 2 hands × 3 coords = 126 values
  
Face Landmarks (468 points):
  468 points × 3 coords = 1404 values

Total: 126 + 1404 = 1530 values
```

---

## 🔧 Key Functions

### normalize_vector() - `preprocess/normalize.py`
```python
1. Reshape (1530,) → (510, 3)  [each landmark is x,y,z]
2. Find reference point (face center or hand center)
3. Center: Subtract reference from x,y coordinates
4. Scale: Divide by standard deviation
5. Return flattened (1530,) array
```

**Why?** Makes predictions consistent regardless of hand position/distance

### handle_landmark() - `server.py`
```python
1. Receive 1530-D vector from frontend
2. Normalize if needed
3. Run ONNX inference
4. Apply softmax to logits
5. Get highest probability class
6. Return gesture name + confidence score
```

### sendToServer() - `frontend/script.js`
```python
1. Check if hand detected (return if not)
2. Flatten hand landmarks (21 pts × 3 = 63 values)
3. Flatten face landmarks (468 pts × 3 = 1404 values)
4. Pad to exact 126 + 1404 = 1530 values
5. Send via SocketIO emit("landmark", {vector, normalized})
```

---

## 🚀 How to Run

### 1. Setup
```bash
# Create virtual environment
python -m venv env
.\env\Scripts\Activate.ps1

# Install dependencies
pip install -r requirements.txt
```

### 2. Collect Data (Optional)
```bash
python save_landmarks.py
# Then drag into data_raw/ folder
```

### 3. Train Model (Optional)
```bash
cd preprocess
python create_dataset.py
cd ../model
python train.py
```

### 4. Run Live Server
```bash
python server.py
# Open browser: http://localhost:5000
```

---

## 📝 File Descriptions

| File | Purpose |
|------|---------|
| `server.py` | Backend: Flask server, ONNX inference, SocketIO events |
| `frontend/script.js` | Frontend: MediaPipe detection, WebSocket communication |
| `save_landmarks.py` | Data collection: Record gestures from webcam |
| `preprocess/create_dataset.py` | Load raw data, normalize, save as NumPy arrays |
| `preprocess/normalize.py` | Normalize function (center + scale landmarks) |
| `model/train.py` | Train MLP model and export to ONNX |

---

## 🔌 Communication Flow

```
Frontend (Browser)
    ↓
    | WebSocket (SocketIO)
    ↓
Backend Server (Flask)
    ↓
    | Normalize vector
    ↓
ONNX Model
    ↓
    | Softmax + argmax
    ↓
Prediction: {"label": "Hello", "score": 0.95}
    ↓
    | WebSocket (SocketIO)
    ↓
Frontend (Display on screen)
```

---

## 🎯 Model Architecture

```
Input: 1530 values (hand + face landmarks)
    ↓
Linear(1530 → 512) + ReLU
    ↓
Linear(512 → 256) + ReLU
    ↓
Linear(256 → num_classes)
    ↓
Output: Logits (raw scores)
    ↓
Softmax → Probabilities
    ↓
Argmax → Predicted gesture
```

---

## ✅ Dependencies

- **mediapipe**: Hand/face landmark detection
- **opencv-python**: Video processing
- **torch**, **torchvision**: Deep learning
- **onnx**, **onnxruntime**: Model export & inference
- **flask**, **flask-socketio**: Web server & real-time communication
- **numpy**: Data processing
- **eventlet**: Async support

---

## 🐛 Troubleshooting

| Issue | Solution |
|-------|----------|
| "No hand detected" | Move hand into frame |
| Browser won't load | Check `http://localhost:5000` (not `0.0.0.0:5000`) |
| Low accuracy | Record more training data |
| Slow inference | Reduce model complexity or use GPU |

---

**Last Updated**: January 2026
