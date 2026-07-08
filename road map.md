# Apna Meet Interview Prep

## 1. Project Overview

**Problem statement**  
Real-time meetings are fragmented when teams need video, chat, screen sharing, authentication, meeting history, and accessibility features like sign-language support in one place. This project solves that by combining a WebRTC-based meeting experience with persistent auth, meeting records, and a sign-language inference pipeline.

**Target users**  
Remote teams, students, guest users who need quick join links, and users who benefit from sign-language captioning or meeting replay/history.

**Core idea**  
A React frontend talks to an Express/MongoDB backend for auth and meeting persistence, while Socket.IO handles real-time signaling and chat. A separate Python inference service processes video landmarks and returns sign predictions, which are broadcast back into the call.

**30 sec elevator pitch**  
Apna Meet is a real-time video meeting app with guest join, authenticated accounts, chat, meeting history, screen sharing, and sign-language translation. WebRTC carries the media directly between peers, Socket.IO handles signaling and messaging, MongoDB stores user and meeting data, and a Python ONNX service performs gesture inference.

**2 min structured explanation**  
The system is split into three runtime planes: the React client, the Node.js backend, and the Python sign-language service. The frontend creates a WebRTC peer connection for media, uses Socket.IO for signaling, and calls REST endpoints for auth, history, and meeting stats. The backend secures auth with JWT cookies, CSRF, rate limiting, audit logs, and MongoDB models for users and meetings. The Python service uses MediaPipe Holistic to extract landmarks, ONNX Runtime to classify gestures, and a sentence builder plus Groq-based correction for readable captions.

**5 min deep technical explanation**  
The architecture favors low-latency media by keeping audio/video on peer-to-peer WebRTC paths instead of proxying through the server. The server only relays offers, answers, ICE candidates, captions, and room events. Auth is cookie-based with short-lived access tokens and rotated refresh tokens, which reduces token leakage risk and keeps browser support straightforward. CSRF protection is necessary because the app uses cookies across origins; the frontend bootstraps an XSRF token and sends it on mutating requests. Meeting history is persisted separately so the product can generate analytics like total duration, most-used rooms, and sign detections after each call. The sign-language flow is intentionally decoupled from the meeting backend because inference is CPU-heavy and should not block auth or signaling traffic.

## 2. Requirements

### Functional

- Register, login, logout, refresh session.
- Optional email verification.
- Forgot password and reset password flow.
- Guest join with generated meeting codes.
- Video/audio calls with WebRTC.
- Screen sharing.
- Live chat in rooms.
- Meeting history, search, pagination, star/delete, and stats.
- Sign-language recognition with captions and corrected sentences.
- Admin audit-log access.

### Non-Functional

- **Scalability:** signaling and persistence must support more concurrent rooms without media passing through the app server.
- **Performance:** keep media streams peer-to-peer; keep REST endpoints small and indexed; throttle sign inference.
- **Reliability:** retry MongoDB connection, recover sockets, survive auth refresh failures, and degrade gracefully if SMTP or sign-language inference is unavailable.
- **Security:** httpOnly JWT cookies, CSRF defense, rate limiting, helmet, origin allowlists, password hashing, token rotation, and audit logs.

## 3. Tech Stack + Decision Justification

### React + Vite
**What it does:** UI rendering, route management, state orchestration, and call controls. Vite keeps builds fast and dev feedback tight.  
**Why chosen:** It is lightweight, modern, and ideal for a highly interactive client.  
**Alternatives considered:** Next.js, CRA, plain SPA with webpack.  
**Why not alternatives:** Next.js adds SSR complexity that the app does not need; CRA is slower and effectively legacy.  
**Trade-offs:** Fast iteration and simpler deployment, but less built-in server-side structure.  
**100x users check:** Frontend scales fine; the bottleneck is backend signaling and media, not rendering.  
**Interview answer:** “Vite gives us fast builds and a lean SPA. We do not need SSR because the product is app-like, not SEO-driven.”

