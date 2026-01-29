"""
NORMALIZE FUNCTION: Standardize landmark vectors for consistent model input
PURPOSE: Ensure all landmarks are centered, scaled, and aligned for better predictions
"""

import numpy as np

def normalize_vector(vec):
    """
    Normalize a landmark vector by centering and scaling
    
    INPUT:
      vec: Flattened array of shape (1530,)
           - First 126 values: 42 hand points * 3 coordinates (x, y, z)
           - Next 1404 values: 468 face points * 3 coordinates (x, y, z)
    
    PROCESS:
      1. Reshape to (510, 3) - each row is one [x, y, z] point
      2. Split into hand (first 42) and face (remaining 468)
      3. Choose reference point: mean of face (if visible) or hand
      4. Center: Subtract reference point from all x,y coordinates
      5. Scale: Divide by standard deviation to normalize magnitude
    
    OUTPUT:
      Normalized flattened array (1530,) ready for model input
    
    WHY normalize?
      - Handles different hand positions/sizes in frame
      - Makes model predictions consistent regardless of hand distance/angle
      - Improves training stability and generalization
    """

    # Reshape from 1D (1530,) to 2D (510, 3)
    # Each row = [x, y, z] coordinates of one landmark point
    pts = vec.reshape(-1, 3)  # (510, 3)

    # ============ SPLIT LANDMARKS ============
    # Hand: First 42 points (21 per hand * 2 hands) = 126 values
    hand_pts = pts[:42]
    # Face: Remaining 468 points = 1404 values
    face_pts = pts[42:]

    # ============ FIND REFERENCE POINT (CENTER) ============
    # Choose reference: face center if face visible, else hand center
    if np.any(face_pts):                    # If face landmarks exist
        ref = np.mean(face_pts, axis=0)    # Average all face points
    else:                                   # Fallback to hand centroid
        ref = np.mean(hand_pts, axis=0)    # Average all hand points

    # ============ CENTER: TRANSLATE TO ORIGIN ============
    # Subtract reference point from x,y (keep z unchanged)
    pts[:, :2] -= ref[:2]

    # ============ SCALE: NORMALIZE MAGNITUDE ============
    # Calculate standard deviation of x,y coordinates
    std = np.std(pts[:, :2])
    # If std is very small, skip scaling (avoid division by zero)
    if std > 1e-6:
        pts[:, :2] /= std  # Divide by std to normalize magnitude

    # ============ RETURN FLATTENED ARRAY ============
    # Flatten back to 1D and convert to float32 for model
    return pts.flatten().astype(np.float32)
