"""
TRAIN — Preprocess data, augment, train model, and export to ONNX.

This single file handles the FULL pipeline:
  1. Load raw JSONL data
  2. Normalize and augment
  3. Train with chosen algorithm
  4. Evaluate and export to ONNX

Usage:
  python train.py                       # Train with defaults from config.json
  python train.py --algorithm mlp       # Standard MLP (fast, good baseline)
  python train.py --algorithm deep_mlp  # Deeper MLP with residual connections
  python train.py --algorithm cnn1d     # 1D CNN (best for spatial patterns)
  python train.py --algorithm ensemble  # Train all 3 and pick best
  python train.py --epochs 80           # Custom epoch count
  python train.py --augment 5           # 5x data augmentation
  python train.py --no-augment          # Disable augmentation
  python train.py --lr 0.0005           # Custom learning rate
"""

import argparse
import json
import os
import sys
import time
from glob import glob

import numpy as np
import torch
import torch.nn as nn
from torch.utils.data import TensorDataset, DataLoader
from sklearn.model_selection import train_test_split
from sklearn.utils.class_weight import compute_class_weight
import onnx

# ============ PATHS ============
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
# Support running from model/ or project root
if os.path.basename(BASE_DIR) == "model":
    PROJECT_DIR = os.path.dirname(BASE_DIR)
else:
    PROJECT_DIR = BASE_DIR

CONFIG_PATH = os.path.join(PROJECT_DIR, "config.json")
RAW_DIR = os.path.join(PROJECT_DIR, "data_raw")
PROC_DIR = os.path.join(PROJECT_DIR, "data_processed")
MODEL_DIR = os.path.join(PROJECT_DIR, "model")
CLASSES_PATH = os.path.join(PROJECT_DIR, "classes.json")

os.makedirs(PROC_DIR, exist_ok=True)
os.makedirs(MODEL_DIR, exist_ok=True)

# ============ LOAD CONFIG ============
with open(CONFIG_PATH, encoding="utf-8") as f:
    CFG = json.load(f)
T_CFG = CFG["training"]


# ======================================================================
#  STEP 1: NORMALIZATION
# ======================================================================

def normalize_vector(vec):
    """Center and scale landmark vector for consistent model input."""
    arr = np.asarray(vec, dtype=np.float32)
    if arr.size == 0:
        return arr
    pts = arr.reshape(-1, 3)
    hand_pts = pts[:42]
    face_pts = pts[42:]

    ref = np.mean(face_pts, axis=0) if np.any(face_pts) else np.mean(hand_pts, axis=0)
    pts[:, :2] -= ref[:2]
    std = np.std(pts[:, :2])
    if std > 1e-6:
        pts[:, :2] /= std
    return pts.flatten().astype(np.float32)


# ======================================================================
#  STEP 2: AUGMENTATION
# ======================================================================

def augment(vec, factor=3):
    """Generate augmented versions of a landmark vector.
    
    Techniques:
      - Gaussian noise on x,y coordinates (simulates hand jitter)
      - Random scale (simulates distance variation)
      - Random rotation (simulates wrist angle changes)
    """
    augmented = []
    pts = vec.reshape(-1, 3)

    for i in range(factor):
        aug = pts.copy()
        # Gaussian noise (σ=0.02 on x,y)
        noise = np.random.normal(0, 0.02, aug[:, :2].shape).astype(np.float32)
        aug[:, :2] += noise

        # Random scale 0.93–1.07
        scale = np.random.uniform(0.93, 1.07)
        aug[:, :2] *= scale

        # Small rotation on x,y (±5 degrees)
        if i % 2 == 0:
            angle = np.random.uniform(-0.087, 0.087)  # ±5 deg in radians
            cos_a, sin_a = np.cos(angle), np.sin(angle)
            x = aug[:, 0] * cos_a - aug[:, 1] * sin_a
            y = aug[:, 0] * sin_a + aug[:, 1] * cos_a
            aug[:, 0] = x
            aug[:, 1] = y

        augmented.append(aug.flatten().astype(np.float32))

    return augmented


# ======================================================================
#  STEP 3: LOAD & PREPROCESS DATA
# ======================================================================

