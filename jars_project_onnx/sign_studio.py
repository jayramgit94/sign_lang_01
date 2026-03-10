"""
SIGN STUDIO — All-in-one tool for sign language model training.

Everything in ONE file: add signs, capture frames, train, test, export.

Usage:
  python sign_studio.py                  # Interactive menu
  python sign_studio.py capture          # Jump to capture mode
  python sign_studio.py train            # Jump to training
  python sign_studio.py test             # Live prediction test
  python sign_studio.py stats            # Show data statistics
  python sign_studio.py add "Goodbye"    # Quick-add a new sign
"""

import argparse
import json
import math
import os
import sys
import time
import shutil
import urllib.request
from glob import glob

import cv2
import numpy as np
import mediapipe as mp

# ═══════════════════════════════════════════════════════════════════
#  PATHS & CONFIG
# ═══════════════════════════════════════════════════════════════════

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
CONFIG_PATH = os.path.join(BASE_DIR, "config.json")
CLASSES_PATH = os.path.join(BASE_DIR, "classes.json")
DATA_RAW_DIR = os.path.join(BASE_DIR, "data_raw")
DATA_PROC_DIR = os.path.join(BASE_DIR, "data_processed")
MODEL_DIR = os.path.join(BASE_DIR, "model")
MP_MODELS_DIR = os.path.join(BASE_DIR, "mp_models")

for d in [DATA_RAW_DIR, DATA_PROC_DIR, MODEL_DIR, MP_MODELS_DIR]:
    os.makedirs(d, exist_ok=True)

# ── Defaults (override config.json where needed) ──
DEFAULT_FRAMES = 2000  # ← 2k frames per sign for good accuracy
DEFAULT_AUG_FACTOR = 5  # ← 5x augmentation (was 3x)
DEFAULT_EPOCHS = 80  # ← more epochs for better convergence
DEFAULT_BATCH = 64
DEFAULT_LR = 0.001
DEFAULT_PATIENCE = 12
DEFAULT_DROPOUT = 0.3
LABEL_SMOOTHING = 0.1  # ← prevents overconfident predictions
HAND_POINTS = 42  # 21 per hand × 2 hands
FACE_POINTS = 468
VECTOR_SIZE = (HAND_POINTS + FACE_POINTS) * 3  # 1530


def load_config():
    with open(CONFIG_PATH, encoding="utf-8") as f:
        return json.load(f)


def save_config(cfg):
    with open(CONFIG_PATH, "w", encoding="utf-8") as f:
        json.dump(cfg, f, indent=2, ensure_ascii=False)


def data_file_path(label):
    return os.path.join(DATA_RAW_DIR, f"data_{label}.jsonl")


def count_frames(label):
    path = data_file_path(label)
    if not os.path.exists(path):
        return 0
    with open(path, encoding="utf-8") as f:
        return sum(1 for _ in f)


# ═══════════════════════════════════════════════════════════════════
#  MEDIAPIPE SETUP (Tasks API)
# ═══════════════════════════════════════════════════════════════════

HAND_MODEL_PATH = os.path.join(MP_MODELS_DIR, "hand_landmarker.task")
FACE_MODEL_PATH = os.path.join(MP_MODELS_DIR, "face_landmarker.task")

_MODEL_URLS = {
    HAND_MODEL_PATH: "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/latest/hand_landmarker.task",
    FACE_MODEL_PATH: "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/latest/face_landmarker.task",
}


def ensure_mediapipe_models():
    for path, url in _MODEL_URLS.items():
        if not os.path.exists(path):
            print(f"  Downloading {os.path.basename(path)}...")
            urllib.request.urlretrieve(url, path)


def create_detectors(hand_conf=0.6, face_conf=0.6):
    ensure_mediapipe_models()
    BO = mp.tasks.BaseOptions
    hands = mp.tasks.vision.HandLandmarker.create_from_options(
        mp.tasks.vision.HandLandmarkerOptions(
            base_options=BO(model_asset_path=HAND_MODEL_PATH),
            running_mode=mp.tasks.vision.RunningMode.IMAGE,
            num_hands=2,
            min_hand_detection_confidence=hand_conf,
            min_tracking_confidence=hand_conf,
        )
    )
    face = mp.tasks.vision.FaceLandmarker.create_from_options(
        mp.tasks.vision.FaceLandmarkerOptions(
            base_options=BO(model_asset_path=FACE_MODEL_PATH),
            running_mode=mp.tasks.vision.RunningMode.IMAGE,
            num_faces=1,
            min_face_detection_confidence=face_conf,
        )
    )
    return hands, face


# ═══════════════════════════════════════════════════════════════════
#  VECTOR EXTRACTION (same 1530 features for compatibility)
# ═══════════════════════════════════════════════════════════════════


def extract_vector(hand_res, face_res):
    """Build fixed-size 1530-element vector from detection results."""
    hand_lm = []
    if hand_res.hand_landmarks:
        for hand in hand_res.hand_landmarks:
            for p in hand:
                hand_lm.append([p.x, p.y, p.z])
    while len(hand_lm) < HAND_POINTS:
        hand_lm.append([0.0, 0.0, 0.0])
    hand_lm = hand_lm[:HAND_POINTS]

    face_lm = []
    if face_res.face_landmarks:
        for p in face_res.face_landmarks[0]:
            face_lm.append([p.x, p.y, p.z])
    while len(face_lm) < FACE_POINTS:
        face_lm.append([0.0, 0.0, 0.0])
    face_lm = face_lm[:FACE_POINTS]

    return np.concatenate(
        [
            np.array(hand_lm).flatten(),
            np.array(face_lm).flatten(),
        ]
    ).astype(np.float32)