### React Router
**What it does:** Routes between landing, auth, home, history, reset, verify, and meeting pages.  
**Why chosen:** Simple client-side routing fits the SPA workflow.  
**Alternatives considered:** Reach Router, Next routing.  
**Why not alternatives:** The app already uses a Vite SPA and does not need framework-level routing conventions.  
**Trade-offs:** Simple and explicit, but route guards must be implemented manually.  
**100x users check:** No meaningful routing bottleneck.  
**Interview answer:** “React Router is enough because we are building a client-side meeting app with protected views and URL-based room entry.”

### MUI + Emotion
**What it does:** Component library and styling system for forms, dialogs, cards, and controls.  
**Why chosen:** Fast delivery of polished UI with consistent accessibility defaults.  
**Alternatives considered:** Tailwind, custom CSS only, Chakra UI.  
**Why not alternatives:** Tailwind would need more design system work; custom CSS would slow development; Chakra was not needed because MUI already fits the component-heavy UI.  
**Trade-offs:** Heavier bundle than pure CSS, but faster implementation and stronger consistency.  
**100x users check:** Frontend library choice does not block scale; bundle tuning would matter for mobile.  
**Interview answer:** “MUI let us ship a consistent meeting UI quickly, especially for forms and controls where accessibility matters.”

### Framer Motion
**What it does:** Animates page transitions and call-to-action interactions.  
**Why chosen:** Enhances perceived polish without a large custom animation stack.  
**Alternatives considered:** CSS animations only, GSAP.  
**Why not alternatives:** CSS would be less expressive for route transitions; GSAP is heavier than necessary.  
**Trade-offs:** Better UX, slight runtime cost.  
**100x users check:** Not a backend scale issue; only client performance on low-end devices.  
**Interview answer:** “We use Framer Motion for page transition quality, not core logic. It improves product feel without affecting correctness.”

### Axios
**What it does:** REST client with interceptors for auth, CSRF, refresh, and retries.  
**Why chosen:** Interceptors make token refresh and request hardening straightforward.  
**Alternatives considered:** Fetch API, React Query only.  
**Why not alternatives:** Fetch would require more handwritten plumbing; React Query would still need a transport layer.  
**Trade-offs:** Convenient abstraction, but another dependency.  
**100x users check:** Transport layer is fine; the important part is interceptor correctness and caching policy.  
**Interview answer:** “Axios centralizes auth headers, CSRF bootstrapping, and refresh retries in one place, which is cleaner than scattering fetch calls everywhere.”

### Socket.IO
**What it does:** Real-time signaling, chat, captions, room membership, and presence updates.  
**Why chosen:** WebSocket fallback support and a friendlier API than raw WebSocket management.  
**Alternatives considered:** Native WebSocket, SSE.  
**Why not alternatives:** Raw WebSocket would require more protocol code; SSE is one-way and insufficient for signaling.  
**Trade-offs:** Easier development, but less protocol control than a custom WebSocket stack.  
**100x users check:** Socket.IO scales if stateless signaling is kept thin and rooms are distributed carefully.  
**Interview answer:** “Socket.IO is the control plane for the meeting. It is not carrying media, only lightweight signaling and room events.”

### Express + MongoDB + Mongoose
**What it does:** REST API, security middleware, user/meeting persistence, and aggregation queries.  
**Why chosen:** Good fit for JSON APIs and flexible document storage.  
**Alternatives considered:** Fastify, PostgreSQL.  
**Why not alternatives:** Express is familiar and sufficient; MongoDB fits evolving meeting documents and nested transcripts.  
**Trade-offs:** Schema flexibility is helpful, but complex relational queries are less natural than SQL.  
**100x users check:** It can scale, but meeting stats and search would need indexing and possibly read replicas/caching.  
**Interview answer:** “MongoDB fits the meeting-history shape because transcripts, sign detections, and summaries are nested and evolve over time.”

