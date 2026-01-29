# test_client.py
import socketio
import numpy as np

sio = socketio.Client()

@sio.event
def connect():
    print("Client connected to server")

@sio.event
def connect_error(msg):
    print("Connection failed!", msg)

@sio.event
def disconnect():
    print("Client disconnected")


@sio.event
def connect():
    print("Connected to server")

    # send a fake vector with 1530 values
    vec = (np.random.rand(1530) - 0.5).tolist()

    sio.emit("landmark", {
        "vector": vec,
        "normalized": False
    })

@sio.on("prediction")
def on_prediction(data):
    print("Prediction:", data)
    sio.disconnect()

@sio.event
def disconnect():
    print("Disconnected")

sio.connect("http://127.0.0.1:5000", transports=["polling"], wait_timeout=10)

sio.wait()
