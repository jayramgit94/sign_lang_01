"""
DATA COLLECTION SCRIPT: Record gesture landmarks from webcam
PURPOSE: Capture hand and face landmarks for training data
WORKFLOW:
  1. Open webcam
  2. For each frame: Extract hand (21 pts) and face (468 pts) landmarks
  3. Convert to fixed-size vector (1530 values)
  4. Save to JSONL file with gesture label
  5. Close on 'q' key press
OUTPUT: data_<label>.jsonl file with recorded landmark sequences
"""

import cv2
import mediapipe as mp
import json
import time
import numpy as np

# ============ INITIALIZE MEDIAPIPE ============
# Load pre-trained hand detection model
mp_hands = mp.solutions.hands
hands = mp_hands.Hands(
    static_image_mode=False,        # Video mode (not static images)
    max_num_hands=2,                # Detect up to 2 hands
    min_detection_confidence=0.6    # 60% confidence threshold
)

# Load pre-trained face mesh model
mp_face = mp.solutions.face_mesh
face = mp_face.FaceMesh(
    static_image_mode=False,        # Video mode
    max_num_faces=1,                # Detect 1 face
    min_detection_confidence=0.6    # 60% confidence threshold
)

# ============ SETUP WEBCAM ============
# Open webcam (0 = default camera)
cap = cv2.VideoCapture(0)

# ============ GET GESTURE LABEL ============
# Ask user what gesture they're recording
label = input("Enter label for this recording (e.g., 'Hello', 'Yes', 'No'): ").strip()
out = []

print("Recording... press 'q' to stop")

# ============ MAIN RECORDING LOOP ============
while True:
    # Capture frame from webcam
    ret, img = cap.read()
    if not ret: 
        break
    
    # Convert BGR (OpenCV) to RGB (MediaPipe)
    img_rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
    hres, wres = img.shape[:2]  # Image resolution

    # ============ DETECT LANDMARKS ============
    # Detect hand landmarks
    hand_res = hands.process(img_rgb)
    # Detect face landmarks
    face_res = face.process(img_rgb)

    # ============ BUILD FIXED-SIZE VECTOR ============
    """
    Create consistent 1530-element vector regardless of detections:
      - Hand: 42 points (21 per hand * 2) * 3 coords = 126 values
      - Face: 468 points * 3 coords = 1404 values
      - Total: 1530 values
    Missing detections are padded with zeros
    """
    
    # Extract hand landmarks
    hand_landmarks = []
    if hand_res.multi_hand_landmarks:
        # Loop through detected hands
        for lm in hand_res.multi_hand_landmarks:
            # Extract x, y, z for each landmark
            for p in lm.landmark:
                hand_landmarks.append([p.x, p.y, p.z])
    
    # Ensure exactly 42 hand points (pad with zeros if missing)
    while len(hand_landmarks) < 42:
        hand_landmarks.append([0.0, 0.0, 0.0])
    # Truncate if more than 42 (shouldn't happen but safe guard)
    hand_landmarks = hand_landmarks[:42]
    
    # Extract face landmarks
    face_land = []
    if face_res.multi_face_landmarks:
        # Get first (only) detected face
        for p in face_res.multi_face_landmarks[0].landmark:
            face_land.append([p.x, p.y, p.z])
    
    # Ensure exactly 468 face points (pad with zeros if missing)
    while len(face_land) < 468:
        face_land.append([0.0, 0.0, 0.0])
    face_land = face_land[:468]

    # ============ COMBINE INTO VECTOR ============
    # Concatenate hand and face landmarks, flatten to 1D, convert to float32
    vec = np.concatenate([
        np.array(hand_landmarks).flatten(),  # 126 values
        np.array(face_land).flatten()        # 1404 values
    ]).astype(np.float32)

    # Store frame data
    out.append({
        "timestamp": time.time(),   # When was this captured
        "label": label,             # Gesture name
        "vector": vec.tolist()      # Landmark vector (converted to list for JSON)
    })

    # Display video feed
    cv2.imshow("Recording: " + label, img)
    
    # Exit on 'q' key press
    if cv2.waitKey(1) & 0xFF == ord('q'):
        break

# ============ SAVE DATA ============
# Save all recorded frames to JSONL file (one JSON per line)
with open(f"data_{label}.jsonl", "w") as f:
    for row in out:
        f.write(json.dumps(row) + "\n")

print(f"Saved {len(out)} frames to data_{label}.jsonl")

# Cleanup
cap.release()
cv2.destroyAllWindows()