### JWT + httpOnly cookies + refresh rotation
**What it does:** Authenticates users while reducing token exposure in browser storage.  
**Why chosen:** Cookies are easier for browser session handling, and rotation reduces refresh-token reuse risk.  
**Alternatives considered:** LocalStorage JWTs, server sessions.  
**Why not alternatives:** LocalStorage is more XSS-prone; server sessions complicate cross-origin SPA deployment and scaling.  
**Trade-offs:** Cookie auth needs CSRF protection; sessions need shared state.  
**100x users check:** Scales well if refresh tokens are stored and invalidated correctly.  
**Interview answer:** “We use httpOnly cookies for access and refresh tokens, then rotate refresh tokens so a leaked token cannot be reused indefinitely.”

### CSRF protection
**What it does:** Protects mutating cross-origin requests with a double-submit cookie and signed fallback token.  
**Why chosen:** Cookie-based auth needs CSRF defense, especially because frontend and backend can live on different domains.  
**Alternatives considered:** SameSite only, custom headers only.  
**Why not alternatives:** SameSite alone is brittle across deployment modes; custom headers still need a token source.  
**Trade-offs:** More client plumbing, but stronger request integrity.  
**100x users check:** Works at scale because it is stateless.  
**Interview answer:** “Because auth is cookie-based, CSRF protection is mandatory. The frontend bootstraps a token and sends it on every mutating call.”

### Python Flask-SocketIO + ONNX Runtime + MediaPipe
**What it does:** Receives landmark vectors, runs inference, and emits predictions and corrected sentences.  
**Why chosen:** ML inference is isolated from the Node app, and ONNX Runtime is efficient for CPU inference.  
**Alternatives considered:** TensorFlow serving, in-process Python API, direct browser inference.  
**Why not alternatives:** TensorFlow serving is heavier; in-process ML would couple deployments; browser inference would offload compute but complicate model distribution and consistency.  
**Trade-offs:** Separate service improves isolation but adds deployment and networking complexity.  
**100x users check:** Needs horizontal scaling or a queue if many users enable sign recognition simultaneously.  
**Interview answer:** “We isolate sign-language inference in Python because it is CPU-heavy and should not impact meeting signaling latency.”

## 4. System Design

### HLD

Text diagram:

```text
Browser
  ├─ React UI
  ├─ Axios REST calls
  ├─ Socket.IO client
  ├─ WebRTC peer connection(s)
  └─ MediaPipe capture for sign-language
        │
        ├──────── REST ────────> Express API
        │                         ├─ Auth / Meetings / Stats
        │                         ├─ MongoDB
        │                         ├─ JWT cookies + CSRF
        │                         └─ Audit log file
        │
        ├──────── Socket.IO ───> Signaling server
        │                         ├─ room membership
        │                         ├─ offers / answers / ICE
        │                         └─ chat / captions
        │
        └──────── Socket.IO ───> Python inference service
                                  ├─ MediaPipe landmarks
                                  ├─ ONNX prediction
                                  └─ sentence correction
```

**Component interaction**  
The browser joins a room, exchanges signaling messages with the Node server, and establishes direct peer-to-peer media flows. Auth and history go through REST. The sign-language service is called separately so inference latency does not block the main meeting path.

### LLD

**Modules/classes**  
- Backend config: `config/index.js`, `config/db.js`, `config/cors.js`.
- Auth: `controllers/auth.controller.js`, `middleware/auth.js`, `services/jwt.service.js`, `services/email.service.js`.
- Meetings: `controllers/meeting.controller.js`, `models/meeting.model.js`.
- Real-time: `controllers/socket/*.js`, `services/room.service.js`.
- Frontend app shell: `App.jsx`, `contexts/AuthContext.jsx`, `services/api.js`, `services/socket.js`.
- Video call: `pages/VideoMeet.jsx`, `hooks/useWebRTC.js`, `hooks/useChat.js`, `hooks/useSignLanguage.js`.
- Sign-language backend: `server.py`, `sentence_builder.py`, `groq_api_secure.py`.

