# sign_lang_01 (Apna Meet)

Real-time video meeting app with sign-language translation. Built with React (Vite), Node/Express + Socket.IO, WebRTC, and a Python ONNX inference server.

## What's included

- **Frontend**: video call UI, chat, captions, participants, sign-language toggle
- **Backend**: signaling + auth + meeting history (MongoDB)
- **Sign-Language server**: Flask-SocketIO + ONNX runtime for gesture prediction

## Prerequisites

- Node.js 18+
- Python 3.11+ (3.11 recommended for ONNX server)
- MongoDB (local or Atlas)

## Local setup (all 3 services required)

### 1) Backend (port 8001)

```bash
cd backend
npm install
cp .env.example .env
# Edit .env — set MONGODB_URI and JWT secrets
npm run dev
```

### 2) Sign-Language server (port 5000)

```bash
cd jars_project_onnx
python -m venv env
env\Scripts\activate          # Windows
# source env/bin/activate   # macOS/Linux
pip install -r requirements.txt
python server.py
```

### 3) Frontend (port 8000)

```bash
cd frontend
npm install
cp .env.example .env.local
npm run dev
```

Open http://localhost:8000

## Verify everything works

```bash
# Backend (with server running on 8001)
cd backend
npm run test:clientip
npm run test:socketschema
npm run test:security

# Frontend
cd frontend
npm run lint
npm run build

# Sign-language server
cd jars_project_onnx
python scripts/rate_limit_smoke_test.py
```

## Environment variables

### Backend (`.env`)

```env
PORT=8001
MONGODB_URI=mongodb+srv://...
NODE_ENV=development
FRONTEND_URL=http://localhost:8000
JWT_ACCESS_SECRET=...
JWT_REFRESH_SECRET=...
```

### Frontend (`.env.local`)

```env
VITE_API_URL=http://localhost:8001
VITE_SIGN_LANG_URL=http://localhost:5000

# TURN (recommended for production NAT traversal)
# VITE_TURN_URL=turn:your.turn.server:3478
# VITE_TURN_USERNAME=your_username
# VITE_TURN_CREDENTIAL=your_password
```

### Sign-language server

```env
PORT=5000
CORS_ORIGINS=http://localhost:8000
SOCKETIO_ASYNC_MODE=eventlet
# GROQ_API_KEY=optional for sentence correction
```

## Project structure

```
sign_lang_01/
├── frontend/           React 19 + Vite SPA
├── backend/            Express + Socket.IO + MongoDB
├── jars_project_onnx/  Python ONNX inference server
├── INTERVIEW_HANDBOOK.md
├── PROJECT_RESEARCH_BRIEF.md
└── README.md
```

## Notes

- Captions are broadcast via Socket.IO `caption` events (not WebRTC data channels).
- Sign-language uses a separate Socket.IO connection to the Python server.
- Sign-language can run while screen sharing (uses camera stream, not screen track).
- Mesh WebRTC works best with ≤12 participants; UI warns above that limit.

## Deploy

| Service | Platform | Notes |
|---------|----------|-------|
| Frontend | Vercel | Set `VITE_API_URL`, `VITE_SIGN_LANG_URL` |
| Backend | Render | `npm start`, WebSocket-capable, MongoDB Atlas |
| Sign-Language | Render Docker | Use `jars_project_onnx/Dockerfile` |

## License

MIT