# ═══════════════════════════════════════════════════════════════════
#  GESTURE VALIDATORS (optional — known signs only)
# ═══════════════════════════════════════════════════════════════════


def _finger_up(lm, tip, pip):
    return lm[tip].y < lm[pip].y


def _finger_down(lm, tip, pip):
    return lm[tip].y > lm[pip].y


def _dist(a, b):
    return math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2)


VALIDATORS = {
    "Hello": lambda lm: sum(
        [
            _finger_up(lm, 8, 6),
            _finger_up(lm, 12, 10),
            _finger_up(lm, 16, 14),
            _finger_up(lm, 20, 18),
        ]
    )
    >= 3,
    "Yes": lambda lm: (lm[4].y < lm[3].y)
    and sum(
        [
            _finger_down(lm, 8, 6),
            _finger_down(lm, 12, 10),
            _finger_down(lm, 16, 14),
            _finger_down(lm, 20, 18),
        ]
    )
    >= 3,
    "No": lambda lm: sum(
        [
            _finger_down(lm, 8, 6),
            _finger_down(lm, 12, 10),
            _finger_down(lm, 16, 14),
            _finger_down(lm, 20, 18),
        ]
    )
    >= 2,
    "Thank You": lambda lm: sum(
        [
            _finger_up(lm, 8, 6),
            _finger_up(lm, 12, 10),
            _finger_up(lm, 16, 14),
            _finger_up(lm, 20, 18),
        ]
    )
    >= 3,
    "I Love You": lambda lm: (
        _finger_up(lm, 8, 6)
        and _finger_up(lm, 20, 18)
        and (_finger_down(lm, 12, 10) or _finger_down(lm, 16, 14))
        and (lm[4].y < lm[3].y or _dist(lm[4], lm[9]) > _dist(lm[3], lm[9]))
    ),
}

SIGN_HINTS = {
    "Hello": "Open palm, fingers spread, wave",
    "Yes": "Thumbs UP, other fingers curled",
    "No": "Closed fist / index pointing / head shake",
    "Thank You": "Flat hand near chin, move outward",
    "I Love You": "Thumb + Index + Pinky UP, middle+ring DOWN",
}


# ═══════════════════════════════════════════════════════════════════
#  SIGN MANAGEMENT
# ═══════════════════════════════════════════════════════════════════


def add_sign(cfg, name, emoji=""):
    signs = cfg.setdefault("signs", {})
    if name in signs:
        print(f'\n  Sign "{name}" already exists.\n')
        return False
    signs[name] = {"emoji": emoji}
    save_config(cfg)
    print(f'\n  ✓ Added sign: "{name}" {emoji}')
    return True


def remove_sign(cfg, name):
    signs = cfg.get("signs", {})
    if name not in signs:
        print(f'\n  Sign "{name}" not found.\n')
        return False
    resp = input(f'  Remove "{name}" and delete its data? (y/n): ').strip().lower()
    if resp != "y":
        print("  Cancelled.\n")
        return False
    del signs[name]
    save_config(cfg)
    path = data_file_path(name)
    if os.path.exists(path):
        os.remove(path)
    # Clear processed data (needs rebuild)
    for fname in ["X.npy", "y.npy"]:
        p = os.path.join(DATA_PROC_DIR, fname)
        if os.path.exists(p):
            os.remove(p)
    print(f'  ✓ Removed "{name}" and its data.\n')
    return True


# ═══════════════════════════════════════════════════════════════════
#  DATA STATS
# ═══════════════════════════════════════════════════════════════════


def show_stats(cfg):
    signs = cfg.get("signs", {})
    if not signs:
        print("\n  No signs configured. Use option 1 to add signs.\n")
        return

    total = 0
    print(f"\n  {'Sign':<20} {'Emoji':<6} {'Frames':>8}  Status")
    print("  " + "─" * 55)
    for name in sorted(signs.keys()):
        emoji = signs[name].get("emoji", "")
        frames = count_frames(name)
        total += frames
        if frames == 0:
            status = "❌ NO DATA"
        elif frames < 500:
            status = "⚠️  Low — capture more"
        elif frames < 1500:
            status = "🔶 OK — more would help"
        else:
            status = "✅ Good"
        print(f"  {name:<20} {emoji:<6} {frames:>8}  {status}")
    print("  " + "─" * 55)
    print(f"  Total: {len(signs)} signs, {total} frames\n")

    # Balance warning
    frames_per_sign = [count_frames(n) for n in signs]
    if frames_per_sign and max(frames_per_sign) > 0:
        ratio = (
            min(frames_per_sign) / max(frames_per_sign)
            if min(frames_per_sign) > 0
            else 0
        )
        if ratio < 0.5:
            print(
                "  ⚠️  WARNING: Dataset is unbalanced! Some signs have much less data."
            )
            print("  Capture more frames for the smaller signs for best accuracy.\n")


# ═══════════════════════════════════════════════════════════════════
#  CAPTURE ENGINE
# ═══════════════════════════════════════════════════════════════════