**APIs**  
- `POST /api/v1/auth/register`
- `POST /api/v1/auth/login`
- `POST /api/v1/auth/refresh`
- `POST /api/v1/auth/logout`
- `GET /api/v1/auth/me`
- `POST /api/v1/auth/verify-email`
- `POST /api/v1/auth/forgot-password`
- `POST /api/v1/auth/reset-password`
- `GET /api/v1/auth/audit-logs`
- `GET /api/v1/meetings`
- `POST /api/v1/meetings`
- `PATCH /api/v1/meetings/:id`
- `DELETE /api/v1/meetings/:id`
- `GET /api/v1/meetings/stats`

**Database schema**  
- User: name, username, email, password hash, refresh token, role, verification/reset tokens, lockout state, last login metadata.
- Meeting: user reference, meeting code, title, date, duration, participants, chat transcript, sign detections, summary, starred.

## 5. Data Flow

**User → Frontend → Backend → DB → Response**  
1. User submits a form or joins a room.
2. Frontend validates basic fields and ensures CSRF token exists for mutating requests.
3. Axios sends the request with cookies, Authorization header fallback, and XSRF header.
4. Backend middleware checks CORS, rate limits, JWT, and CSRF.
5. Controller validates business rules, reads or writes MongoDB, and may write audit logs.
6. Backend returns a JSON payload and often sets or clears cookies.
7. Frontend stores tokens in its local token store, updates auth state, and navigates or renders the result.

**Validation**  
Zod validators enforce request shape before controller logic runs. This is important because it turns bad inputs into predictable 400-level failures instead of downstream exceptions.

**Processing**  
Auth endpoints handle account lookup, lockout, password checks, token rotation, and email/reset logic. Meeting endpoints sanitize transcripts, aggregate stats, and update only allowed fields.

**Storage**  
MongoDB stores persistent user and meeting records. Audit events are appended to a log file for compliance and operational traceability.

**Retrieval**  
History and stats are fetched using pagination, search, and aggregation. The frontend renders grouped history cards and summary metrics.

## 6. Code Walkthrough

### Backend startup and security

```js
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" },
  contentSecurityPolicy: false,
}));
app.use(cors(corsOptions));
app.use(cookieParser());
app.use(express.json({ limit: "50kb" }));
app.use(generalLimiter);
app.use(auditMiddleware());
```

**Line-by-line reasoning**  
- Helmet hardens default HTTP headers.
- CORS is restricted to known origins instead of `*`.
- Cookies are parsed before auth and CSRF logic.
- JSON payloads are capped to reduce abuse.
- Rate limiting throttles brute force and abuse.
- Audit middleware creates an operational record of user actions.

Why this implementation: security is handled at the edge of request processing, which is the correct place for cheap, consistent defenses.

### JWT auth middleware

```js
const token = req.cookies?.accessToken || bearerToken;
const decoded = verifyAccessToken(token);
if (!decoded) return res.status(401).json({ message: "Invalid or expired token." });
req.user = decoded;
```

**Reasoning**  
The middleware prefers cookies for normal browser sessions and falls back to an Authorization header for cross-origin or special clients. It fails closed if token verification fails.

### Auth register flow

```js
const user = await User.create({ name, username, email: normalizedEmail, password });
const tokens = generateTokenPair(user);
user.refreshToken = tokens.refreshToken;
await user.save();
setTokenCookies(res, tokens.accessToken, tokens.refreshToken);
```

**Reasoning**  
User creation is separated from token generation, then the refresh token is persisted server-side for reuse detection. Cookies are set so the browser can keep the session without storing tokens in JS memory long-term.

### Meeting join and update flow

```js
const meeting = await Meeting.create({
  user_id: req.user.userId,
  meetingCode: sanitized,
});
```

```js
if (!updates.meetingSummary) {
  const merged = { ...existingMeeting, ...updates };
  updates.meetingSummary = buildMeetingSummary(merged);
}
```

