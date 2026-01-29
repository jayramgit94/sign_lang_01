import onnxruntime as ort

session = ort.InferenceSession("model/model.onnx")
print("Model Input Shape:", session.get_inputs()[0].shape)