def load_data(augment_factor=3):
    """Load raw JSONL files, normalize, augment, and return X, y, classes."""
    X, y = [], []
    classes = {}

    files = sorted(glob(os.path.join(RAW_DIR, "*.jsonl")))
    if not files:
        print("\n  ERROR: No .jsonl files found in data_raw/")
        print("  Run: python capture.py --all\n")
        sys.exit(1)

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

                # Original
                X.append(vec)
                y.append(classes[label])
                count += 1

                # Augmented copies
                if augment_factor > 0:
                    for aug_vec in augment(vec, augment_factor):
                        X.append(aug_vec)
                        y.append(classes[label])

        total = count * (1 + augment_factor) if augment_factor > 0 else count
        print(f"    {os.path.basename(file)}: {count} raw -> {total} total")

    X = np.stack(X)
    y = np.array(y, dtype=np.int64)

    # Save processed data
    np.save(os.path.join(PROC_DIR, "X.npy"), X)
    np.save(os.path.join(PROC_DIR, "y.npy"), y)
    with open(CLASSES_PATH, "w", encoding="utf-8") as f:
        json.dump(classes, f, indent=2, ensure_ascii=False)

    print(f"\n  Dataset: {X.shape[0]} samples, {X.shape[1]} features, {len(classes)} classes")
    for name, idx in sorted(classes.items(), key=lambda x: x[1]):
        n = np.sum(y == idx)
        print(f"    [{idx}] {name}: {n} samples")

    return X, y, classes


# ======================================================================
#  STEP 4: MODEL ARCHITECTURES
# ======================================================================

class SignMLP(nn.Module):
    """Standard MLP with BatchNorm and Dropout."""
    def __init__(self, in_features, num_classes, hidden=None, dropout=0.3):
        super().__init__()
        hidden = hidden or [512, 256]
        layers = []
        prev = in_features
        for h in hidden:
            layers += [nn.Linear(prev, h), nn.BatchNorm1d(h), nn.ReLU(), nn.Dropout(dropout)]
            prev = h
        layers.append(nn.Linear(prev, num_classes))
        self.net = nn.Sequential(*layers)

    def forward(self, x):
        return self.net(x)


class DeepMLP(nn.Module):
    """Deeper MLP with residual connections for better gradient flow."""
    def __init__(self, in_features, num_classes, dropout=0.3):
        super().__init__()
        self.input_proj = nn.Sequential(nn.Linear(in_features, 512), nn.BatchNorm1d(512), nn.ReLU())

        # Residual block 1
        self.res1 = nn.Sequential(
            nn.Linear(512, 512), nn.BatchNorm1d(512), nn.ReLU(), nn.Dropout(dropout),
            nn.Linear(512, 512), nn.BatchNorm1d(512),
        )
        # Residual block 2
        self.res2 = nn.Sequential(
            nn.Linear(512, 256), nn.BatchNorm1d(256), nn.ReLU(), nn.Dropout(dropout),
            nn.Linear(256, 256), nn.BatchNorm1d(256),
        )
        self.downsample = nn.Linear(512, 256)

        self.head = nn.Sequential(
            nn.ReLU(), nn.Dropout(dropout),
            nn.Linear(256, 128), nn.ReLU(),
            nn.Linear(128, num_classes),
        )

    def forward(self, x):
        x = self.input_proj(x)
        x = torch.relu(self.res1(x) + x)           # Residual connection
        x = torch.relu(self.res2(x) + self.downsample(x))  # Residual with projection
        return self.head(x)


