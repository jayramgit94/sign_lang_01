# jars_project_onnx Guide

A practical handbook for running, training, and maintaining the sign-language module.

## 1) What this project does
This module detects sign gestures from landmarks and returns live predictions.

Pipeline:
1. Camera frame comes from browser.
2. Landmarks are extracted in frontend (hand + optional face).
3. Landmark vector is sent to backend over Socket.IO.
4. Backend runs ONNX model inference.
5. Predicted label + confidence is sent back.
6. Optional sentence builder groups words and applies grammar correction.

## 2) Core files and what they are for
- capture.py: Main data capture tool. Supports hand-only mode.
- save_landmarks.py: Legacy/simple capture script.
- train.py: Main training pipeline (recommended).
- model/train.py: Older training script (legacy baseline).
- server.py: Flask + Socket.IO inference server.
- sentence_builder.py: Buffers predicted words and builds sentences.
- groq_api_secure.py: Safe wrapper around Groq API for sentence correction.
- config.json: Signs list + capture/training/vector settings.
- classes.json: Label-to-index mapping used by inference.
- model/model.onnx: Inference model used by server.
- data_raw/*.jsonl: Raw captured samples.
- data_processed/X.npy, y.npy: Processed arrays for training.
- frontend/script.js: Browser-side UI and WebSocket handling.
- workflow.py: Simple all-in-one launcher (recommended for daily use).
- workflow.bat: Windows one-click launcher.
- test_client.py: Backend smoke test client.
- check_input.py: Quick model shape check.
- render.yaml: Render deployment config.
- requirements-render.txt: Production-only backend dependencies.

## 3) Recommended daily workflow (simple)
Use workflow.py so you do not remember many commands.

Start menu:
1. python workflow.py

Or Windows:
1. run workflow.bat

Direct commands:
1. Capture one sign (hand-only):
   python workflow.py capture --label Hello --frames 800 --hand-only
2. Capture all signs (hand-only):
   python workflow.py capture --all --frames 600 --hand-only
3. Train model:
   python workflow.py train --algorithm mlp
4. Validate ONNX input:
   python workflow.py check
5. Run server:
   python workflow.py server
6. End-to-end one shot:
   python workflow.py full-hand-only --frames 600 --algorithm mlp

## 4) Hand-only mode (new)
Why:
- Faster capture.
- Lower noise if your use case is only hand signs.

How:
- capture.py --hand-only
- save_landmarks.py --hand-only

Important:
- Vector length is still 1530.
- Face section is zero-padded to keep model/server compatibility.

## 5) Training path (recommended)
Use train.py, not model/train.py, for final training.

train.py gives:
- Data normalization.
- Data augmentation.
- Multiple model options (mlp, deep_mlp, cnn1d, ensemble).
- Class weighting.
- Early stopping.
- ONNX export.

Good baseline command:
1. python train.py --algorithm mlp

If data is noisy/unbalanced, try:
1. python train.py --algorithm deep_mlp
2. python train.py --algorithm cnn1d

## 6) Data quality rules (must follow)
1. Keep label names consistent across config.json and data_raw files.
2. Capture similar sample counts for each sign.
3. Record variation:
   - speed (slow/normal/fast)
   - distance (near/mid/far)
   - angle (left/right/front)
4. Re-train after changing labels or adding signs.
5. Re-check classes.json after each training run.

## 7) Run and test checklist
Before training:
1. python -m py_compile capture.py save_landmarks.py train.py server.py
2. python capture.py --help
3. Ensure data_raw has expected files.

After training:
1. python check_input.py
2. Confirm ONNX input shape is [?, 1530].
3. Start server: python server.py
4. Run test client: python test_client.py

Expected:
- prediction event returns label + score.
- no vector length error.

## 8) Local run modes
Mode A: Full local UI + backend
1. python server.py
2. open http://localhost:5000

Mode B: Backend test only
1. python server.py
2. python test_client.py

## 9) Production deployment (Render)
From render.yaml:
- Service root is jars_project_onnx.
- Build uses requirements-render.txt.
- Start command uses gunicorn with eventlet and server:app.

Deploy notes:
1. Set CORS_ORIGINS in Render env.
2. Set GROQ_API_KEY only if sentence correction is needed.
3. For pure inference, Groq key is optional.

## 10) Common issues and fixes
Issue: Wrong or unstable predictions
- Fix: collect more balanced data and retrain.
- Fix: avoid mixed label naming.

Issue: Vector shape error
- Fix: ensure client sends 1530 values.
- Fix: use current capture scripts and retrain.

Issue: Low performance
- Fix: use hand-only capture for hand-sign use cases.
- Fix: reduce frontend send frequency if needed.

Issue: Server starts but no prediction
- Fix: check model/model.onnx exists.
- Fix: run check_input.py.
- Fix: verify classes.json matches last trained model.

## 11) Which script should you use
- New work: workflow.py + capture.py + train.py + server.py
- Legacy/reference only: save_landmarks.py and model/train.py

## 12) Minimal command set to remember
1. python workflow.py
2. python workflow.py full-hand-only --frames 600 --algorithm mlp
3. python workflow.py server
