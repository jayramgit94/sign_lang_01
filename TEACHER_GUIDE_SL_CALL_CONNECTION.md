# Teacher Guide — How Sign Language Connects to the Zoom-Style Call

> **Audience:** You (to study) + teachers / viva panel  
> **Goal:** Explain the **integration** in simple language + deep technical language, with corner cases and likely counter-questions.  
> **Weighting to memorize:** Call stack ~10% · Model ~15% · **Connection ~75% (main USP)**

Related paper-input file: `RESEARCH_PAPER_SL_CONNECTION_DRAFT.md`

---

# PART A — Simple Language (Explain Like Teaching Class 12 / Non-CS Teacher)

## A1. What Did We Build?

A video call app (like Zoom) where if someone turns on **Sign Language**, the system tries to understand hand signs from their camera and shows **text captions** to everyone in the same meeting.

## A2. What Is the Unique Part?

Most apps either:

- do video calls, **or**
- do sign recognition on a separate demo page.

**We connected both.** The signer is **inside the live call**, and other participants see captions **inside the same call screen**, without sending the full video recording to an AI server.

## A3. Everyday Analogy

Think of three roads:

1. **Media road (WebRTC):** Video/audio travel peer-to-peer — like FaceTime between people. Our Node server does **not** carry video.
2. **Control road (Socket.IO meeting):** Small messages — “who joined”, “mute”, “chat”, “here is an ICE candidate”.
3. **AI road (separate Socket.IO to Python):** Tiny packets of **hand/face position numbers** (landmarks), not video.

When AI replies “this looks like Hello”, we put that word on the **control road** as a caption so everyone in the room sees it.

**USP:** Caption is a meeting message. AI is a helper beside the call, not the call itself.

## A4. Step-by-Step Story (Teacher Version)

1. Both users join room `abcdef`.
2. WebRTC starts — they see each other.
3. User A clicks **Sign Language**.
4. Browser opens Google MediaPipe on A’s camera (same camera already used for the call).
5. MediaPipe finds hand/face points → we make a list of **1530 numbers**.
6. Those numbers go to Python ONNX server (~6 times/sec when hands move).
7. Python returns `{ label: "Hello", score: 0.9 }`.
8. If score is high enough, A’s screen shows “Hello”, and A’s meeting socket says: broadcast caption “Hello”.
9. User B’s screen shows A’s caption overlay.
10. If AI server dies, video call **still works** — only captions stop. Banner may say service degraded.

## A5. Percentage Story (How to Answer “What Is Your Contribution?”)

> “About **10%** of the novelty is the meeting itself (WebRTC + rooms), about **15%** is the ML model, and about **75%** is the **connection design**: extracting landmarks from the live call stream, isolating inference, throttling so quality stays smooth, and safely broadcasting captions into the room.”

---

# PART B — Technical Depth (Viva / External Examiner)

## B1. Dual-Plane Architecture

### Call plane

| Component | Tech | Job |
|-----------|------|-----|
| Frontend | React 19, Vite | UI + orchestration (`VideoMeet.jsx`) |
| Media | WebRTC mesh | P2P `MediaStream` audio/video |
| Signaling | Socket.IO ↔ Node Express | offers, answers, ICE, rooms, chat |
| Rooms | In-memory `roomService` | Who is in which code |

### Accessibility plane

| Component | Tech | Job |
|-----------|------|-----|
| Landmark extractor | MediaPipe Holistic (browser CDN) | Pose features from camera |
| Hook | `useSignLanguage.js` | Enable/disable, throttle, vectors, bridge |
| Inference | Flask-SocketIO + ONNX Runtime | Classify gesture |
| Optional NLP | Groq via `SentenceBuilder` | Grammar-fix word sequences |

### Bridge

`prediction` / `corrected_sentence` (AI plane) → `caption` event on **meeting** socket → Node relay → remote `CaptionOverlay`.

## B2. Exact Message Contracts

### Browser → ML: `landmark`

```json
{ "vector": [/* 1530 floats */], "normalized": false }
```

### ML → Browser: `prediction`

```json
{ "label": "Hello", "score": 0.87 }
```
or `{ "error": "..." }`

### Browser → Meeting: `caption`

```json
{ "text": "Hello", "score": 0.87 }
```
or sentence form `{ "text": "...", "score": 1.0, "isSentence": true }`

### Meeting → Peers: `caption`

```json
{
  "from": "<socketId>",
  "username": "<server-trusted name>",
  "text": "Hello",
  "score": 0.87,
  "isSentence": false,
  "timestamp": 1710000000000
}
```

## B3. Why These Tech Choices (And Not Alternatives)