**Reasoning**  
A meeting history record is created when the user enters a room, then updated at call end with duration, participants, transcript, and sign detections. Summary generation is server-side so it is consistent and not easily tampered with.

### Frontend auth bootstrap

```js
const res = await api.get("/auth/me");
```

If that fails, the app attempts refresh using a stored refresh token, then retries `me`. This gives the user a smooth session recovery path and avoids unnecessary logouts.

### Video call orchestration

```js
const {
  localStream,
  remoteStreams,
  participantList,
  video,
  audio,
  screen,
  canScreenShare,
  startLocalStream,
  joinRoom,
  endCall,
  toggleVideo,
  toggleAudio,
  toggleScreenShare,
} = useWebRTC({ socket, username });
```

**Reasoning**  
The page is intentionally slim. The hook owns the hard parts: peer connection lifecycle, track replacement, ICE handling, and cleanup. That separation lowers cognitive load and makes the page easier to debug.

### Sign-language flow

```js
const fullVector = handVector.concat(faceVector).slice(0, 1530);
signSocketRef.current.emit("landmark", {
  vector: fullVector,
  normalized: false,
});
```

**Reasoning**  
The hook standardizes landmarks into the exact feature vector the model expects. The backend service predicts a label, and the frontend rebroadcasts it as a caption for peers.

## 7. Advanced Engineering

**Patterns used**  
- Layered architecture: route → middleware → controller → service → model.
- Singleton socket client and server instances.
- Hook-based composition on the frontend.
- Explicit state machines in the call flow: lobby, connected, chatting, screen sharing, sign language enabled.

**Caching / indexing**  
- Meeting index on `{ user_id: 1, date: -1 }` supports history queries.
- CSRF token bootstrapping is cached client-side during a session.
- Socket room membership is in-memory for low-latency access.

**Performance optimizations**  
- WebRTC media is peer-to-peer.
- Screen sharing swaps tracks instead of rebuilding the whole call.
- Sign-language recognition is throttled to about 6-7 fps.
- Meeting queries use pagination and limited search lengths.
- Signaling payloads are small and bounded.

**Security practices**  
- HttpOnly cookies for tokens.
- Refresh token rotation and reuse detection.
- CSRF protection for mutating requests.
- CORS origin allowlist.
- Rate limiting on auth and API routes.
- Password hashing with bcrypt.
- Audit logging for sensitive actions.

**Error handling strategy**  
- Middleware converts validation, duplicate key, and JWT errors into safe responses.
- Client interceptors retry CSRF and refresh failures once.
- Feature degradation is deliberate: if SMTP or sign-language server is missing, the app still works.

## 8. Failure Scenarios & Debugging

1. **MongoDB URI missing**  
Root cause: bad or absent environment variable.  
Detection: startup logs, `/health` database state, process exit in production.  
Fix: set `MONGODB_URI` and redeploy.  
Prevention: env hygiene script and production env validation.  
Interviewer question: “What will you do if this fails in production?”

2. **MongoDB connection drops**  
Root cause: network issue, Atlas hiccup, or IP whitelist change.  
Detection: reconnect logs and `disconnected` event.  
Fix: retry, restore networking, verify credentials.  
Prevention: retry logic and monitoring.

3. **CORS rejection from frontend**  
Root cause: frontend origin not on the allowlist.  
Detection: 403 with CORS origin error.  
Fix: update `FRONTEND_URL` or `FRONTEND_URLS`.  
Prevention: keep production origins explicit.

4. **CSRF token missing/invalid**  
Root cause: stale cookies or blocked cross-site cookie behavior.  
Detection: 403 with `CSRF_TOKEN_MISSING` or `CSRF_TOKEN_INVALID`.  
Fix: re-bootstrap token and retry.  
Prevention: client bootstrap logic and cookie settings.

5. **Refresh token reuse detected**  
Root cause: stolen or stale refresh token.  
Detection: 401 from `/auth/refresh`.  
Fix: force logout and require login again.  
Prevention: token rotation and server-side refresh token storage.

