# Data Raw Safety + Accuracy Playbook (Pro ML Guidance)

## 1) Can you delete data_raw?
Short answer: yes for inference-only usage, no for retraining usage.

Decision table:
- If you only want to run existing model for prediction:
  - Safe to delete data_raw.
  - Server will still run with model/model.onnx + classes.json.
- If you want to train/retrain later with train.py:
  - Do not delete data_raw.
  - train.py reads JSONL files from data_raw to rebuild dataset.

Current project behavior:
- Training depends on data_raw in [train.py](train.py).
- If data_raw is missing/empty, training exits with error.
- Inference uses model and classes in [server.py](server.py).

Recommended safe approach:
1. Do not hard-delete first.
2. Archive raw data to external backup (zip or cloud).
3. Keep at least one full raw snapshot per trained model version.

## 2) If storage is low (best strategy)
Use this policy:
1. Keep latest stable raw snapshot.
2. Keep one previous raw snapshot.
3. Remove old intermediate raw snapshots only.

Folder policy:
- Keep:
  - data_raw (latest working)
  - model/model.onnx
  - classes.json
  - config.json
- Optional to remove (if already backed up):
  - very old data_raw files not used by current label set

## 3) Highest-impact accuracy improvements (priority order)

### Priority 1: Fix label consistency
Why:
- Label mismatch kills accuracy faster than model architecture issues.

Actions:
1. Ensure config.json sign names match data_raw labels exactly.
2. Remove renamed duplicates (example style mismatch: special chars/case).
3. Retrain only after label set is clean.

### Priority 2: Balance samples across classes
Why:
- Imbalanced classes bias the model.

Target:
- Minimum 600-800 frames per sign.
- Ratio of smallest class to largest class >= 0.7.

Actions:
1. Find low-count classes.
2. Capture more on low-count classes only.
3. Retrain.

### Priority 3: Improve capture quality diversity
Why:
- Model must generalize to real users and environments.

Capture per sign in at least 9 combinations:
- Speed: slow, normal, fast
- Distance: near, mid, far
- Orientation: left angle, front, right angle

Add variation:
- Different lighting (bright/medium/dim)
- Different background complexity
- Left and right hand usage

### Priority 4: Use hand-only mode when face is not needed
Why:
- Reduces irrelevant noise and speeds collection.

How:
- Use [capture.py](capture.py) with --hand-only.
- Face section remains zero-padded for compatibility.

### Priority 5: Train with architecture sweep and choose best
Why:
- Different datasets behave better with different architectures.

Actions:
1. Train mlp baseline.
2. Train deep_mlp.
3. Train cnn1d.
4. Compare validation metrics and choose best.

### Priority 6: Introduce reject threshold in inference
Why:
- Low-confidence forced predictions create false positives.

Actions:
1. Add confidence threshold in server response logic.
2. If score below threshold, return Unknown.
3. Tune threshold using validation set.

## 4) Practical weekly improvement loop
1. Capture new data for weak classes only.
2. Train 2-3 model variants.
3. Evaluate confusion matrix.
4. Update threshold and test live.
5. Freeze best model and archive raw snapshot.

## 5) Metrics you should track every run
Track and store in one log per model version:
- overall accuracy
- macro F1
- per-class recall
- confusion matrix
- class sample counts
- capture mode ratio (hand_only vs hand_face)

## 6) Minimal command workflow
1. Capture hand-only all signs:
   python workflow.py capture --all --frames 600 --hand-only
2. Train baseline:
   python workflow.py train --algorithm mlp
3. Validate model shape:
   python workflow.py check
4. Run server:
   python workflow.py server

## 7) Final recommendation
- If you are still actively improving accuracy: keep data_raw (with backups).
- If your model is frozen and you only need inference: data_raw can be archived/deleted.
- Best professional practice: never keep only model files without at least one matching raw snapshot backup.