class Conv1DNet(nn.Module):
    """1D Convolutional network treating landmarks as a spatial sequence."""
    def __init__(self, in_features, num_classes, dropout=0.3):
        super().__init__()
        # Reshape 1530 -> (510, 3) channels-first -> (3, 510)
        self.conv = nn.Sequential(
            nn.Conv1d(3, 64, kernel_size=7, padding=3), nn.BatchNorm1d(64), nn.ReLU(),
            nn.MaxPool1d(2),
            nn.Conv1d(64, 128, kernel_size=5, padding=2), nn.BatchNorm1d(128), nn.ReLU(),
            nn.MaxPool1d(2),
            nn.Conv1d(128, 256, kernel_size=3, padding=1), nn.BatchNorm1d(256), nn.ReLU(),
            nn.AdaptiveAvgPool1d(1),
        )
        self.head = nn.Sequential(
            nn.Flatten(),
            nn.Dropout(dropout),
            nn.Linear(256, 128), nn.ReLU(),
            nn.Linear(128, num_classes),
        )

    def forward(self, x):
        # x: (batch, 1530) -> (batch, 510, 3) -> (batch, 3, 510)
        x = x.view(x.size(0), -1, 3).permute(0, 2, 1)
        x = self.conv(x)
        return self.head(x)


ALGORITHMS = {
    "mlp": SignMLP,
    "deep_mlp": DeepMLP,
    "cnn1d": Conv1DNet,
}


# ======================================================================
#  STEP 5: TRAINING ENGINE
# ======================================================================