def draw_capture_hud(frame, label, count, target, status, hint, emoji, valid_pct):
    h, w = frame.shape[:2]
    color = {"VALID": (0, 255, 0), "WRONG_POSE": (0, 165, 255)}.get(status, (0, 0, 255))

    # Border
    cv2.rectangle(frame, (0, 0), (w - 1, h - 1), color, 4)

    # Top bar
    cv2.rectangle(frame, (0, 0), (w, 75), (0, 0, 0), -1)
    cv2.putText(
        frame,
        f"Recording: {label}  {emoji}",
        (10, 25),
        cv2.FONT_HERSHEY_SIMPLEX,
        0.7,
        (255, 255, 255),
        2,
    )
    cv2.putText(
        frame,
        f"Hint: {hint}",
        (10, 50),
        cv2.FONT_HERSHEY_SIMPLEX,
        0.5,
        (200, 200, 200),
        1,
    )

    # Status text
    msgs = {
        "VALID": "CORRECT GESTURE — RECORDING",
        "WRONG_POSE": "WRONG POSE — adjust hand",
        "NO_HAND": "NO HAND DETECTED — show your hand",
    }
    cv2.putText(
        frame, msgs.get(status, ""), (10, 95), cv2.FONT_HERSHEY_SIMPLEX, 0.6, color, 2
    )

    # Progress bar
    pct = min(count / max(target, 1), 1.0)
    bar_y = h - 40
    cv2.rectangle(frame, (10, bar_y), (w - 10, bar_y + 25), (50, 50, 50), -1)
    fill_w = 10 + int((w - 20) * pct)
    cv2.rectangle(frame, (10, bar_y), (fill_w, bar_y + 25), color, -1)
    cv2.putText(
        frame,
        f"{count}/{target}  |  Valid: {valid_pct:.0f}%",
        (10, bar_y - 8),
        cv2.FONT_HERSHEY_SIMPLEX,
        0.55,
        (255, 255, 255),
        1,
    )

    # Controls
    cv2.putText(
        frame,
        "SPACE=pause  |  q=stop  |  ESC=quit all",
        (10, h - 5),
        cv2.FONT_HERSHEY_SIMPLEX,
        0.4,
        (150, 150, 150),
        1,
    )