| Choice | Why this | Why not the alternative |
|--------|----------|-------------------------|
| Landmarks not video to ML | Low bandwidth, private, cheaper CPU on GPU-less VPS | Full video → huge bandwidth, privacy risk, fights WebRTC encoder |
| Separate Python service | Isolate GIL/CPU spikes from Node event loop | In-process Python in Node → hard ops + shared failure |
| Dual Socket.IO | Separate failure domains & backpressure | One socket for all → ML lag can delay ICE |
| MediaPipe in browser | Reuse camera already open; no upload of frames | Server MediaPipe needs video frames |
| ONNX Runtime | Fast CPU deploy without torch in prod image | Keep PyTorch prod dep = larger, slower cold start |
| Caption over Socket.IO room | Room broadcast O(1) from client view; works with mesh | WebRTC data channel mesh would require N−1 sends & no server moderation |
| Confidence threshold 0.6 | Filter noisy classes | Show all scores → caption spam |
| Throttle 150 ms + delta | Protect call FPS/CPU | Full Holistic emit every frame → jank |

## B4. Landmark Math Teachers May Ask

- Left hand 21 points × 3 = 63  
- Right hand 21 × 3 = 63  
- Face 468 × 3 = 1404  
- Total **1530**  
- Missing part → **zeros** (fixed shape for MLP)  
- Server may normalize (center + scale) if `normalized: false`

## B5. Throttling Algorithm (Describe Precisely)

On each MediaPipe `onResults`:

1. Abort if sign socket disconnected  
2. Abort if time since last send < `sendInterval` (starts 150 ms)  
3. Abort if **no hands**  
4. Build 1530 vector; compute mean absolute delta vs last sent vector  
5. Send if `delta ≥ 0.003` **OR** ≥ 1500 ms since last full send  
6. Else stretch interval up toward 250 ms (idle)  
7. On server `slowdown`, force interval ≥ 300 ms  

This is **client-side adaptive sampling**, not fixed FPS.

## B6. Caption Bridge Security / Integrity

Meeting handler (`signalingHandler.js`):

1. Zod parse  
2. Rate limit captions  
3. Resolve room from **socket id mapping** (must already have joined)  
4. Attach `username` from **socket auth context**, ignore client spoofing attempts for identity  

**Meaning:** Even if someone crafts a caption event, they cannot fake identity easily; they also cannot caption outside their room.

## B7. Call Continuity Guarantee

WebRTC peer connections live in `useWebRTC`. Sign socket is created only on SLR enable and torn down on disable. Meeting socket remains for the whole call. ML outage sets `signServerHealth = "degraded"`; video path unaware.

---

# PART C — Corner Cases (Memorize These)

| # | Corner case | What happens | Why designed that way |
|---|-------------|--------------|------------------------|
| 1 | Signer enables SLR before camera ready | Start fails / warning “No local stream” | MediaPipe needs `localStream` |
| 2 | No hands in frame | No landmark emit | Avoid meaningless face-only spam |
| 3 | Only one hand visible | Other hand zero-padded | Model expects fixed dim |
| 4 | Screen sharing on | WebRTC may show screen; SLR still uses camera path | Capture and share tracks differ |
| 5 | Two people signing together | Per-username caption timers; both can appear | Multi-signer support |
| 6 | Rapid prediction score ≤ 0.6 | No caption broadcast | Noise filter |
| 7 | SentenceBuilder confidence ≥ ~0.8 | Word enters buffer | Stricter than display threshold |
| 8 | Pause ~2 s in signing | Groq correction → sentence caption longer display | Soft sentence boundary |
| 9 | Groq key missing / API fail | Falls back to raw words | Call captions still useful |
| 10 | ML rate limit | `prediction` error + `slowdown` event | Protect server; client backs off |
| 11 | Caption spam attack | Meeting rate limit `RATE_LIMIT` | Protect peers' UI |
| 12 | User not in room emits caption | Server no-ops (no roomCode) | No orphan broadcast |
| 13 | ML server URL unset in prod | Warning; SLR won't connect | Hard fail soft on meeting |
| 14 | MediaPipe CDN blocked | Toggle shows error; call works | Dependency isolation |
| 15 | Guest (no auth) signs | Works; history may not store detections | Auth optional for call |
| 16 | Network blip on sign socket | Reconnect attempts (5); call socket independent | Dual plane |
| 17 | Large meeting (>12) | Mesh may degrade quality; SLR extra CPU worsens | Mesh limit honesty |
| 18 | Rapid same label repeatedly | Local caption refreshes; remote timer resets | UX freshness |
| 19 | End call while SLR on | Tear down camera/MediaPipe/sign socket; optional save label counts | Cleanup + analytics |
| 20 | Wrong vector length | Server returns error; client warns | Schema/dim guard |

---

# PART D — Counter-Questions Bank (Ask → Strong Answer)

### D1. “Isn’t this just Zoom + any ML model?”

**Answer:** Zoom-like call is the substrate (~10%). The research/system contribution is the **integration contract**: landmarks from live `MediaStream`, isolated inference, and room-scoped caption bridge with degradation guarantees.

### D2. “Why not put AI on the Node server?”

**Answer:** Node event loop is I/O oriented. Continuous ONNX on CPU would stall signaling. Separate Python process + socket keeps offers/answers responsive under inference load.

### D3. “Why MediaPipe client-side?”

