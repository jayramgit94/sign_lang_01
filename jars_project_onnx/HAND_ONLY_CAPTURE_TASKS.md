# Hand-Only Capture Task Plan (jars_project_onnx)

## Goal
Add a reliable option to capture only hand-sign data (without face landmarks), keep vector compatibility with existing model pipeline, and provide a practical test checklist.

## What Is Implemented
- Added `--hand-only` mode in [capture.py](capture.py).
- Added `--hand-only` mode in [save_landmarks.py](save_landmarks.py).
- Kept vector size fixed at `1530` for compatibility:
  - Hand points are captured as usual.
  - Face points are zero-padded in hand-only mode.
- Optimized capture initialization:
  - Face model is no longer loaded/downloaded in hand-only mode (faster startup and less resource usage).
- Added capture metadata in output rows from [capture.py](capture.py):
  - `capture_mode: hand_only` or `capture_mode: hand_face`.

## Why This Design
- Existing server/model pipeline expects 1530 features.
- Keeping fixed dimensionality avoids breaking [server.py](server.py), [train.py](train.py), and ONNX inference.
- Hand-only mode improves speed and lowers noise when face landmarks are not needed.

## Commands
- Simplest access (interactive menu):
```bash
python workflow.py
```

- Windows quick launcher:
```bat
workflow.bat
```

- Show capture options:
```bash
python capture.py --help
```

- Capture one sign in hand-only mode:
```bash
python capture.py --label Hello --frames 800 --hand-only
```

- Capture all signs in hand-only mode:
```bash
python capture.py --all --frames 600 --hand-only
```

- Legacy script hand-only capture:
```bash
python save_landmarks.py --hand-only
```

- Train after capture:
```bash
python train.py --algorithm mlp
```

- Run inference server:
```bash
python server.py
```

## Simple Access Layer
- Core files remain separate and clean:
  - [capture.py](capture.py)
  - [train.py](train.py)
  - [server.py](server.py)
- Easy access wrappers added:
  - [workflow.py](workflow.py) (single Python entrypoint)
  - [workflow.bat](workflow.bat) (double-click/menu on Windows)

## Validation Checklist
- [ ] `python -m py_compile capture.py save_landmarks.py` passes.
- [ ] `python capture.py --help` shows `--hand-only`.
- [ ] In hand-only mode, recording starts without loading face detector.
- [ ] Output JSONL rows include `capture_mode: hand_only`.
- [ ] Recorded vectors remain length `1530`.
- [ ] Retraining finishes and updates [classes.json](classes.json).
- [ ] `python server.py` serves predictions without vector shape errors.

## Suggested Data Collection Protocol (for better quality)
- Capture each sign with 3 conditions:
  - Normal speed
  - Slow speed
  - Fast speed
- Capture each sign at 3 distances:
  - Near camera
  - Mid distance
  - Far distance
- Capture left/right orientation variations.
- Target at least 500-800 validated frames per sign.

## Professional ML Improvements (Next)
- Add strict label canonicalization before training (prevent name mismatches like `fuck you!` vs `Fuck You`).
- Add dataset quality report (class balance, missing files, duplicate ratio).
- Add unknown/reject threshold in [server.py](server.py) for low-confidence predictions.
- Add temporal smoothing model (short sequence model) for dynamic sign stability.
- Make [train.py](train.py) the single official trainer and deprecate duplicate legacy trainer.

## Quick Rollback Plan
If hand-only data causes quality drop for some signs:
1. Re-capture those signs with default (hand+face) mode.
2. Merge datasets.
3. Retrain and compare per-class accuracy.

## Current Status
- Hand-only capture feature is implemented and CLI-verified.
- Syntax validation completed for updated scripts.
