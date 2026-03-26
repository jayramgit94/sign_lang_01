"""
CAPTURE — Record gesture landmarks with live validation and HUD.

Usage:
  python capture.py                          # Interactive menu (pick a sign)
  python capture.py --label Hello            # Capture specific sign
  python capture.py --label Hello --frames 1000
  python capture.py --all                    # Capture ALL signs one after another
  python capture.py --all --skip Hello Yes   # Capture all, skip some
"""

import argparse
import json
import math
import os
import sys
import time
import urllib.request

import cv2
import numpy as np
import mediapipe as mp

# ============ PATHS ============
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
CONFIG_PATH = os.path.join(BASE_DIR, "config.json")
DATA_RAW_DIR = os.path.join(BASE_DIR, "data_raw")
MODELS_DIR = os.path.join(BASE_DIR, "mp_models")

os.makedirs(DATA_RAW_DIR, exist_ok=True)
os.makedirs(MODELS_DIR, exist_ok=True)

# ============ LOAD CONFIG ============
with open(CONFIG_PATH, encoding="utf-8") as f:
    CFG = json.load(f)

SIGNS = CFG["signs"]
CAP_CFG = CFG["capture"]
VEC_CFG = CFG["vector"]
HAND_POINTS = VEC_CFG["hand_points"]   # 42
FACE_POINTS = VEC_CFG["face_points"]   # 468

# ============ DOWNLOAD MEDIAPIPE TASK MODELS ============
HAND_MODEL = os.path.join(MODELS_DIR, "hand_landmarker.task")
FACE_MODEL = os.path.join(MODELS_DIR, "face_landmarker.task")

_URLS = {
    HAND_MODEL: "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/latest/hand_landmarker.task",
    FACE_MODEL: "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/latest/face_landmarker.task",
}


def ensure_model(path):
    """Download MediaPipe task model on demand if not present locally."""
    if os.path.exists(path):
        return
    print(f"Downloading {os.path.basename(path)}...")
    urllib.request.urlretrieve(_URLS[path], path)


# ======================================================================
#  GESTURE VALIDATORS — hand-shape checks for quality assurance
# ======================================================================

def _finger_up(lm, tip, pip):
    return lm[tip].y < lm[pip].y

def _finger_down(lm, tip, pip):
    return lm[tip].y > lm[pip].y

def _dist(a, b):
    return math.sqrt((a.x - b.x)**2 + (a.y - b.y)**2)

def validate_hello(lm):
    """Open palm — at least 3 fingers extended."""
    return sum([_finger_up(lm, 8, 6), _finger_up(lm, 12, 10),
                _finger_up(lm, 16, 14), _finger_up(lm, 20, 18)]) >= 3

def validate_yes(lm):
    """Thumbs up — thumb extended, others curled."""
    thumb = lm[4].y < lm[3].y
    curled = sum([_finger_down(lm, 8, 6), _finger_down(lm, 12, 10),
                  _finger_down(lm, 16, 14), _finger_down(lm, 20, 18)])
    return thumb and curled >= 3

def validate_no(lm):
    """Index pointing or fist — at least 2 fingers curled."""
    return sum([_finger_down(lm, 8, 6), _finger_down(lm, 12, 10),
                _finger_down(lm, 16, 14), _finger_down(lm, 20, 18)]) >= 2

def validate_thank_you(lm):
    """Flat hand — at least 3 fingers extended."""
    return sum([_finger_up(lm, 8, 6), _finger_up(lm, 12, 10),
                _finger_up(lm, 16, 14), _finger_up(lm, 20, 18)]) >= 3

def validate_i_love_you(lm):
    """ILY — thumb + index + pinky UP, middle + ring DOWN."""
    thumb = lm[4].y < lm[3].y or _dist(lm[4], lm[9]) > _dist(lm[3], lm[9])
    return (_finger_up(lm, 8, 6) and _finger_up(lm, 20, 18)
            and (_finger_down(lm, 12, 10) or _finger_down(lm, 16, 14)) and thumb)

