# test_client.py
"""
Usage:
  Local:   python test_client.py
  Render:  python test_client.py https://your-app-name.onrender.com
"""
import os
import sys
import socketio
import numpy as np

# Use command-line arg for URL, default to localhost
SERVER_URL = (
    sys.argv[1]
    if len(sys.argv) > 1
    else f"http://127.0.0.1:{os.environ.get('PORT', '5000')}"
)
print(f"Connecting to: {SERVER_URL}")

sio = socketio.Client()


@sio.event
def connect():
    print("Connected to server!")

    # send a fake vector with 1530 values
    vec = (np.random.rand(1530) - 0.5).tolist()

    print("Sending landmark data (1530 values)...")
    sio.emit("landmark", {"vector": vec, "normalized": False})


@sio.event
def connect_error(msg):
    print("Connection failed!", msg)


@sio.on("prediction")
def on_prediction(data):
    print("Prediction received:", data)
    if "label" in data:
        print(f"  -> Gesture: {data['label']}, Confidence: {data.get('score', 0):.2%}")
    elif "error" in data:
        print(f"  -> Error: {data['error']}")
    sio.disconnect()


@sio.event
def disconnect():
    print("Disconnected")


sio.connect(SERVER_URL, transports=["polling"], wait_timeout=15)

sio.wait()
