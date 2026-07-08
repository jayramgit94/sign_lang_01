# Apna Meet (sign_lang_01) — Full Project Research Brief

> **Purpose:** Give this file to Gemini Pro (or any LLM) for complete project context.  
> **Product names:** sign_lang_01 (repo), Apna Meet (branding), Zoom Clone (legacy docs)  
> **Status:** Production-ready MVP — local dev + Vercel/Render deployment  
> **Last updated:** July 2026

---

## 1. Executive Summary

Apna Meet is a **real-time video conferencing platform** with **built-in sign-language recognition**. It is not just a UI clone — it includes authentication, meeting persistence, security hardening, and a separate ML inference service.

**One-line:** WebRTC carries media peer-to-peer; Socket.IO carries signaling/chat/captions; MongoDB stores users and meetings; Python ONNX classifies hand gestures from browser-extracted landmarks.

**Differentiator:** Sign-language captions inside the call via MediaPipe + ONNX + optional Groq sentence correction — isolated from the meeting backend so ML latency never blocks calls.

---

## 2. System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  BROWSER (React SPA on Vercel)                                  │
│  ├─ WebRTC mesh (P2P video/audio)                               │
│  ├─ Socket.IO → Node backend (signaling, chat, captions)        │
│  ├─ Socket.IO → Python server (landmarks → predictions)         │
│  └─ MediaPipe Holistic (client-side landmark extraction)        │
└────────────┬──────────────────────────────┬─────────────────────┘
             │ REST + Socket.IO             │ Socket.IO (landmarks)
             ▼                              ▼
┌────────────────────────┐    ┌────────────────────────────────┐
│  NODE BACKEND (Render) │    │  PYTHON ML SERVER (Render Docker) │
│  Express 5 + Socket.IO │    │  Flask-SocketIO + ONNX Runtime    │
│  MongoDB Atlas         │    │  Gunicorn + gevent/eventlet       │
└────────────────────────┘    └────────────────────────────────┘
```

### Three-Service Split (Why)

| Service | Why separate |
|---------|--------------|
| React frontend | Static SPA, CDN deploy, no server logic |
| Node backend | Auth, persistence, real-time signaling — I/O bound |
| Python ML | CPU-heavy inference — must not block signaling |

---

## 3. Tech Stack

| Layer | Technologies |
|-------|--------------|
| **Frontend** | React 19, Vite 7, React Router 7, MUI 7, Framer Motion 12, Axios, Socket.IO client, MediaPipe Holistic (CDN) |
| **Backend** | Node.js, Express 5, Socket.IO 4, Mongoose 9, JWT, bcrypt, Zod, Helmet, express-rate-limit |
| **Database** | MongoDB (Atlas in prod) |
| **ML** | Python 3.11, Flask-SocketIO, ONNX Runtime, NumPy, Groq API (optional), MediaPipe (browser) |
| **Deploy** | Vercel (frontend), Render (backend + ML Docker) |

---

## 4. Repository Structure

```
Zoom/
├── frontend/                 # React SPA — meeting UI, WebRTC, sign-lang client
│   ├── src/
│   │   ├── pages/            VideoMeet.jsx, home, landing, auth, history
│   │   ├── components/       video/, chat/, common/
│   │   ├── hooks/            useWebRTC, useChat, useSignLanguage, useAudioLevel
│   │   ├── contexts/         AuthContext
│   │   ├── services/         api.js, socket.js, tokenStore.js
│   │   ├── styles/           tokens.css, videoComponent.module.css
│   │   └── utils/            constants.js, helpers.js, motion.js
│   └── vercel.json           SPA rewrite
│
├── backend/                  # Node API + Socket.IO
│   ├── src/
│   │   ├── app.js            Server bootstrap, shutdown
│   │   ├── config/           index.js, cors.js, db.js
│   │   ├── controllers/      auth, meeting, socket handlers
│   │   ├── middleware/       auth, csrf, rateLimiter, validate, errorHandler
│   │   ├── models/           user.model.js, meeting.model.js
│   │   ├── routes/           auth.routes.js, meeting.routes.js
│   │   ├── services/         jwt, room, audit, email
│   │   └── utils/            clientIp.js
│   └── scripts/              smoke tests (security, socket schema, client IP)
│
├── jars_project_onnx/        # Python ML inference
│   ├── server.py             Flask-SocketIO + ONNX inference
│   ├── train.py              PyTorch → ONNX export
│   ├── sentence_builder.py   Word buffering + Groq correction
│   ├── model/model.onnx      Trained gesture classifier
│   ├── classes.json          14 sign labels
│   ├── Dockerfile            Render production image
│   └── requirements-render.txt
│
├── INTERVIEW_HANDBOOK.md     # Interview prep (100+ Q&A)
├── PROJECT_RESEARCH_BRIEF.md # This file
├── road map.md               # Architecture + interview notes
└── README.md                 # Setup guide
```

---

## 5. Core User Flows

### 5.1 Join Meeting (Guest or Auth)

1. User opens `/abcdef` (6-letter lowercase code)
2. **Lobby:** camera preview, enter display name
3. Click Join → `join-room` socket event
4. Server returns `room-joined` with peers, chat history, limits
5. WebRTC: create `RTCPeerConnection` per peer → offer/answer/ICE via socket
6. Media flows P2P (mesh topology)

### 5.2 Authenticated User End Call

1. PATCH `/api/v1/meetings/:id` with duration, participants, transcript, sign detections
2. `rtcEndCall()` → stop tracks, close peer connections
3. `disconnectSocket()` → navigate `/home`

### 5.3 Sign-Language Pipeline

```
Camera → MediaPipe Holistic (browser)
  → 1530-float vector [hands(126) + face(1404)]
  → throttle (~150ms) → Socket.IO "landmark" → Python server
  → normalize → ONNX inference → softmax → label + confidence
  → if confidence ≥ 0.6: emit "prediction" to client
  → client emits "caption" on meeting socket → broadcast to room
  → SentenceBuilder buffers words → Groq corrects grammar → "corrected_sentence"