# Map sign names → validators (signs not listed here accept any hand frame)
VALIDATORS = {
    "Hello": validate_hello,
    "Yes": validate_yes,
    "No": validate_no,
    "Thank You": validate_thank_you,
    "I Love You": validate_i_love_you,
}

SIGN_HINTS = {
    "Hello": "Open palm, fingers spread, wave",
    "Yes": "Thumbs UP, other fingers curled",
    "No": "Closed fist / index pointing / head shake",
    "Thank You": "Flat hand near chin, move outward",
    "I Love You": "Thumb + Index + Pinky UP, middle+ring DOWN",
}


# ======================================================================
#  MEDIAPIPE DETECTORS (Tasks API — works with v0.10+)
# ======================================================================

def create_detectors(use_face=True):
    """Create MediaPipe detectors. Face detector is optional for hand-only mode."""
    ensure_model(HAND_MODEL)
    BO = mp.tasks.BaseOptions
    hands = mp.tasks.vision.HandLandmarker.create_from_options(
        mp.tasks.vision.HandLandmarkerOptions(
            base_options=BO(model_asset_path=HAND_MODEL),
            running_mode=mp.tasks.vision.RunningMode.IMAGE,
            num_hands=2,
            min_hand_detection_confidence=CAP_CFG["min_hand_confidence"],
            min_tracking_confidence=CAP_CFG["min_hand_confidence"],
        )
    )
    face = None
    if use_face:
        ensure_model(FACE_MODEL)
        face = mp.tasks.vision.FaceLandmarker.create_from_options(
            mp.tasks.vision.FaceLandmarkerOptions(
                base_options=BO(model_asset_path=FACE_MODEL),
                running_mode=mp.tasks.vision.RunningMode.IMAGE,
                num_faces=1,
                min_face_detection_confidence=CAP_CFG["min_face_confidence"],
            )
        )
    return hands, face


def extract_vector(hand_res, face_res, include_face=True):
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
    if include_face and face_res and face_res.face_landmarks:
        for p in face_res.face_landmarks[0]:
            face_lm.append([p.x, p.y, p.z])
    while len(face_lm) < FACE_POINTS:
        face_lm.append([0.0, 0.0, 0.0])
    face_lm = face_lm[:FACE_POINTS]

    return np.concatenate([
        np.array(hand_lm).flatten(),
        np.array(face_lm).flatten(),
    ]).astype(np.float32)


# ======================================================================
#  HUD OVERLAY
# ======================================================================

def draw_hud(frame, label, count, target, status, hint, valid_pct, mode_text):
    h, w = frame.shape[:2]
    color = {"VALID": (0, 255, 0), "WRONG_POSE": (0, 165, 255)}.get(status, (0, 0, 255))

    cv2.rectangle(frame, (0, 0), (w - 1, h - 1), color, 4)

    # Top bar
    cv2.rectangle(frame, (0, 0), (w, 70), (0, 0, 0), -1)
    emoji = SIGNS.get(label, {}).get("emoji", "")
    cv2.putText(frame, f"Recording: {label}  {emoji}", (10, 25),
                cv2.FONT_HERSHEY_SIMPLEX, 0.7, (255, 255, 255), 2)
    cv2.putText(frame, f"Mode: {mode_text}", (10, 45),
                cv2.FONT_HERSHEY_SIMPLEX, 0.5, (120, 255, 180), 1)
    cv2.putText(frame, f"Hint: {hint}", (10, 50),
                cv2.FONT_HERSHEY_SIMPLEX, 0.5, (200, 200, 200), 1)

    # Status
    msgs = {"VALID": "CORRECT GESTURE - RECORDING",
            "WRONG_POSE": "WRONG POSE - adjust hand",
            "NO_HAND": "NO HAND DETECTED"}
    cv2.putText(frame, msgs.get(status, ""), (10, 90),
                cv2.FONT_HERSHEY_SIMPLEX, 0.6, color, 2)

    # Progress bar
    pct = min(count / max(target, 1), 1.0)
    bar_y = h - 35
    cv2.rectangle(frame, (10, bar_y), (w - 10, bar_y + 20), (50, 50, 50), -1)
    cv2.rectangle(frame, (10, bar_y), (10 + int((w - 20) * pct), bar_y + 20), color, -1)
    cv2.putText(frame, f"{count}/{target}  |  Accuracy: {valid_pct:.0f}%", (10, bar_y - 8),
                cv2.FONT_HERSHEY_SIMPLEX, 0.55, (255, 255, 255), 1)

    cv2.putText(frame, "Press 'q' to skip  |  'ESC' to quit", (10, h - 5),
                cv2.FONT_HERSHEY_SIMPLEX, 0.4, (150, 150, 150), 1)