6. **User gets locked out**  
Root cause: five failed password attempts.  
Detection: login returns `ACCOUNT_LOCKED`.  
Fix: wait out lock window or reset password.  
Prevention: rate limiting and clearer user feedback.

7. **WebRTC offer/answer glare**  
Root cause: both peers create offers at the same time.  
Detection: negotiation failures or unstable signaling state.  
Fix: glare handling and suppression of initial negotiation on answered peers.  
Prevention: controlled offer creation logic.

8. **ICE candidate arrives before remote description**  
Root cause: network timing race.  
Detection: candidate cannot be added immediately.  
Fix: queue candidates until remote description exists.  
Prevention: pending candidate buffer.

9. **Screen sharing unsupported**  
Root cause: insecure context, unsupported browser, or iOS limitations.  
Detection: UI warning from `canScreenShare` and `screenShareError`.  
Fix: fall back to camera view or instruct user to use supported browser.  
Prevention: capability detection before starting.

10. **Sign-language server unavailable**  
Root cause: Python service down or misconfigured.  
Detection: connection errors to sign server.  
Fix: disable captions, keep call functional.  
Prevention: separate deployment health checks.

11. **SMTP not configured**  
Root cause: missing mail settings.  
Detection: forgot-password response reports `EMAIL_NOT_CONFIGURED`.  
Fix: set SMTP env vars.  
Prevention: explicit startup warnings.

12. **Meeting update writes bad transcript data**  
Root cause: malformed client payload.  
Detection: validation errors or truncated fields.  
Fix: sanitize and clamp payload sizes.  
Prevention: controller-level allowlist and limits.

## 9. Metrics & Performance

**Definitions**  
- **Latency:** time from action to visible response.
- **Throughput:** number of requests/messages processed per second.
- **Error rate:** ratio of failed operations to total operations.

**Expected performance for this project**  
- Auth REST calls should complete in a few hundred milliseconds under normal load.
- WebRTC media latency should be near real-time because media is peer-to-peer.
- Socket events should remain lightweight and low-latency.
- Sign-language inference is the slowest path and should be throttled.

**Bottlenecks**  
- MongoDB if history queries grow large.
- Python inference CPU if many sessions enable sign-language.
- Socket.IO server if room count or chat volume spikes.
- Client-side media if too many peer connections are active.

**Optimization strategies**  
- Add DB indexes and projection trimming.
- Use Redis for shared room state if horizontally scaling sockets.
- Introduce a job queue or worker pool for sign inference if volume increases.
- Cache static config and reduce payload sizes.

**How to measure**  
- Backend logs for response time and error counts.
- `/health` for DB readiness.
- Browser DevTools and WebRTC internals for media quality.
- Socket.IO connection and disconnect logs.
- Application metrics like meeting creation success rate and auth failure rate.

**Why it matters**  
Interviewers want to see whether you know the slow path and can defend which user experience is actually performance-sensitive. In this app, the critical path is WebRTC setup and call stability, not page load alone.

## 10. Scalability Roadmap

### Stage 1: Local
- Single backend, single Python service, single MongoDB instance.
- In-memory Socket.IO room state is acceptable.
- Good for development and small demos.

### Stage 2: 1K users
- Add stronger DB indexes and pagination.
- Move logs to a centralized store.
- Keep signaling thin and monitor socket load.
- Deploy frontend separately from backend.

### Stage 3: 100K users
- Horizontal backend scaling behind a load balancer.
- Redis adapter for Socket.IO room coordination.
- Read replicas or sharding strategy for MongoDB depending on access patterns.
- Separate sign-language workers or queue-based inference.
- CDN for frontend and static assets.

### Stage 4: 1M+ users
- Break out auth, meeting history, signaling, and analytics into clearer services.
- Adopt distributed caches and event streams.
- Region-aware deployment for lower call setup latency.
- Dedicated TURN infrastructure and observability stack.

## 11. Alternative Designs

