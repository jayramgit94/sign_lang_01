# sign_lang_01

Real‑time video meeting app with Sign‑Language translation. Built with React (Vite), Node/Express + Socket.IO, WebRTC, and a Python ONNX inference server.

## What’s included
- **Frontend**: video call UI, chat, captions, participants, sign‑language toggle.
- **Backend**: signaling + auth + meeting history (MongoDB).
- **Sign‑Language server**: Flask‑SocketIO + ONNX runtime for gesture prediction.

## Prerequisites
- Node.js 18+
- Python 3.10+
- MongoDB (local or Atlas)

## Local setup

### 1) Backend
```bash
cd backend
npm install
cp .env.example .env
# edit .env
npm run dev
```

### 2) Sign‑Language server
```bash
cd "JARS PROJECT ONNX"
python -m venv env
env\Scripts\activate
pip install -r requirements.txt
python server.py
```

### 3) Frontend
```bash
cd frontend
npm install
cp .env.example .env.local
# edit .env.local
npm run dev
```

Open http://localhost:8000

## Environment variables

### Backend (.env)
```env
PORT=8001
MONGODB_URI=mongodb+srv://...
NODE_ENV=development
FRONTEND_URL=http://localhost:8000
```

### Frontend (.env.local)
```env
VITE_BACKEND_URL=http://localhost:8001
VITE_SIGNLANG_URL=http://localhost:5000

# TURN (recommended for production)
VITE_TURN_URL=turn:your.turn.server:3478
VITE_TURN_USERNAME=your_username
VITE_TURN_CREDENTIAL=your_password
```

## Project structure
```
sign_lang_01/
├── backend/
├── frontend/
├── JARS PROJECT ONNX/
└── README.md
```

## Notes
- Captions are sent over WebRTC data channels (no Socket.IO captions).
- Sign‑language can run while screen sharing (uses a separate camera stream).

## Deploy
- **Frontend**: Vercel
- **Backend**: Render/Railway/Fly/VM (WebSocket‑capable)
- **Sign‑Language server**: Render/Railway/Fly/VM (always‑on for real‑time)

## License
MIT