**Answer:** Camera already captured for WebRTC. Client landmarks mean we send ~KB/s of floats instead of video. Privacy improves because raw frames never leave browser for ML.

### D4. “Can you detect continuous ASL grammar?”

**Honest:** Current ONNX path is **per-frame / per-sample classification** over 14 signs + optional word buffering. Full continuous ASL parsing is future work (sequence models/transformers).

### D5. “Latency?”

**Structure the answer:** MediaPipe time + network RTT to ML + ONNX (~ms on CPU) + caption RTT to peers. Captions are soft-real-time overlays, not frame-locked. Throttle deliberately trades max FPS for call smoothness.

### D6. “What if ML is wrong?”

**Answer:** Confidence gate; sentence-level Groq can soften word salad; we do not mute AV based on prediction. Peers still see the signer visually — captions assist, not replace sight.

### D7. “Security of landmarks?”

**Answer:** Landmarks leak rough pose but not full video pixels. Still personal biometric-ish signals — rate limits + CORS on ML service. Meeting captions authenticated by room membership.

### D8. “Why Socket.IO captions not WebRTC DataChannel?”

**Answer:** Room fan-out + server validation + works even before complex mesh mesh N×N data channels. Control plane already exists for chat; captions are similar UX.

### D9. “Does AI see everyone’s video?”

**Answer:** No. Only the enabler’s landmark stream goes to ML. Peers only receive text captions.

### D10. “Offline / free tier Render sleep?”

**Answer:** Cold start → degraded banner; call unaffected. Production needs always-on ML or warm pool — operational limitation to admit.

### D11. “Why 1530 specifically?”

**Answer:** Holistic schema we trained on: 2 hands + face mesh flattened. Zeros preserve interface for hand-only capture regimes.

### D12. “How is this different from speech captions?”

**Answer:** Modality is **vision→gesture class**, not audio ASR. Helps mute/deaf signing users; complementary to speech captions.

### D13. “Mesh vs SFU impact on SLR?”

**Answer:** SLR cost is mostly local MediaPipe + ML RTT. Mesh already taxes upload; SLR adds client CPU. SFU would help media scale; SLR architecture stays similar (still dual plane).

### D14. “Did you invent MediaPipe/ONNX?”

**Answer:** No — we **compose** them with meeting systems. Contribution = architecture & engineering of the connection, not inventing SLR math.

### D15. “Show me the file map.”

| Layer | File |
|-------|------|
| Toggle + UI | `ControlBar.jsx`, `CaptionOverlay.jsx`, `VideoMeet.jsx` |
| Connection brain | `frontend/src/hooks/useSignLanguage.js` |
| Caption relay | `backend/.../signalingHandler.js` |
| Inference | `jars_project_onnx/server.py` |
| Sentences | `sentence_builder.py`, `groq_api_secure.py` |

---

# PART E — 2-Minute Oral Script (Memorize)

> “Our unique work is connecting sign-language recognition with a live WebRTC meeting. Video stays peer-to-peer. When a user enables sign language, MediaPipe in the browser extracts 1530 hand and face landmarks from the same camera used for the call. Those numbers go to a separate Python ONNX service so heavy inference cannot freeze signaling. Predictions return to the browser; if confidence is high, we emit a caption on the meeting Socket.IO room so every peer sees an overlay. If AI fails, the meeting continues — only captions degrade. Roughly 10% of the story is the call, 15% the model, and 75% this dual-plane connection design.”

---

# PART F — Whiteboard Diagram to Draw

```
[Camera]──►[WebRTC encode]──P2P──►[Remote peers]
    │
    └──►[MediaPipe]──1530──►[ONNX Python]──label──┐
                                                  │
[Meeting Socket.IO Node]◄──caption──[Browser hook]◄┘
         │
         └──broadcast caption──►[Remote CaptionOverlay]
```

Say aloud: **“Video right path; landmarks left path; captions middle bridge.”**

---

# PART G — Soft Flaws to Admit (Builds Trust)

1. Vocabulary limited to 14 trained signs.  
2. Not full ASL linguistics.  
3. Mesh meetings get heavy with many peers + MediaPipe.  
4. Groq is optional third-party.  
5. Caption timing is soft, not sample-accurate sync.  
6. Landmark spam protections exist but adversarial gestures can still confuse classes.

Always finish with **future work**: larger dataset, sequence models, SFU, TURN, on-device ONNX option.

---

# PART H — Teacher FAQ One-Liners

| Question | One-liner |
|----------|-----------|
| Unique? | In-call landmark→caption bridge with failure isolation |
| Media path? | WebRTC P2P |
| AI path? | Separate Socket.IO + ONNX |
| Glue? | `useSignLanguage` + meeting `caption` event |
| Why survive AI crash? | Dual sockets / dual planes |
| Score? | Display >0.6; sentence buffer uses higher gate |
| Vector size? | 1530 |
| Classes? | 14 |
| Weighting? | 10 / 15 / 75 |

---

*Study this file for viva/teaching. Use `RESEARCH_PAPER_SL_CONNECTION_DRAFT.md` as Gemini paper seed.*