### Monolith vs Microservices
**Monolith pros:** simpler deployment, easier local debugging, less network overhead.  
**Monolith cons:** scaling and ownership boundaries become harder as the system grows.  
**Microservices pros:** independent scaling, clearer boundaries, isolated failures.  
**Microservices cons:** higher operational complexity, harder debugging, more network calls.  
**When to use:** this project is best as a modular monolith plus one separate inference service until traffic justifies more decomposition.

### SQL vs NoSQL
**SQL pros:** joins, constraints, strong transactional semantics, analytics-friendly.  
**SQL cons:** less natural for nested transcripts and flexible meeting payloads.  
**NoSQL pros:** flexible documents, easy nested data, quick schema evolution.  
**NoSQL cons:** weaker relational modeling and some analytics can be more complex.  
**When to use:** MongoDB fits meeting history here; SQL would be attractive if the reporting and relationships become more complex.

### REST vs GraphQL
**REST pros:** simple caching, clear endpoints, easy security and observability.  
**REST cons:** multiple round trips when clients need mixed data.  
**GraphQL pros:** flexible client queries, one round trip for composed data.  
**GraphQL cons:** more complexity, caching and auth can be trickier.  
**When to use:** REST is the right fit here because the app has clear resources and real-time features already handled by Socket.IO.

## 12. Interview Questions

### Basic
- What problem does Apna Meet solve?
- Why did you use WebRTC instead of sending media through the backend?
- What does Socket.IO do in your architecture?
- How do users authenticate?
- What gets stored in MongoDB?

### Intermediate (WHY-based)
- Why did you keep sign-language inference in a separate Python service?
- Why use refresh tokens instead of forcing login every session?
- Why do you need CSRF if you already use JWT?
- Why is meeting history saved at call end rather than in real time only?
- Why did you choose MongoDB over PostgreSQL?

### Advanced (scaling, trade-offs)
- What happens if two users join the same room at the same time and both create offers?
- What happens when a peer disconnects mid-call and reconnects later?
- How would you scale Socket.IO across multiple backend instances?
- What would break first at 100K concurrent users?
- How would you handle sign-language inference if 10K users enable it simultaneously?

### Deep Technical (code, DB, APIs)
- Walk through the register and login controller step by step.
- Explain how refresh token reuse detection works.
- How does the frontend bootstrap and retry CSRF tokens?
- How are remote ICE candidates handled before remote descriptions exist?
- How are meeting summary and stats generated from transcripts and detections?

### Follow-ups
- Why do you need both access and refresh tokens?
- Why is `sameSite` set differently in production and development?
- Why is the meeting code exactly six letters?
- Why is the client allowed to join as guest?
- Why not run sign-language prediction in the Node backend?

## 13. Answers

**1. Why use WebRTC?**  
Short answer: because media should not transit your app server if you can avoid it.  
Expand: WebRTC gives direct peer-to-peer media, which reduces bandwidth cost and latency on the backend. The server only handles signaling.

**2. Why Socket.IO?**  
Short answer: it handles signaling and room events reliably with fallback transport support.  
Expand: WebRTC needs a control channel for offers, answers, and ICE. Socket.IO is simpler than raw WebSocket handling and is enough for chat and captions too.

**3. Why JWT cookies?**  
Short answer: they keep the browser session simple and avoid exposing tokens in localStorage.  
Expand: httpOnly cookies reduce XSS token theft risk. Because cookies are used, CSRF protection becomes necessary.

**4. Why MongoDB?**  
Short answer: the meeting history document is naturally nested and flexible.  
Expand: transcripts, sign detections, and summaries evolve over time. MongoDB makes that shape easy to store and query.

**5. Why separate sign-language service?**  
Short answer: inference is CPU-heavy and should not block meeting control traffic.  
Expand: isolating it lets the main app stay responsive while the ML stack can scale or fail independently.

## 14. Storytelling Mode (HR + Tech)

**Problem**  
Remote calls often force users to juggle separate tools for video, chat, accessibility, and session tracking.

