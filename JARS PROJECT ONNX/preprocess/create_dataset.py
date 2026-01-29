"""
PREPROCESS SCRIPT: Create dataset from raw landmark data
PURPOSE: Load raw JSONL files, normalize landmarks, create training dataset
INPUT: Raw JSON files with landmarks (data_raw/*.jsonl)
OUTPUT: X.npy (features), y.npy (labels), classes.json (label mapping)
"""

import json
import numpy as np
from glob import glob
import os
from normalize import normalize_vector

# ============ CONFIG ============
# Path pattern to find all raw JSONL files
RAW_PATH = "../data_raw/*.jsonl"

# ============ INITIALIZE STORAGE ============
X = []           # Feature vectors (landmarks)
y = []           # Labels (gesture names mapped to integers)
classes = {}     # Mapping of gesture name to class ID

print("Loading raw data...")

# ============ LOAD RAW DATA ============
# Iterate through all JSONL files in data_raw/
for file in glob(RAW_PATH):
    print(f"Processing {file}...")
    with open(file) as f:
        for line in f:
            # Parse JSON line
            row = json.loads(line)

            # Extract landmark vector from JSON
            # Vector is 1D array of 1530 values (42 hand + 468 face landmarks * 3)
            vec = np.array(row["vector"], dtype=np.float32)
            
            # Normalize landmarks (center, scale) for consistent model input
            vec = normalize_vector(vec)

            # Extract gesture label (e.g., "Hello", "Yes", "No")
            label = row["label"]

            # Create new class ID if this label hasn't been seen before
            if label not in classes:
                classes[label] = len(classes)  # Assign next integer ID

            # Store normalized vector and class ID
            X.append(vec)
            y.append(classes[label])

# ============ CONVERT TO NUMPY ARRAYS ============
# Stack all vectors into single 2D array: (num_samples, 1530)
X = np.stack(X)
# Convert labels to numpy array
y = np.array(y, dtype=np.int64)

# ============ SAVE PROCESSED DATA ============
# Create output directory if it doesn't exist
os.makedirs("../data_processed", exist_ok=True)

# Save feature vectors
np.save("../data_processed/X.npy", X)
# Save labels
np.save("../data_processed/y.npy", y)

# ============ SAVE CLASS MAPPING ============
# Save class label mapping for later reference
with open("../classes.json", "w") as f:
    json.dump(classes, f, indent=2)

print("Saved X.npy, y.npy and classes.json")
print("Dataset size:", X.shape, y.shape)
print("Classes:", classes)