```

---

## 6. Frontend Deep Dive

### Routes (`App.jsx`)

| Path | Auth | Purpose |
|------|------|---------|
| `/` | Public | Landing |
| `/auth` | Public | Login/Register |
| `/home` | Protected | Create/join meeting |
| `/history` | Protected | Meeting history |
| `/reset-password`, `/verify-email` | Public | Auth flows |
| `/:url` | Public | Meeting room (6-letter code) |

### Key Hooks

| Hook | Responsibility |
|------|----------------|
| `useWebRTC` | Mesh peer connections, adaptive bitrate, screen share, ICE glare handling |
| `useChat` | Socket chat messages, history hydration, badge count |
| `useSignLanguage` | MediaPipe, landmark send, captions, Groq sentences, server health |
| `useAudioLevel` | Shared AudioContext, speaking detection for speaker view |

### VideoMeet.jsx (Orchestrator)

- Composes all hooks with single shared `socket` instance
- Lobby → active call two-phase flow
- Layout modes: grid / speaker (auto-spotlight loudest remote)
- Pin participant, local PiP when remote pinned
- Mesh warning banner when >12 participants
- Keyboard shortcuts: M/V/C/P/K/L, Esc

### State Management

- **No Redux** — AuthContext + feature hooks + local useState in VideoMeet
- Tokens: in-memory access + localStorage refresh fallback (`apna_meet_rt`)

### Performance

- Gallery pagination: 16 tiles/page when >25 participants
- Adaptive bitrate by peer count + RTT/packet-loss stats every 8s
- React Compiler (babel-plugin-react-compiler)
- `React.memo` on heavy components
- Sign-lang throttling: delta gating, 150ms min interval

---

## 7. Backend Deep Dive

### REST API

**Base:** `/api/v1`

| Endpoint | Method | Auth | Purpose |
|----------|--------|------|---------|
| `/health` | GET | — | Status, DB, room stats, limits |
| `/auth/csrf-token` | GET | CSRF | Bootstrap XSRF token |
| `/auth/register` | POST | Rate limit | Create account |
| `/auth/login` | POST | Rate limit | Login + cookies |
| `/auth/refresh` | POST | CSRF | Rotate tokens |
| `/auth/logout` | POST | Optional | Clear session |
| `/auth/forgot-password` | POST | Rate limit | Reset email |
| `/auth/reset-password` | POST | Rate limit | New password |
| `/auth/me` | GET | Required | Current user |
| `/auth/audit-logs` | GET | Admin | Audit trail |
| `/meetings/stats` | GET | Required | Aggregated stats |
| `/meetings/` | POST/GET | Required | Create/list history |
| `/meetings/:id` | PATCH/DELETE | Required | Update/delete |

### Socket.IO Events

**Client → Server:** `join-room`, `leave-room`, `media-state-update`, `get-room-info`, `chat-message`, `offer`, `answer`, `ice-candidate`, `renegotiate`, `caption`

**Server → Client:** `room-joined`, `user-joined`, `user-left`, `host-changed`, `peer-media-update`, `chat-message`, `offer`, `answer`, `ice-candidate`, `renegotiate`, `caption`, `error`

**Error codes:** `INVALID_PAYLOAD`, `RATE_LIMIT`, `INVALID_PEER`

### Room Service (In-Memory)

- Singleton `roomService` with Maps: rooms, socketToRoom, socketToUser
- Auto-create room on first join (joiner = host)
- Host transfer on explicit leave
- Max participants: 50 (config), mesh recommended: 12
- Chat history: last 100 messages in memory
- **Limitation:** Lost on server restart; not shared across instances

### Auth Security

- JWT access (15 min) + refresh (7 days) in httpOnly cookies
- Refresh token stored in MongoDB — rotation detects reuse
- CSRF: double-submit cookie + HMAC-signed token on auth routes
- Account lockout: 5 failures → 30 min
- bcrypt 12 rounds
- Chat sender always from `socket.username` (spoofing fix)

### Validation

- HTTP: Zod schemas via `validate()` middleware
- Socket: Zod in `schemas.js` for every event
- Room code: `^[a-z]{6}$`
- SDP cap: 50KB; ICE candidate cap: 10KB

---

## 8. Database Schemas (MongoDB)

### User

```
name, username (unique), email (optional unique), password (bcrypt)
refreshToken, role (user|admin)
emailVerified, emailVerificationToken, emailVerificationExpires
passwordResetToken, passwordResetExpires
loginAttempts, lockUntil, lastLoginAt, lastLoginIP
```

### Meeting

```
user_id (ref User), meetingCode, title
date, endedAt, duration (seconds)
participants: [String]
chatMessageCount, signDetections: [{label, count}]
chatTranscript: [{sender, text, timestamp}]
meetingSummary (auto-generated on PATCH)
starred: Boolean
Index: { user_id: 1, date: -1 }
```

---

## 9. ML / Sign-Language Service

### Model

- **Input:** 1530 floats (normalized landmarks)
- **Architecture:** MLP 1530 → 512 → 256 → num_classes → Softmax
- **Classes (14):** Hello, Yes, No, Thank You, I Love You, Congratulations, How, My, Name, Is, A, B, H, I
- **Training:** `train.py` (PyTorch) → export `model.onnx`
- **Inference:** ONNX Runtime with graph optimizations

### Normalization (`server.py`)

1. Reshape to (510, 3) — each landmark has x,y,z
2. Center on face mean (or hand mean if no face)
3. Scale by standard deviation

### Socket Events (Python Server)

| Event | Direction | Purpose |
|-------|-----------|---------|
| `user_join` | Client → Server | Register session |
| `landmark` | Client → Server | Send 1530-dim vector |
| `prediction` | Server → Client | Label + confidence |
| `corrected_sentence` | Server → Client | Groq-corrected text |
| `slowdown` | Server → Client | Rate-limit backoff |
| `disconnect` | — | Cleanup session |

### Rate Limits (ML Server)

- 20 connections/min/IP
- 120 landmarks/10s/session
- 300ms min interval between landmarks

### Deployment Notes

- Docker on Render (Python 3.11)
- Gunicorn 25.2 + gevent (or eventlet for legacy start command)
- `SOCKETIO_ASYNC_MODE` env: `gevent` or `eventlet`
- Health: `/health`, metrics: `/api/metrics`

---

## 10. Security Summary

| Layer | Measure |
|-------|---------|
| HTTP | Helmet, HTTPS redirect (prod), CORS allowlist |
| Auth | JWT httpOnly cookies, refresh rotation, lockout |
| CSRF | Double-submit on auth routes |
| Rate limit | HTTP (100/15min) + per-socket-event limits |
| Input | Zod on HTTP + socket; sender from socket identity |
| Signaling | Same-room peer validation; payload size caps |
| IP | `clientIp.js` parses x-forwarded-for chains |
| Audit | File-based JSON logs (`backend/logs/audit.log`) |

**Known gaps:** CSRF not on meeting routes; in-memory rate limits don't scale horizontally; mesh WebRTC degrades >12 peers.

---

## 11. Deployment

| Service | Host | Start |
|---------|------|-------|
| Frontend | Vercel | `npm run build` → static `dist/` |
| Backend | Render | `npm start` → `node src/app.js` |
| Sign-lang | Render Docker | `gunicorn -c gunicorn_conf.py server:app` |

### Production URLs (in code defaults)

- Frontend: `https://sign-lang-01.vercel.app`
- Sign-lang: `https://signlang-ai.onrender.com`
- Backend: configure via `VITE_API_URL`