def capture_sign(label, target_frames, hands_det, face_det, cap, cfg):
    """Capture frames for a single sign. APPENDS to existing data."""
    signs = cfg.get("signs", {})
    emoji = signs.get(label, {}).get("emoji", "")
    validator = VALIDATORS.get(label)
    hint = SIGN_HINTS.get(label, "Show the gesture clearly with your hand")

    existing = count_frames(label)
    if existing > 0:
        print(f"  (Already have {existing} frames — new frames will be APPENDED)")

    print(f"\n  Recording: {label} {emoji}  ({target_frames} frames)")
    print(f"  Hint: {hint}")
    print(f"  Green=recording | Orange=wrong pose | Red=no hand")
    print(f"  Controls: SPACE=pause, q=stop, ESC=quit\n")

    frames = []
    total_checked = valid_count = 0
    paused = False

    while len(frames) < target_frames:
        ret, img = cap.read()
        if not ret:
            break

        if paused:
            h, w = img.shape[:2]
            cv2.rectangle(img, (0, 0), (w, h), (0, 0, 0), -1)
            cv2.putText(
                img,
                "PAUSED",
                (w // 2 - 80, h // 2 - 10),
                cv2.FONT_HERSHEY_SIMPLEX,
                1.2,
                (0, 255, 255),
                3,
            )
            cv2.putText(
                img,
                "Press SPACE to resume",
                (w // 2 - 130, h // 2 + 30),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.6,
                (200, 200, 200),
                1,
            )
            cv2.imshow("Sign Studio — Capture", img)
            key = cv2.waitKey(50) & 0xFF
            if key == ord(" "):
                paused = False
            elif key == 27:
                return frames, True
            continue

        rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
        mp_img = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)
        hand_res = hands_det.detect(mp_img)
        face_res = face_det.detect(mp_img)

        has_hand = bool(hand_res.hand_landmarks)

        if has_hand and validator:
            lm = hand_res.hand_landmarks[0]
            total_checked += 1
            if validator(lm):
                valid_count += 1
                status = "VALID"
            else:
                status = "WRONG_POSE"
        elif has_hand:
            status = "VALID"
            total_checked += 1
            valid_count += 1
        else:
            status = "NO_HAND"

        valid_pct = (valid_count / max(total_checked, 1)) * 100
        draw_capture_hud(
            img, label, len(frames), target_frames, status, hint, emoji, valid_pct
        )
        cv2.imshow("Sign Studio — Capture", img)

        if status == "VALID":
            vec = extract_vector(hand_res, face_res)
            frames.append(
                {"timestamp": time.time(), "label": label, "vector": vec.tolist()}
            )

        key = cv2.waitKey(1) & 0xFF
        if key == ord(" "):
            paused = True
        elif key == ord("q"):
            print(f"  Stopped early ({len(frames)}/{target_frames} captured)")
            break
        elif key == 27:
            return frames, True

    return frames, False


def save_frames(label, frames, append=True):
    """Save frames to JSONL file. Appends by default."""
    if not frames:
        print("  No frames to save.")
        return
    path = data_file_path(label)
    mode = "a" if append else "w"
    with open(path, mode, encoding="utf-8") as f:
        for row in frames:
            f.write(json.dumps(row) + "\n")
    total = count_frames(label)
    print(f"  ✓ Saved {len(frames)} frames → data_{label}.jsonl (total: {total})")


def run_capture(cfg):
    """Interactive capture flow."""
    signs = cfg.get("signs", {})
    if not signs:
        print("\n  No signs configured! Add a sign first (option 1).\n")
        return

    names = sorted(signs.keys())
    print("\n  Select sign to capture:")
    for i, name in enumerate(names, 1):
        emoji = signs[name].get("emoji", "")
        frames = count_frames(name)
        status = f"({frames} frames)" if frames > 0 else "(no data)"
        print(f"    {i}. {emoji} {name}  {status}")
    print(f"    A. Capture ALL signs sequentially")
    print(f"    0. Back\n")

    choice = input("  Enter choice: ").strip()
    if choice == "0":
        return
    capture_all = choice.upper() == "A"

    if not capture_all:
        try:
            idx = int(choice) - 1
            if not (0 <= idx < len(names)):
                print("  Invalid choice.")
                return
            selected = [names[idx]]
        except ValueError:
            print("  Invalid choice.")
            return
    else:
        selected = names

    # Ask for frame count
    try:
        fc = input(f"  Frames per sign [{DEFAULT_FRAMES}]: ").strip()
        target = int(fc) if fc else DEFAULT_FRAMES
    except ValueError:
        target = DEFAULT_FRAMES

    hands_det, face_det = create_detectors()
    cap = cv2.VideoCapture(cfg.get("capture", {}).get("camera_index", 0))
    if not cap.isOpened():
        print("  ERROR: Cannot open camera!")
        return

    try:
        results = {}
        for i, name in enumerate(selected):
            # Countdown
            for sec in range(3, 0, -1):
                ret, img = cap.read()
                if ret:
                    h, w = img.shape[:2]
                    cv2.rectangle(img, (0, 0), (w, h), (0, 0, 0), -1)
                    emoji = signs[name].get("emoji", "")
                    hint = SIGN_HINTS.get(name, "Show the gesture")
                    cv2.putText(
                        img,
                        f"Next: {name}  {emoji}",
                        (w // 2 - 150, h // 2 - 30),
                        cv2.FONT_HERSHEY_SIMPLEX,
                        1.0,
                        (255, 255, 255),
                        2,
                    )
                    cv2.putText(
                        img,
                        hint,
                        (w // 2 - 180, h // 2 + 10),
                        cv2.FONT_HERSHEY_SIMPLEX,
                        0.5,
                        (200, 200, 200),
                        1,
                    )
                    cv2.putText(
                        img,
                        f"Starting in {sec}...",
                        (w // 2 - 80, h // 2 + 50),
                        cv2.FONT_HERSHEY_SIMPLEX,
                        0.7,
                        (0, 255, 255),
                        2,
                    )
                    cv2.imshow("Sign Studio — Capture", img)
                    cv2.waitKey(1000)

            if len(selected) > 1:
                print(
                    f"\n  [{i + 1}/{len(selected)}] {signs[name].get('emoji', '')} {name}"
                )

            frames, quit_all = capture_sign(name, target, hands_det, face_det, cap, cfg)
            save_frames(name, frames, append=True)
            results[name] = len(frames)

            if quit_all:
                break

        # Summary
        print("\n  " + "═" * 50)
        print("  CAPTURE SUMMARY")
        print("  " + "═" * 50)
        total = 0
        for name in selected:
            c = results.get(name, 0)
            emoji = signs[name].get("emoji", "")
            tot = count_frames(name)
            print(f"  {emoji} {name:<18} +{c:>5} frames  (total: {tot})")
            total += c
        print(f"\n  Captured: {total} new frames")
        print("  " + "═" * 50)

    finally:
        cap.release()
        cv2.destroyAllWindows()


# ═══════════════════════════════════════════════════════════════════
#  NORMALIZATION
# ═══════════════════════════════════════════════════════════════════


def normalize_vector(vec):
    """Center and scale landmark vector."""
    arr = np.asarray(vec, dtype=np.float32)
    if arr.size == 0:
        return arr
    pts = arr.reshape(-1, 3)
    hand_pts = pts[:HAND_POINTS]
    face_pts = pts[HAND_POINTS:]

    ref = np.mean(face_pts, axis=0) if np.any(face_pts) else np.mean(hand_pts, axis=0)
    pts[:, :2] -= ref[:2]
    std = np.std(pts[:, :2])
    if std > 1e-6:
        pts[:, :2] /= std
    return pts.flatten().astype(np.float32)


# ═══════════════════════════════════════════════════════════════════
#  AUGMENTATION (enhanced — 5x default with more techniques)
# ═══════════════════════════════════════════════════════════════════


def augment(vec, factor=DEFAULT_AUG_FACTOR):
    """Generate augmented versions with multiple techniques.

    Techniques:
      1. Gaussian noise (simulates hand jitter)
      2. Random scale (simulates distance variation)
      3. Random rotation (simulates wrist angle)
      4. Horizontal mirror (simulates left/right hand swap)
      5. Random translation (simulates position variation)
    """
    augmented = []
    pts = vec.reshape(-1, 3)

    for i in range(factor):
        aug = pts.copy()

        # 1. Gaussian noise on x,y (σ=0.02)
        noise = np.random.normal(0, 0.02, aug[:, :2].shape).astype(np.float32)
        aug[:, :2] += noise

        # 2. Random scale 0.90–1.10
        scale = np.random.uniform(0.90, 1.10)
        aug[:, :2] *= scale

        # 3. Small rotation on x,y (±8 degrees)
        if i % 2 == 0:
            angle = np.random.uniform(-0.14, 0.14)
            cos_a, sin_a = np.cos(angle), np.sin(angle)
            x = aug[:, 0] * cos_a - aug[:, 1] * sin_a
            y = aug[:, 0] * sin_a + aug[:, 1] * cos_a
            aug[:, 0] = x
            aug[:, 1] = y

        # 4. Horizontal mirror (flip x-axis) — every 3rd augmentation
        if i % 3 == 1:
            aug[:, 0] = -aug[:, 0]

        # 5. Random translation — every 4th augmentation
        if i % 4 == 2:
            tx = np.random.uniform(-0.05, 0.05)
            ty = np.random.uniform(-0.05, 0.05)
            aug[:, 0] += tx
            aug[:, 1] += ty

        augmented.append(aug.flatten().astype(np.float32))

    return augmented


# ═══════════════════════════════════════════════════════════════════
#  DATA LOADING
# ═══════════════════════════════════════════════════════════════════


def load_data(augment_factor=DEFAULT_AUG_FACTOR):
    """Load raw JSONL files, normalize, augment, return X, y, classes."""
    X, y = [], []
    classes = {}

    files = sorted(glob(os.path.join(DATA_RAW_DIR, "*.jsonl")))
    if not files:
        print("\n  ERROR: No data files found in data_raw/")
        print("  Use option 2 to capture training data first.\n")
        return None, None, None

    print(f"\n  Loading {len(files)} data files...")

    for file in files:
        count = 0
        with open(file, encoding="utf-8") as f:
            for line in f:
                row = json.loads(line)
                vec = normalize_vector(np.array(row["vector"], dtype=np.float32))
                label = row["label"]

                if label not in classes:
                    classes[label] = len(classes)

                X.append(vec)
                y.append(classes[label])
                count += 1

                if augment_factor > 0:
                    for aug_vec in augment(vec, augment_factor):
                        X.append(aug_vec)
                        y.append(classes[label])

        total = count * (1 + augment_factor) if augment_factor > 0 else count
        print(f"    {os.path.basename(file)}: {count} raw → {total} total")

    X = np.stack(X)
    y = np.array(y, dtype=np.int64)

    # Save processed data
    np.save(os.path.join(DATA_PROC_DIR, "X.npy"), X)
    np.save(os.path.join(DATA_PROC_DIR, "y.npy"), y)
    with open(CLASSES_PATH, "w", encoding="utf-8") as f:
        json.dump(classes, f, indent=2, ensure_ascii=False)

    print(
        f"\n  Dataset: {X.shape[0]} samples, {X.shape[1]} features, {len(classes)} classes"
    )
    for name, idx in sorted(classes.items(), key=lambda x: x[1]):
        n = np.sum(y == idx)
        print(f"    [{idx}] {name}: {n} samples")

    return X, y, classes


# ═══════════════════════════════════════════════════════════════════
#  MODEL ARCHITECTURES (lazy-loaded — heavy imports happen only when needed)
# ═══════════════════════════════════════════════════════════════════

_torch_loaded = False


def _ensure_torch():
    """Lazy-import torch, onnx, sklearn. Only runs once."""
    global _torch_loaded
    if _torch_loaded:
        return True
    try:
        import torch  # noqa: F811
        import torch.nn  # noqa: F811
        from torch.utils.data import TensorDataset, DataLoader  # noqa: F811
        from sklearn.model_selection import train_test_split  # noqa: F811
        from sklearn.utils.class_weight import compute_class_weight  # noqa: F811
        import onnx  # noqa: F811

        _torch_loaded = True
        return True
    except ImportError as e:
        print(f"\n  ERROR: Missing dependency: {e}")
        print("  Run: pip install torch torchvision scikit-learn onnx\n")
        return False


def _build_model(algorithm, in_features, num_classes, dropout=0.3, hidden=None):
    """Build a model by name. Imports torch internally."""
    import torch.nn as nn

    class SignMLP(nn.Module):
        def __init__(self, inf, nc, hid, dp):
            super().__init__()
            hid = hid or [512, 256, 128]
            layers = []
            prev = inf
            for h in hid:
                layers += [
                    nn.Linear(prev, h),
                    nn.BatchNorm1d(h),
                    nn.ReLU(),
                    nn.Dropout(dp),
                ]
                prev = h
            layers.append(nn.Linear(prev, nc))
            self.net = nn.Sequential(*layers)

        def forward(self, x):
            return self.net(x)

    class DeepMLP(nn.Module):
        def __init__(self, inf, nc, dp):
            super().__init__()
            import torch as _t

            self._torch = _t
            self.input_proj = nn.Sequential(
                nn.Linear(inf, 512), nn.BatchNorm1d(512), nn.ReLU()
            )
            self.res1 = nn.Sequential(
                nn.Linear(512, 512),
                nn.BatchNorm1d(512),
                nn.ReLU(),
                nn.Dropout(dp),
                nn.Linear(512, 512),
                nn.BatchNorm1d(512),
            )
            self.res2 = nn.Sequential(
                nn.Linear(512, 256),
                nn.BatchNorm1d(256),
                nn.ReLU(),
                nn.Dropout(dp),
                nn.Linear(256, 256),
                nn.BatchNorm1d(256),
            )
            self.downsample = nn.Linear(512, 256)
            self.head = nn.Sequential(
                nn.ReLU(),
                nn.Dropout(dp),
                nn.Linear(256, 128),
                nn.ReLU(),
                nn.Linear(128, nc),
            )

        def forward(self, x):
            x = self.input_proj(x)
            x = self._torch.relu(self.res1(x) + x)
            x = self._torch.relu(self.res2(x) + self.downsample(x))
            return self.head(x)

    class Conv1DNet(nn.Module):
        def __init__(self, inf, nc, dp):
            super().__init__()
            self.conv = nn.Sequential(
                nn.Conv1d(3, 64, kernel_size=7, padding=3),
                nn.BatchNorm1d(64),
                nn.ReLU(),
                nn.MaxPool1d(2),
                nn.Conv1d(64, 128, kernel_size=5, padding=2),
                nn.BatchNorm1d(128),
                nn.ReLU(),
                nn.MaxPool1d(2),
                nn.Conv1d(128, 256, kernel_size=3, padding=1),
                nn.BatchNorm1d(256),
                nn.ReLU(),
                nn.AdaptiveAvgPool1d(1),
            )
            self.head = nn.Sequential(
                nn.Flatten(),
                nn.Dropout(dp),
                nn.Linear(256, 128),
                nn.ReLU(),
                nn.Linear(128, nc),
            )

        def forward(self, x):
            x = x.view(x.size(0), -1, 3).permute(0, 2, 1)
            return self.head(self.conv(x))

    builders = {
        "mlp": lambda: SignMLP(in_features, num_classes, hidden, dropout),
        "deep_mlp": lambda: DeepMLP(in_features, num_classes, dropout),
        "cnn1d": lambda: Conv1DNet(in_features, num_classes, dropout),
    }
    return builders[algorithm]()


ALGORITHM_NAMES = ["mlp", "deep_mlp", "cnn1d"]


# ═══════════════════════════════════════════════════════════════════
#  TRAINING ENGINE (with label smoothing, cosine annealing, grad clip)
# ═══════════════════════════════════════════════════════════════════


def train_model(
    X,
    y,
    classes,
    algorithm="mlp",
    epochs=DEFAULT_EPOCHS,
    batch_size=DEFAULT_BATCH,
    lr=DEFAULT_LR,
    patience=DEFAULT_PATIENCE,
    dropout=DEFAULT_DROPOUT,
    hidden=None,
    weight_decay=1e-4,
):
    """Train model with improved techniques."""
    import torch
    import torch.nn as nn
    from torch.utils.data import TensorDataset, DataLoader
    from sklearn.model_selection import train_test_split
    from sklearn.utils.class_weight import compute_class_weight

    num_features = X.shape[1]
    num_classes = len(classes)

    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=42, stratify=y
    )

    X_train = torch.tensor(X_train, dtype=torch.float32)
    X_test = torch.tensor(X_test, dtype=torch.float32)
    y_train = torch.tensor(y_train, dtype=torch.long)
    y_test = torch.tensor(y_test, dtype=torch.long)

    train_loader = DataLoader(
        TensorDataset(X_train, y_train), batch_size=batch_size, shuffle=True
    )
    test_loader = DataLoader(TensorDataset(X_test, y_test), batch_size=batch_size)

    # Class weights for imbalanced data
    cw = compute_class_weight("balanced", classes=np.unique(y), y=y)
    class_weights = torch.tensor(cw, dtype=torch.float32)

    # Build model
    model = _build_model(algorithm, num_features, num_classes, dropout, hidden)

    param_count = sum(p.numel() for p in model.parameters())
    print(f"\n  Model: {algorithm.upper()} ({param_count:,} parameters)")

    # Label smoothing loss + class weights
    loss_fn = nn.CrossEntropyLoss(weight=class_weights, label_smoothing=LABEL_SMOOTHING)
    optimizer = torch.optim.AdamW(model.parameters(), lr=lr, weight_decay=weight_decay)

    # Cosine annealing scheduler (smoother than ReduceLROnPlateau)
    scheduler = torch.optim.lr_scheduler.CosineAnnealingLR(
        optimizer, T_max=epochs, eta_min=lr * 0.01
    )

    best_acc = 0.0
    best_loss = float("inf")
    best_state = None
    no_improve = 0

    print(f"  Epochs: {epochs} | Batch: {batch_size} | LR: {lr} | Patience: {patience}")
    print(f"  Label Smoothing: {LABEL_SMOOTHING} | Cosine Annealing | Grad Clip: 1.0")
    print(f"  {'Epoch':>6} {'TrainLoss':>11} {'ValLoss':>9} {'ValAcc':>8} {'LR':>10}")
    print("  " + "─" * 50)

    for epoch in range(1, epochs + 1):
        # Train
        model.train()
        train_loss = 0
        for xb, yb in train_loader:
            optimizer.zero_grad()
            loss = loss_fn(model(xb), yb)
            loss.backward()
            torch.nn.utils.clip_grad_norm_(model.parameters(), max_norm=1.0)
            optimizer.step()
            train_loss += loss.item()
        scheduler.step()

        # Validate
        model.eval()
        val_loss = correct = total = 0
        with torch.no_grad():
            for xb, yb in test_loader:
                out = model(xb)
                val_loss += loss_fn(out, yb).item()
                correct += (out.argmax(1) == yb).sum().item()
                total += yb.size(0)

        val_acc = correct / total
        current_lr = optimizer.param_groups[0]["lr"]

        if epoch <= 5 or epoch % 5 == 0 or epoch == epochs:
            print(
                f"  {epoch:>4}/{epochs} {train_loss:>11.4f} {val_loss:>9.4f} {val_acc:>7.1%} {current_lr:>10.6f}"
            )

        # Early stopping
        if val_acc > best_acc or (val_acc == best_acc and val_loss < best_loss):
            best_acc = val_acc
            best_loss = val_loss
            best_state = {k: v.clone() for k, v in model.state_dict().items()}
            no_improve = 0
        else:
            no_improve += 1
            if no_improve >= patience:
                print(
                    f"\n  Early stop at epoch {epoch} (no improvement for {patience} epochs)"
                )
                break

    if best_state:
        model.load_state_dict(best_state)

    # Final evaluation
    model.eval()
    correct = total = 0
    with torch.no_grad():
        for xb, yb in test_loader:
            correct += (model(xb).argmax(1) == yb).sum().item()
            total += yb.size(0)

    final_acc = correct / total
    print(f"\n  ✅ Best Validation Accuracy: {final_acc:.1%}")
    return model, final_acc, num_features


def export_onnx(model, num_features, path=None):
    """Export to ONNX."""
    import torch
    import onnx

    if path is None:
        path = os.path.join(MODEL_DIR, "model.onnx")

    model.eval()
    dummy = torch.randn(1, num_features)
    torch.onnx.export(
        model,
        dummy,
        path,
        input_names=["input"],
        output_names=["output"],
        opset_version=17,
        dynamic_axes={"input": {0: "batch"}, "output": {0: "batch"}},
    )
    onnx_model = onnx.load(path)
    onnx.checker.check_model(onnx_model)
    print(f"  ✓ Exported & validated: {path}")


def run_training(cfg):
    """Interactive training flow."""
    if not _ensure_torch():
        return

    signs = cfg.get("signs", {})
    files_with_data = [n for n in signs if count_frames(n) > 0]
    if len(files_with_data) < 2:
        print(
            f"\n  Need at least 2 signs with data. Currently have: {len(files_with_data)}"
        )
        print("  Capture more signs first (option 2).\n")
        return

    print("\n  Training algorithms:")
    print("    1. mlp       — Standard MLP (fast, good baseline)")
    print("    2. deep_mlp  — Deeper MLP with residual connections")
    print("    3. cnn1d     — 1D CNN (good for spatial patterns)")
    print("    4. ensemble  — Try ALL three, pick best (recommended)\n")

    algo_map = {"1": "mlp", "2": "deep_mlp", "3": "cnn1d", "4": "ensemble"}
    choice = input("  Choose [4=ensemble]: ").strip() or "4"
    algorithm = algo_map.get(choice, "ensemble")

    try:
        aug_input = input(f"  Augmentation factor [{DEFAULT_AUG_FACTOR}x]: ").strip()
        aug = int(aug_input) if aug_input else DEFAULT_AUG_FACTOR
    except ValueError:
        aug = DEFAULT_AUG_FACTOR

    try:
        ep_input = input(f"  Epochs [{DEFAULT_EPOCHS}]: ").strip()
        epochs = int(ep_input) if ep_input else DEFAULT_EPOCHS
    except ValueError:
        epochs = DEFAULT_EPOCHS

    print("\n" + "═" * 55)
    print("  SIGN STUDIO — TRAINING PIPELINE")
    print("═" * 55)

    start = time.time()
    X, y, classes = load_data(augment_factor=aug)
    if X is None:
        return

    if algorithm == "ensemble":
        print("\n  ═══ ENSEMBLE MODE: Training all 3 architectures ═══")
        best_model = None
        best_acc = 0
        best_algo = None
        best_features = None

        for algo in ALGORITHM_NAMES:
            print(f"\n  ──── Training {algo.upper()} ────")
            model, acc, nf = train_model(X, y, classes, algorithm=algo, epochs=epochs)
            if acc > best_acc:
                best_acc = acc
                best_model = model
                best_algo = algo
                best_features = nf

        print(f"\n  🏆 ENSEMBLE WINNER: {best_algo.upper()} ({best_acc:.1%} accuracy)")
        model = best_model
        num_features = best_features
    else:
        model, _, num_features = train_model(
            X, y, classes, algorithm=algorithm, epochs=epochs
        )

    # Save
    import torch

    pth_path = os.path.join(MODEL_DIR, "model.pth")
    torch.save(model.state_dict(), pth_path)
    print(f"  ✓ Saved PyTorch: {pth_path}")
    export_onnx(model, num_features)

    elapsed = time.time() - start
    print(f"\n  Total time: {elapsed:.1f}s")
    print("═" * 55)
    print("  Done! You can now test with option 5 or start the server.")
    print("═" * 55 + "\n")


# ═══════════════════════════════════════════════════════════════════
#  LIVE TEST MODE
# ═══════════════════════════════════════════════════════════════════


def run_test(cfg):
    """Live prediction test using the trained ONNX model."""
    onnx_path = os.path.join(MODEL_DIR, "model.onnx")
    if not os.path.exists(onnx_path):
        print("\n  No trained model found. Train first (option 4).\n")
        return

    if not os.path.exists(CLASSES_PATH):
        print("\n  No classes.json found. Train first (option 4).\n")
        return

    try:
        import onnxruntime as ort
    except ImportError:
        print("\n  ERROR: onnxruntime not installed. Run: pip install onnxruntime\n")
        return

    with open(CLASSES_PATH, encoding="utf-8") as f:
        classes = json.load(f)
    idx_to_label = {v: k for k, v in classes.items()}

    session = ort.InferenceSession(onnx_path)
    input_name = session.get_inputs()[0].name

    hands_det, face_det = create_detectors()
    cap = cv2.VideoCapture(cfg.get("capture", {}).get("camera_index", 0))
    if not cap.isOpened():
        print("  ERROR: Cannot open camera!")
        return

    signs = cfg.get("signs", {})
    print("\n  Live Test Mode — show signs to the camera!")
    print("  Press 'q' to quit.\n")

    smoothed_label = ""
    smoothed_score = 0.0
    history = []
    SMOOTH_WINDOW = 5

    try:
        while True:
            ret, img = cap.read()
            if not ret:
                break

            rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
            mp_img = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)
            hand_res = hands_det.detect(mp_img)
            face_res = face_det.detect(mp_img)

            h, w = img.shape[:2]
            has_hand = bool(hand_res.hand_landmarks)

            if has_hand:
                vec = extract_vector(hand_res, face_res)
                norm_vec = normalize_vector(vec)
                input_data = norm_vec.reshape(1, -1).astype(np.float32)

                outputs = session.run(None, {input_name: input_data})
                logits = outputs[0][0]

                # Softmax
                exp_logits = np.exp(logits - np.max(logits))
                probs = exp_logits / exp_logits.sum()

                pred_idx = np.argmax(probs)
                confidence = probs[pred_idx]
                label = idx_to_label.get(pred_idx, "?")

                # Temporal smoothing
                history.append(label)
                if len(history) > SMOOTH_WINDOW:
                    history.pop(0)

                # Most common in window
                from collections import Counter

                counts = Counter(history)
                smoothed_label = counts.most_common(1)[0][0]
                smoothed_score = confidence

                emoji = signs.get(smoothed_label, {}).get("emoji", "")
                color = (
                    (0, 255, 0)
                    if smoothed_score > 0.8
                    else (0, 165, 255) if smoothed_score > 0.5 else (0, 0, 255)
                )

                # Display
                cv2.rectangle(img, (0, h - 80), (w, h), (0, 0, 0), -1)
                cv2.putText(
                    img,
                    f"{emoji} {smoothed_label}",
                    (15, h - 45),
                    cv2.FONT_HERSHEY_SIMPLEX,
                    1.0,
                    color,
                    2,
                )
                cv2.putText(
                    img,
                    f"Confidence: {smoothed_score:.0%}",
                    (15, h - 15),
                    cv2.FONT_HERSHEY_SIMPLEX,
                    0.6,
                    (200, 200, 200),
                    1,
                )

                # Confidence bar
                bar_w = int(200 * smoothed_score)
                cv2.rectangle(
                    img, (w - 220, h - 50), (w - 20, h - 30), (50, 50, 50), -1
                )
                cv2.rectangle(
                    img, (w - 220, h - 50), (w - 220 + bar_w, h - 30), color, -1
                )

            else:
                cv2.rectangle(img, (0, h - 60), (w, h), (0, 0, 0), -1)
                cv2.putText(
                    img,
                    "Show your hand...",
                    (15, h - 25),
                    cv2.FONT_HERSHEY_SIMPLEX,
                    0.7,
                    (100, 100, 100),
                    1,
                )
                history.clear()

            cv2.putText(
                img,
                "Sign Studio TEST  |  q=quit",
                (10, 25),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.5,
                (150, 150, 150),
                1,
            )
            cv2.imshow("Sign Studio — Live Test", img)

            if cv2.waitKey(1) & 0xFF == ord("q"):
                break
    finally:
        cap.release()
        cv2.destroyAllWindows()

    print("  Test mode ended.\n")


# ═══════════════════════════════════════════════════════════════════
#  INTERACTIVE MENU
# ═══════════════════════════════════════════════════════════════════


def print_banner():
    print("\n" + "═" * 55)
    print("  🤟  SIGN STUDIO — Sign Language Model Trainer")
    print("═" * 55)


def interactive_menu():
    cfg = load_config()
    print_banner()

    while True:
        signs = cfg.get("signs", {})
        total_frames = sum(count_frames(n) for n in signs)

        print(f"\n  Signs: {len(signs)}  |  Total frames: {total_frames}")
        print("  ─────────────────────────────────────")
        print("  1. ➕ Add New Sign")
        print("  2. 📸 Capture Frames")
        print("  3. 📊 View Data Stats")
        print("  4. 🧠 Train Model")
        print("  5. 🎯 Live Test")
        print("  6. ❌ Remove Sign")
        print("  0. Exit\n")

        choice = input("  Enter choice: ").strip()

        if choice == "1":
            name = input("  Sign label (e.g. 'Goodbye'): ").strip()
            if not name:
                continue
            emoji = input("  Emoji (optional, press Enter to skip): ").strip()
            if add_sign(cfg, name, emoji):
                capture_now = input("  Capture frames now? (y/n): ").strip().lower()
                if capture_now == "y":
                    run_capture(cfg)

        elif choice == "2":
            run_capture(cfg)

        elif choice == "3":
            show_stats(cfg)

        elif choice == "4":
            run_training(cfg)

        elif choice == "5":
            run_test(cfg)

        elif choice == "6":
            names = sorted(signs.keys())
            if not names:
                print("\n  No signs to remove.\n")
                continue
            print("\n  Signs:")
            for i, n in enumerate(names, 1):
                emoji = signs[n].get("emoji", "")
                print(f"    {i}. {emoji} {n}")
            try:
                idx = int(input("  Remove which? ").strip()) - 1
                if 0 <= idx < len(names):
                    remove_sign(cfg, names[idx])
                    cfg = load_config()
            except (ValueError, IndexError):
                print("  Invalid choice.")

        elif choice == "0":
            print("\n  Bye! 👋\n")
            break

        else:
            print("  Invalid choice. Try again.")


# ═══════════════════════════════════════════════════════════════════
#  MAIN (CLI + interactive)
# ═══════════════════════════════════════════════════════════════════


def main():
    parser = argparse.ArgumentParser(
        description="Sign Studio — All-in-one sign language trainer"
    )
    parser.add_argument(
        "command",
        nargs="?",
        default=None,
        choices=["capture", "train", "test", "stats", "add"],
        help="Jump directly to a command",
    )
    parser.add_argument(
        "label", nargs="?", default=None, help="Sign label (for 'add' command)"
    )
    parser.add_argument("--emoji", type=str, default="", help="Emoji for the sign")
    parser.add_argument(
        "--frames", type=int, default=DEFAULT_FRAMES, help="Frames per sign"
    )
    parser.add_argument(
        "--algorithm",
        "-a",
        choices=ALGORITHM_NAMES + ["ensemble"],
        default="ensemble",
        help="Training algorithm",
    )
    parser.add_argument(
        "--augment", type=int, default=DEFAULT_AUG_FACTOR, help="Augmentation factor"
    )
    parser.add_argument(
        "--epochs", "-e", type=int, default=DEFAULT_EPOCHS, help="Training epochs"
    )
    args = parser.parse_args()

    cfg = load_config()

    if args.command == "add":
        if not args.label:
            print('  Usage: python sign_studio.py add "Goodbye" --emoji 👋')
            return
        add_sign(cfg, args.label, args.emoji)

    elif args.command == "capture":
        run_capture(cfg)

    elif args.command == "train":
        run_training(cfg)

    elif args.command == "test":
        run_test(cfg)

    elif args.command == "stats":
        show_stats(cfg)

    else:
        interactive_menu()


if __name__ == "__main__":
    main()
