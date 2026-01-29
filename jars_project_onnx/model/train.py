"""
MODEL TRAINING SCRIPT: Train and export gesture recognition model
PURPOSE: Train PyTorch neural network on landmark data and export to ONNX
WORKFLOW:
  1. Load preprocessed features (X.npy) and labels (y.npy)
  2. Split into train/test sets
  3. Train MLP neural network for 30 epochs
  4. Save PyTorch model (.pth)
  5. Export to ONNX format for deployment
"""

import json
import numpy as np
import torch
import torch.nn as nn
from torch.utils.data import TensorDataset, DataLoader
from sklearn.model_selection import train_test_split
import onnx

# ============ LOAD DATASET ============
# Load preprocessed landmark vectors
X = np.load("../data_processed/X.npy")    # shape: (num_samples, 1530) - landmark features
y = np.load("../data_processed/y.npy")    # shape: (num_samples,) - gesture labels (0,1,2,...)

# Get input/output dimensions
num_features = X.shape[1]                  # 1530 (42 hand + 468 face landmarks * 3 coords)

# ============ LOAD CLASS INFORMATION ============
# Load class label mapping (e.g., {0: "Hello", 1: "Yes", ...})
with open("../classes.json") as f:
    classes = json.load(f)
num_classes = len(classes)                 # Number of gesture classes to predict

print(f"Dataset: {X.shape[0]} samples, {num_features} features, {num_classes} classes")

# ============ CONVERT TO PYTORCH TENSORS ============
# Convert numpy arrays to PyTorch tensors
X = torch.tensor(X, dtype=torch.float32)
y = torch.tensor(y, dtype=torch.long)

# ============ TRAIN/TEST SPLIT ============
# Split data: 80% train, 20% test (for validation)
X_train, X_test, y_train, y_test = train_test_split(
    X, y, test_size=0.2, random_state=42
)

# Create PyTorch datasets
train_ds = TensorDataset(X_train, y_train)
test_ds  = TensorDataset(X_test, y_test)

# Create data loaders (batch training for efficiency)
train_loader = DataLoader(train_ds, batch_size=32, shuffle=True)
test_loader  = DataLoader(test_ds, batch_size=32)

# ============ NEURAL NETWORK ARCHITECTURE ============
"""
MLP (Multi-Layer Perceptron) for gesture classification
Architecture:
  Input (1530) -> Hidden1 (512) -> ReLU -> Hidden2 (256) -> ReLU -> Output (num_classes)
  
ReLU: Rectified Linear Unit activation (adds non-linearity)
Final layer outputs logits (raw scores) - softmax applied later
"""
class SignMLP(nn.Module):
    def __init__(self, in_features, num_classes):
        super(SignMLP, self).__init__()
        # Define network layers
        self.net = nn.Sequential(
            # Layer 1: Reduce 1530 features to 512
            nn.Linear(in_features, 512),
            # Activation: ReLU (non-linearity)
            nn.ReLU(),
            # Layer 2: Reduce 512 to 256 features
            nn.Linear(512, 256),
            # Activation: ReLU
            nn.ReLU(),
            # Output layer: 256 features to num_classes (one score per gesture)
            nn.Linear(256, num_classes)
        )

    def forward(self, x):
        # Pass input through network and return predictions (logits)
        return self.net(x)

# ============ INITIALIZE MODEL ============
model = SignMLP(num_features, num_classes)

# ============ TRAINING SETUP ============
# Loss function: Cross Entropy for multi-class classification
loss_fn = nn.CrossEntropyLoss()
# Optimizer: Adam (adaptive learning rate)
optimizer = torch.optim.Adam(model.parameters(), lr=0.001)

# ============ TRAINING LOOP ============
EPOCHS = 30
print("Training started...")

for epoch in range(EPOCHS):
    # Set model to training mode
    model.train()
    total_loss = 0

    # Iterate through batches
    for xb, yb in train_loader:
        # Clear previous gradients
        optimizer.zero_grad()
        
        # Forward pass: compute predictions
        preds = model(xb)
        
        # Compute loss
        loss = loss_fn(preds, yb)
        
        # Backward pass: compute gradients
        loss.backward()
        
        # Update weights
        optimizer.step()
        
        # Accumulate loss for this epoch
        total_loss += loss.item()

    # Print progress
    print(f"Epoch {epoch+1}/{EPOCHS}, Loss: {total_loss:.4f}")

print("Training completed.")

# ============ SAVE PYTORCH MODEL ============
# Save model weights for later use
torch.save(model.state_dict(), "model.pth")
print("Saved model.pth")

# ============ EXPORT TO ONNX ============
"""
ONNX: Open Neural Network Exchange format
- Platform-independent model format
- Can run on CPUs without PyTorch
- Smaller file size, faster inference
- Used in server.py for real-time prediction
"""
# Create dummy input for export (shape: 1 sample, 1530 features)
dummy = torch.randn(1, num_features)

# Export model
torch.onnx.export(
    model,                    # Model to export
    dummy,                    # Dummy input (for shape inference)
    "model.onnx",            # Output file
    input_names=['input'],   # Input node name
    output_names=['output'], # Output node name
    opset_version=11         # ONNX opset version (compatibility)
)

print("Saved model.onnx")