### Env Vars Checklist

| Service | Required |
|---------|----------|
| Backend | `MONGODB_URI`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `FRONTEND_URL`, `PORT` |
| Frontend | `VITE_API_URL`, `VITE_SIGN_LANG_URL` |
| Sign-lang | `CORS_ORIGINS`, `PORT` |
| Optional | `SMTP_*`, `GROQ_API_KEY`, `VITE_TURN_*` |

---

## 12. What Was Built / Recent Work

### UI/UX (Frontend)
- Premium meeting UI: design tokens, floating control bar, Framer Motion
- Speaker view + auto-spotlight via audio levels
- Gallery pagination for 25+ participants
- Pin participant + local PiP
- Mesh performance warning banner (>12 participants)
- Mutual exclusive chat/people panels
- Reduced-motion accessibility support

### Backend Hardening
- Chat sender spoofing fix (server-side identity)
- Zod validation on all socket events
- Per-event socket rate limiting
- Same-room peer validation for WebRTC signaling
- `clientIp.js` for proxy-aware IP parsing
- Graceful shutdown (socket + rooms + MongoDB)
- Room cap 50, mesh recommended 12
- Health endpoint with room stats and limits
- Smoke tests: security, socket schema, client IP

### ML / Deploy
- Render Docker with Python 3.11
- Gunicorn gevent/eventlet dual-mode support
- Landmark rate limiting on client + server
- Groq sentence correction integration