**Idea**  
Build one meeting app that feels fast, secure, and inclusive, with sign-language support baked into the call itself.

**Challenges**  
The hardest parts were real-time signaling, secure auth across origins, screen sharing, and keeping sign inference from hurting call stability.

**Solution**  
Use WebRTC for media, Socket.IO for control messages, JWT cookies and CSRF for secure auth, MongoDB for persistent history, and a separate Python inference service for sign-language captions.

**Impact**  
The project demonstrates end-to-end product thinking: user auth, real-time networking, media handling, operational safety, and a feature that differentiates the app beyond a standard Zoom clone.

## 15. Edge Cases & Common Mistakes

- Joining with an invalid room code.
- Refresh token missing after browser cookie cleanup.
- Access token expired while a user is mid-session.
- Browser blocks screen sharing because the context is not secure.
- Candidate arrives before remote description is set.
- User closes tab during sign-language inference.
- SMTP credentials are missing in deployment.
- MongoDB write succeeds after a client already navigated away.
- Chat or transcript payloads are too large.
- Meeting stats become slow without indexing.

## 16. Future Improvements

- Add Redis-backed Socket.IO scaling.
- Use a queue for sign-language inference bursts.
- Introduce richer meeting analytics and search filters.
- Add TURN infrastructure as a first-class production dependency.
- Persist audit logs to a structured datastore instead of flat files.
- Strengthen email verification flow with clearer UX and resend controls.
- Add Prometheus/Grafana or similar observability.
- Tighten password policy and add optional MFA.

## 17. Mock Interview Mode (Interactive)

Use this prompt during practice:

**Question 1:** Why did you design the app so the media path is peer-to-peer but signaling goes through the backend?  
**How to answer:** start with latency and bandwidth, then explain server role, then mention trade-offs and failure cases.

**Evaluation rubric:**
- Clarity: do you explain the architecture in one sentence first?
- Depth: do you mention trade-offs, not just features?
- Structure: do you separate media, signaling, and persistence?

**Ideal answer shape:** problem → design choice → trade-off → production consideration.

## 18. Stress / Adversarial Mode

Try these follow-ups out loud:

- Why is your backend not handling WebRTC media?
- Why do you need CSRF if the token is in a cookie?
- Why not store access tokens in localStorage and skip cookies?
- Why use MongoDB if history queries need analytics?
- Why is your sign-language service acceptable as a separate failure domain?
- Why should I trust your room state when it is in memory?
- What breaks when you horizontally scale Socket.IO?
- Why is your meeting code only six letters?
- What happens if the Python service returns nonsense?
- What if the refresh token is stolen and reused elsewhere?

## 19. Code Rebuild Test

Be ready to rewrite these from memory:

- The auth register and login flow.
- JWT cookie set/clear helpers.
- The CSRF bootstrap and verification path.
- Room join signaling and peer creation.
- ICE candidate queueing.
- Screen-share toggle and track replacement.
- Meeting end-of-call update payload.
- Sign-language landmark vector assembly.

For each one, explain:
- What input it receives.
- What validation happens.
- What state changes.
- What the failure path is.
- Why this implementation is safer than a simpler one.

## 20. Rapid Revision Sheet

- WebRTC carries media; Socket.IO carries signaling and chat.
- JWT cookies improve browser auth, but CSRF must be handled.
- Refresh tokens are rotated and stored server-side for reuse detection.
- MongoDB stores nested meeting history and sign detections.
- Meeting summaries are generated server-side from transcripts and sign data.
- Sign-language inference is isolated in Python and throttled.
- The system is modular now, but Socket.IO will need distributed state at large scale.
- The biggest risks are auth misconfiguration, room-state scaling, and inference service availability.

## Final Interview Takeaway

If you remember only one framing, use this:

**Apna Meet is a secure, low-latency meeting platform where WebRTC handles the media path, Socket.IO handles the control path, MongoDB stores user and meeting state, and a separate Python ML service adds accessibility features without risking call stability.**