# ======================================================================
#  CAPTURE ONE SIGN
# ======================================================================

def capture_sign(label, target_frames, hands, face, cap, include_face=True):
    """Capture validated frames for a single sign. Returns (frames_list, quit_signal)."""
    validator = VALIDATORS.get(label)
    hint = SIGN_HINTS.get(label, "Show the gesture clearly")

    print(f"\n  Recording: {label}  ({target_frames} frames)")
    print(f"  Hint: {hint}")
    print(f"  Green = recording | Orange = wrong pose | Red = no hand\n")

    frames = []
    total_checked = valid_count = 0

    mode_text = "Hand + Face" if include_face else "Hand Only"

    while len(frames) < target_frames:
        ret, img = cap.read()
        if not ret:
            break

        rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
        mp_img = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)
        hand_res = hands.detect(mp_img)
        face_res = face.detect(mp_img) if include_face and face else None

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
        draw_hud(
            img,
            label,
            len(frames),
            target_frames,
            status,
            hint,
            valid_pct,
            mode_text,
        )
        cv2.imshow("SignLang Capture", img)

        if status == "VALID":
            vec = extract_vector(hand_res, face_res, include_face=include_face)
            frames.append(
                {
                    "timestamp": time.time(),
                    "label": label,
                    "vector": vec.tolist(),
                    "capture_mode": "hand_only" if not include_face else "hand_face",
                }
            )

        key = cv2.waitKey(1) & 0xFF
        if key == ord("q"):
            print(f"  Skipped (captured {len(frames)}/{target_frames})")
            break
        if key == 27:
            return frames, True

    return frames, False


def save_frames(label, frames):
    """Save captured frames to JSONL."""
    if not frames:
        return
    out_path = os.path.join(DATA_RAW_DIR, f"data_{label}.jsonl")
    with open(out_path, "w", encoding="utf-8") as f:
        for row in frames:
            f.write(json.dumps(row) + "\n")
    print(f"  Saved {len(frames)} frames -> data_{label}.jsonl")


# ======================================================================
#  INTERACTIVE MENU
# ======================================================================

def pick_label():
    """Show interactive menu to pick a sign."""
    names = sorted(SIGNS.keys())
    print("\n  Select a sign to capture:")
    for i, name in enumerate(names, 1):
        emoji = SIGNS[name].get("emoji", "")
        data_file = os.path.join(DATA_RAW_DIR, f"data_{name}.jsonl")
        status = ""
        if os.path.exists(data_file):
            with open(data_file, encoding="utf-8") as f:
                count = sum(1 for _ in f)
            status = f"  ({count} frames captured)"
        print(f"    {i}. {emoji} {name}{status}")
    print(f"    0. EXIT\n")

    while True:
        try:
            choice = int(input("  Enter number: "))
        except ValueError:
            continue
        if choice == 0:
            return None
        if 1 <= choice <= len(names):
            return names[choice - 1]


# ======================================================================
#  MAIN
# ======================================================================