### Auth / Security (Earlier)
- CSRF cross-origin fix for Vercel + Render
- Forgot/reset password with SMTP
- Email verification flow
- Admin audit logs
- Account lockout
- HTTPS enforcement in production

---

## 13. Scalability & Limits

| Aspect | Current | At Scale |
|--------|---------|----------|
| Media | Mesh P2P | SFU (mediasoup/LiveKit) |
| Rooms | In-memory Maps | Redis + Socket.IO adapter |
| Participants | 50 cap, 12 recommended | SFU + TURN servers |
| ML inference | Single Docker instance | Horizontal pool + queue |
| Rate limits | In-memory | Redis distributed |
| DB | Single MongoDB | Read replicas, sharding by user_id |

---

## 14. How To Run & Verify

```bash
# Terminal 1 — Backend
cd backend && npm run dev          # :8001

# Terminal 2 — Sign-language
cd jars_project_onnx && python server.py   # :5000

# Terminal 3 — Frontend
cd frontend && npm run dev         # :8000

# Tests (backend must be running for security test)
cd backend
npm run test:clientip && npm run test:socketschema && npm run test:security

cd frontend && npm run lint && npm run build

cd jars_project_onnx && python scripts/rate_limit_smoke_test.py
```

**Manual test:** Open two browsers → join same 6-letter code → verify video, chat, sign-language toggle.

---

## 15. Key Files Reference

| Concern | File |
|---------|------|
| Server entry | `backend/src/app.js` |
| Socket init | `backend/src/controllers/socket/index.js` |
| WebRTC logic | `frontend/src/hooks/useWebRTC.js` |
| Meeting UI | `frontend/src/pages/VideoMeet.jsx` |
| Sign language | `frontend/src/hooks/useSignLanguage.js` |
| ML inference | `jars_project_onnx/server.py` |
| Auth controller | `backend/src/controllers/auth.controller.js` |
| Room state | `backend/src/services/room.service.js` |
| Config | `backend/src/config/index.js` |
| Constants | `frontend/src/utils/constants.js` |

---

## 16. Interview Sound Bites

- **Architecture:** "Three decoupled services — media on P2P WebRTC, control on Socket.IO, ML isolated in Python."
- **Security:** "httpOnly JWT cookies, CSRF on auth, Zod on every socket event, chat sender from socket identity not client payload."
- **ML:** "MediaPipe extracts landmarks in browser; only 1530 floats sent to server; ONNX classifies on CPU."
- **Tradeoff:** "Mesh WebRTC is zero media-server cost but O(n²) — honest UI warning at 12 participants."
- **Deploy story:** "Fixed Gunicorn 26 removing eventlet worker — pinned versions, Docker, dual async mode."

---

## 17. Related Docs

| File | Purpose |
|------|---------|
| `INTERVIEW_HANDBOOK.md` | 100+ interview Q&A, STAR stories, system design |
| `road map.md` | Detailed architecture decisions + interview prep |
| `PROJECT_WORK_STATUS.md` | Completed vs remaining tasks |
| `README.md` | Quick setup guide |

---

*This brief is generated from actual codebase analysis. Use with INTERVIEW_HANDBOOK.md for interview prep or alone for LLM context.*
