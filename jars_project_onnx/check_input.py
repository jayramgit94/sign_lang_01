import os
import onnxruntime as ort

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
MODEL_PATH = os.path.join(BASE_DIR, "model", "model.onnx")

session = ort.InferenceSession(MODEL_PATH)
print("Model Input Shape:", session.get_inputs()[0].shape)