def main():
    parser = argparse.ArgumentParser(description="Capture sign language training data")
    parser.add_argument("--label", type=str, help="Sign name to capture")
    parser.add_argument("--frames", type=int, default=CAP_CFG["target_frames"],
                        help=f"Frames per sign (default: {CAP_CFG['target_frames']})")
    parser.add_argument("--all", action="store_true", help="Capture ALL signs sequentially")
    parser.add_argument("--skip", nargs="*", default=[], help="Signs to skip (with --all)")
    parser.add_argument(
        "--hand-only",
        action="store_true",
        help="Capture only hand landmarks (face vector is zero-padded).",
    )
    args = parser.parse_args()

    if not SIGNS:
        print("\n  No signs configured! Add signs first:")
        print("  python manage_signs.py add \"Hello\" \"👋\"\n")
        return

    include_face = not args.hand_only
    print(
        "\n  Capture mode:",
        "HAND ONLY (faster, no face detector)" if not include_face else "HAND + FACE",
    )

    hands, face = create_detectors(use_face=include_face)
    cap = cv2.VideoCapture(CAP_CFG["camera_index"])
    if not cap.isOpened():
        print("ERROR: Cannot open camera!")
        return

    try:
        if args.all:
            # Capture ALL signs
            skip_set = set(args.skip)
            sign_names = sorted(SIGNS.keys())
            print(f"\n  Capturing {len(sign_names) - len(skip_set)} signs, {args.frames} frames each\n")

            results = {}
            for i, name in enumerate(sign_names):
                if name in skip_set:
                    print(f"  [{i+1}/{len(sign_names)}] SKIP: {name}")
                    continue

                # Countdown
                for sec in range(3, 0, -1):
                    ret, img = cap.read()
                    if ret:
                        h, w = img.shape[:2]
                        cv2.rectangle(img, (0, 0), (w, h), (0, 0, 0), -1)
                        emoji = SIGNS[name].get("emoji", "")
                        cv2.putText(img, f"Next: {name}  {emoji}", (w//2 - 150, h//2 - 30),
                                    cv2.FONT_HERSHEY_SIMPLEX, 1.0, (255, 255, 255), 2)
                        hint = SIGN_HINTS.get(name, "Show the gesture")
                        cv2.putText(img, hint, (w//2 - 180, h//2 + 10),
                                    cv2.FONT_HERSHEY_SIMPLEX, 0.5, (200, 200, 200), 1)
                        cv2.putText(img, f"Starting in {sec}...", (w//2 - 80, h//2 + 50),
                                    cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 255), 2)
                        cv2.imshow("SignLang Capture", img)
                        cv2.waitKey(1000)

                print(f"\n  [{i+1}/{len(sign_names)}] {SIGNS[name].get('emoji', '')} {name}")
                frames, quit_all = capture_sign(
                    name,
                    args.frames,
                    hands,
                    face,
                    cap,
                    include_face=include_face,
                )
                save_frames(name, frames)
                results[name] = len(frames)
                if quit_all:
                    break

            # Summary
            print("\n  " + "=" * 50)
            print("  CAPTURE SUMMARY")
            print("  " + "=" * 50)
            total = 0
            for name in sign_names:
                if name in skip_set:
                    continue
                c = results.get(name, 0)
                print(f"  {SIGNS[name].get('emoji', '')} {name:<15} {c:>5} frames")
                total += c
            print(f"\n  Total: {total} frames")
            print("  " + "=" * 50)

        elif args.label:
            # Single sign capture
            if args.label not in SIGNS:
                print(f"\n  Sign \"{args.label}\" not in config. Available: {', '.join(sorted(SIGNS.keys()))}\n")
                return
            frames, _ = capture_sign(
                args.label,
                args.frames,
                hands,
                face,
                cap,
                include_face=include_face,
            )
            save_frames(args.label, frames)

        else:
            # Interactive menu
            while True:
                label = pick_label()
                if label is None:
                    break
                frames, quit_all = capture_sign(
                    label,
                    args.frames,
                    hands,
                    face,
                    cap,
                    include_face=include_face,
                )
                save_frames(label, frames)
                if quit_all:
                    break

    finally:
        hands.close()
        if face:
            face.close()
        cap.release()
        cv2.destroyAllWindows()

    print("\n  Next step: python train.py")


if __name__ == "__main__":
    main()