def train_model(X, y, classes, algorithm="mlp", epochs=50, batch_size=64,
                lr=0.001, patience=10, dropout=0.3, hidden=None, weight_decay=1e-4):
    """Train a model with early stopping, LR scheduling, and class weighting."""
    num_features = X.shape[1]
    num_classes = len(classes)

    # Stratified split
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=42, stratify=y
    )

    X_train = torch.tensor(X_train, dtype=torch.float32)
    X_test = torch.tensor(X_test, dtype=torch.float32)
    y_train = torch.tensor(y_train, dtype=torch.long)
    y_test = torch.tensor(y_test, dtype=torch.long)

    train_loader = DataLoader(TensorDataset(X_train, y_train), batch_size=batch_size, shuffle=True)
    test_loader = DataLoader(TensorDataset(X_test, y_test), batch_size=batch_size)

    # Class weights for imbalanced data
    cw = compute_class_weight("balanced", classes=np.unique(y), y=y)
    class_weights = torch.tensor(cw, dtype=torch.float32)

    # Build model
    ModelClass = ALGORITHMS[algorithm]
    if algorithm == "mlp":
        model = ModelClass(num_features, num_classes, hidden=hidden, dropout=dropout)
    else:
        model = ModelClass(num_features, num_classes, dropout=dropout)

    param_count = sum(p.numel() for p in model.parameters())
    print(f"\n  Model: {algorithm.upper()} ({param_count:,} parameters)")

    loss_fn = nn.CrossEntropyLoss(weight=class_weights)
    optimizer = torch.optim.AdamW(model.parameters(), lr=lr, weight_decay=weight_decay)
    scheduler = torch.optim.lr_scheduler.ReduceLROnPlateau(optimizer, patience=patience//2, factor=0.5, verbose=False)

    # Training loop with early stopping
    best_acc = 0.0
    best_loss = float("inf")
    best_state = None
    no_improve = 0

    print(f"  Epochs: {epochs} | Batch: {batch_size} | LR: {lr} | Patience: {patience}")
    print(f"  {'Epoch':>6} {'Train Loss':>12} {'Val Loss':>10} {'Val Acc':>9} {'LR':>10}")
    print("  " + "-" * 52)

    for epoch in range(1, epochs + 1):
        # Train
        model.train()
        train_loss = 0
        for xb, yb in train_loader:
            optimizer.zero_grad()
            loss = loss_fn(model(xb), yb)
            loss.backward()
            optimizer.step()
            train_loss += loss.item()

        # Validate
        model.eval()
        val_loss = 0
        correct = 0
        total = 0
        with torch.no_grad():
            for xb, yb in test_loader:
                out = model(xb)
                val_loss += loss_fn(out, yb).item()
                correct += (out.argmax(1) == yb).sum().item()
                total += yb.size(0)

        val_acc = correct / total
        current_lr = optimizer.param_groups[0]["lr"]
        scheduler.step(val_loss)

        print(f"  {epoch:>4}/{epochs} {train_loss:>12.4f} {val_loss:>10.4f} {val_acc:>8.1%} {current_lr:>10.6f}")

        # Early stopping
        if val_acc > best_acc or (val_acc == best_acc and val_loss < best_loss):
            best_acc = val_acc
            best_loss = val_loss
            best_state = {k: v.clone() for k, v in model.state_dict().items()}
            no_improve = 0
        else:
            no_improve += 1
            if no_improve >= patience:
                print(f"\n  Early stopping at epoch {epoch} (no improvement for {patience} epochs)")
                break

    # Reload best weights
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
    print(f"\n  Best Validation Accuracy: {final_acc:.1%}")

    return model, final_acc, num_features


# ======================================================================
#  STEP 6: EXPORT TO ONNX
# ======================================================================

def export_onnx(model, num_features, path=None):
    """Export trained model to ONNX format."""
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

    # Validate
    onnx_model = onnx.load(path)
    onnx.checker.check_model(onnx_model)
    print(f"  Exported & validated: {path}")


# ======================================================================
#  MAIN
# ======================================================================

def main():
    parser = argparse.ArgumentParser(description="Train SignLang AI model")
    parser.add_argument("--algorithm", "-a", choices=list(ALGORITHMS.keys()) + ["ensemble"],
                        default=T_CFG.get("algorithm", "mlp"),
                        help="Training algorithm (default: from config.json)")
    parser.add_argument("--epochs", "-e", type=int, default=T_CFG.get("epochs", 50))
    parser.add_argument("--batch-size", "-b", type=int, default=T_CFG.get("batch_size", 64))
    parser.add_argument("--lr", type=float, default=T_CFG.get("learning_rate", 0.001))
    parser.add_argument("--patience", type=int, default=T_CFG.get("patience", 10))
    parser.add_argument("--dropout", type=float, default=T_CFG.get("dropout", 0.3))
    parser.add_argument("--augment", type=int, default=T_CFG.get("augmentation_factor", 3),
                        help="Augmentation multiplier (0 to disable)")
    parser.add_argument("--no-augment", action="store_true", help="Disable augmentation")
    parser.add_argument("--weight-decay", type=float, default=T_CFG.get("weight_decay", 1e-4))
    args = parser.parse_args()

    aug_factor = 0 if args.no_augment else args.augment

    print("\n" + "=" * 55)
    print("  SIGNLANG AI — TRAINING PIPELINE")
    print("=" * 55)

    # Step 1: Load & preprocess
    start = time.time()
    X, y, classes = load_data(augment_factor=aug_factor)

    if len(classes) < 2:
        print(f"\n  WARNING: Only {len(classes)} class found. Need at least 2 for training.")
        print("  Capture more signs: python capture.py --all\n")

    # Step 2: Train
    if args.algorithm == "ensemble":
        print("\n  === ENSEMBLE MODE: Training all algorithms ===")
        best_model = None
        best_acc = 0
        best_algo = None
        best_features = None

        for algo in ALGORITHMS:
            print(f"\n  --- Training {algo.upper()} ---")
            model, acc, nf = train_model(
                X, y, classes, algorithm=algo,
                epochs=args.epochs, batch_size=args.batch_size,
                lr=args.lr, patience=args.patience, dropout=args.dropout,
                weight_decay=args.weight_decay,
            )
            if acc > best_acc:
                best_acc = acc
                best_model = model
                best_algo = algo
                best_features = nf

        print(f"\n  ENSEMBLE WINNER: {best_algo.upper()} ({best_acc:.1%} accuracy)")
        model = best_model
        num_features = best_features
    else:
        model, _, num_features = train_model(
            X, y, classes, algorithm=args.algorithm,
            epochs=args.epochs, batch_size=args.batch_size,
            lr=args.lr, patience=args.patience, dropout=args.dropout,
            hidden=T_CFG.get("hidden_layers", [512, 256]),
            weight_decay=args.weight_decay,
        )

    # Step 3: Save & export
    pth_path = os.path.join(MODEL_DIR, "model.pth")
    torch.save(model.state_dict(), pth_path)
    print(f"  Saved PyTorch: {pth_path}")

    export_onnx(model, num_features)

    elapsed = time.time() - start
    print(f"\n  Total time: {elapsed:.1f}s")
    print("=" * 55)
    print("  Done! Start server: python server.py")
    print("=" * 55 + "\n")


if __name__ == "__main__":
    main()
