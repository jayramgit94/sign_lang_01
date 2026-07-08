# Research Paper Draft Input  
## Bridging Sign-Language Recognition with Real-Time Video Conferencing

> **Document role:** Hand this to Gemini Pro to expand into a formal research paper / paper draft.  
> **Focus weighting:** ~10% video call foundation · ~15% ML model · **~75% integration / connection layer (USP)**  
> **Project:** Apna Meet (`sign_lang_01`) — React + WebRTC + Socket.IO + Python ONNX  
> **Last updated:** July 2026

---

## Abstract (Seed)

Real-time video conferencing platforms typically treat accessibility as a bolted-on caption product (speech-to-text). Users who rely on **sign language** still lack native, in-call gesture translation that does not damage call quality. This work presents a **decoupled integration architecture** that embeds continuous sign-language recognition into a peer-to-peer video meeting without routing media through an ML server. Hand and face landmarks are extracted **in the browser** from the same camera stream used for WebRTC, transmitted as a fixed 1530-dimensional float vector to a separate ONNX inference service, and returned predictions are **broadcast into the meeting room** as live captions via the existing Socket.IO control plane. The design isolates CPU-heavy inference from signaling and media paths, enabling graceful degradation when the ML service is unavailable while the call continues uninterrupted.

**Keywords:** sign language recognition, WebRTC, real-time systems, MediaPipe, ONNX Runtime, multimodal accessibility, service isolation, caption broadcast

---

## 1. Problem Statement

### 1.1 Gap in Existing Platforms

| Product approach | What it does | What it misses |
|------------------|--------------|----------------|
| Zoom / Meet live captions | Speech → text | Ignores signed communication |
| Standalone SLR apps | Camera → sign prediction | Isolated from meetings — peers cannot see captions in-call |
| Manual interpreter / separate chat | Human or typed text | High friction, not real-time collaborative |

**Research gap:** Few student or commercial systems demonstrate a **tight communication loop** where:

1. The signer is already inside a live multi-party video call  
2. Gesture inference runs continuously without freezing A/V  
3. **All remote participants** see captions in the same UI as the call  
4. Failure of ML does **not** tear down WebRTC sessions  

### 1.2 Thesis / Claim

> The unique contribution is not “another Zoom clone” or “another CNN/ONNX classifier” in isolation. The contribution is a **connection architecture** that makes sign-language AI a first-class, survivable feature of a multi-party WebRTC call.

---

## 2. Research Focus Split (How to Allocate Paper Content)

| Theme | Suggested paper weight | Role |
|-------|------------------------|------|
| Video meeting foundation (WebRTC mesh, rooms, chat) | **~10%** | Necessary substrate — keep brief |
| ML model & feature engineering (MediaPipe, 1530-D, ONNX MLP) | **~15%** | Enabling technology — architecture over hyperparameter tables |
| **Connection / integration layer** | **~75%** | **Main USP** — dual sockets, caption bridge, throttling, isolation, multi-signer, degradation |

Gemini should expand Sections 4–7 deepest; keep Section 3 (call stack) and Section 8 (model) comparatively short.

---

## 3. Video Call Foundation (~10%)

### 3.1 What Exists (Brief)

- React SPA meeting UI with lobby → join flow  
- Mesh WebRTC: media peer-to-peer; server never forwards video/audio frames  
- Socket.IO room: join/leave, SDP/ICE signaling, chat, participant presence  
- Auth + meeting history in MongoDB (orthogonal to the SLR loop)

### 3.2 Why This Matters for SLR Integration

- Captions need a **room broadcast channel** already trusted by the call  
- Local camera stream (`MediaStream`) is already acquired for WebRTC — SLR **reuses** it  
- Isolating SLR from media path protects latency-sensitive ICE/RTP traffic  

### 3.3 Non-Claim

Do **not** oversell mesh WebRTC as the research novelty. Mesh is a pragmatic substrate with known O(n²) limits (~12 recommended participants). Novelty is **how SLR sits beside that mesh**.

---

## 4. The Connection Architecture (~75% — Core Contribution)

### 4.1 Conceptual Model: Two Planes + One Bridge

```
┌────────────────── CALL PLANE ──────────────────┐
│  WebRTC mesh (audio/video frames)              │
│  Socket.IO meeting server: signaling + chat    │
└───────────────────────┬────────────────────────┘
                        │ Bridge event: "caption"
┌───────────────────────▼────────────────────────┐
│  ACCESSIBILITY PLANE                           │
│  MediaPipe on local camera                     │
│  Separate Socket.IO → Python ONNX service      │
│  Predictions + Groq sentence correction        │
└────────────────────────────────────────────────┘
```

**Design rule:** Video bytes never go to the ML server. Only landmark vectors travel on the accessibility plane. Captions re-enter the call plane as structured text events.

### 4.2 End-to-End Data Flow (Canonical Path)

```
1. User enables "Sign Language" in ControlBar during live call
2. useSignLanguage attaches MediaPipe Holistic to localStream (same track used by WebRTC)
3. On each Holistic result (when hands present):
      build 1530-D vector → optional throttle/delta gate → emit "landmark"
4. Python server:
      normalize → ONNX softmax → emit "prediction" {label, score}
5. Browser (if score > 0.6):
      show local caption → meetingSocket.emit("caption", {text, score})
6. Node signalingHandler:
      Zod validate → rate-limit → roomService room lookup → socket.to(room).emit("caption", ...)
7. Remote peers:
      CaptionOverlay shows per-user captions (multi-signer supported)
8. Parallel path: SentenceBuilder buffers high-confidence words → pause → Groq → corrected_sentence
      → also broadcast as caption with isSentence: true
```

### 4.3 Why Dual Socket.IO Connections (Critical Design Decision)

| Connection | URL / service | Carries |
|------------|---------------|---------|
| Meeting socket | Node backend (`VITE_API_URL`) | join-room, offer/answer/ICE, chat, **caption bridge** |
| Sign socket | Python server (`VITE_SIGN_LANG_URL`) | user_join, landmark, prediction, corrected_sentence, slowdown |

**Rationale:**

- Different runtimes (Node vs Python), different failure domains  
- Inference latency/backpressure must not block offer/answer delivery  
- Can disable SLR without touching WebRTC lifecycle  
- Independent deploy/scale for ML CPU vs signaling IOPS  

**Alternative rejected:** Multiplexing landmarks on the meeting socket would couple ONNX backlog to call control and mix trust boundaries.

### 4.4 Landmark Extraction at the Call Edge

- **Library:** MediaPipe Holistic (browser CDN)  
- **Input:** Hidden `<video>` bound to `localStream` (camera), not screen-share track  
- **Constraint:** At least one hand required before send — reduces spam / false “idle face” predictions  
- **Vector layout (exact):**

| Segment | Landmarks | Values |
|---------|-----------|--------|
| Left hand | 21 × (x,y,z) | 63 |
| Right hand | 21 × (x,y,z) | 63 |
| Face mesh | 468 × (x,y,z) | 1404 |
| **Total** | | **1530** |

Missing hand/face parts are **zero-padded** to keep shape fixed for the ONNX model.

### 4.5 Client-Side Backpressure (Protect Call Quality)

| Mechanism | Value / behavior |
|-----------|------------------|
| Min send interval | 150 ms (~6–7 Hz) |
| Motion delta gate | mean absolute delta ≥ 0.003 |
| Forced full send | every 1500 ms |
| Idle stretch | interval climbs toward 250 ms |
| Server `slowdown` | client raises interval ≥ 300 ms |
| Confidence display gate | score > 0.6 |

**Research angle:** This is an **edge filter** so the ML plane is bandwidth- and CPU-aware relative to concurrent encoding of WebRTC media.

### 4.6 Caption Bridge Into the Meeting (The USP Surface)

Meeting backend (`signalingHandler.js`) treats captions like signaling — **relay only**:

1. Zod schema validation (`captionSchema`)  
2. Rate limit (~30 caption emits / 10 s per socket)  
3. Resolve room via `roomService.getSocketRoom(socket.id)`  
4. Broadcast to peers with **trusted** `socket.username` (not client-claimed identity)  

Payload to peers:

```json
{
  "from": "<socketId>",
  "username": "<trusted username>",
  "text": "Hello",
  "score": 0.87,
  "isSentence": false,
  "timestamp": 1710000000000
}
```

**UI:** `CaptionOverlay` renders local prediction + remote captions; sentences (Groq) stay longer (8 s vs 5 s). Multiple concurrent signers tracked by username timers.

### 4.7 Persistence Hook (Secondary but Valuable)

On call end (authenticated users), frontend aggregates `signDetections` (label → count) into the meeting history PATCH. That closes the loop from **live accessibility → post-call analytics** without storing landmark streams permanently.

### 4.8 Failure Isolation Matrix

| Failure | Call continues? | Captions? | UX |
|---------|-----------------|-----------|-----|
| ML server down | Yes | No / degraded banner | `signServerHealth === "degraded"` |
| MediaPipe CDN fail | Yes | Local error on toggle | Loading error message |
| Caption rate limited | Yes | Partial | Meeting socket `RATE_LIMIT` |
| No hands in frame | Yes | No emit | Silent skip |
| WebRTC failure | Call broken | N/A | Independent of ML |

This **graceful degradation** is a key accessibility-systems result: the meeting is never held hostage by the recognizer.

### 4.9 Security Properties of the Bridge

- ML plane receives only floats — **no meeting auth cookies required** on landmark path (rate-limited by IP/session)  
- Caption identity attached on **meeting** plane after room membership is known  
- Caption text size / rate limited to reduce spam injection into the meeting UI  
- Same-room scope: captions never broadcast outside room  

---

## 5. What Makes This Unique vs Related Work

| Approach | Unique / Not |
|----------|--------------|
| SLR demo webcam page only | Not multi-party call integrated |
| Zoom ASR captions | Speech, not sign |
| Upload video → classify offline | Not real-time, not collaborative |
| Put full video into ML server | High bandwidth + privacy + couples media path |
| **This system: landmarks + dual plane + room caption bridge** | **Unique combination in this project** |

**USP one-liner for paper:**  
*In-call, multi-peer, real-time sign captions driven by browser landmark streaming and a disconnected inference service, re-entering the conference as structured control-plane events.*

---

## 6. ML Component (~15% — Supporting Technology)

### 6.1 Training / Serving Split

- Train: PyTorch (`train.py`) → export ONNX (`model/model.onnx`)  
- Serve: ONNX Runtime CPU, Flask-SocketIO, Docker/Render  
- Render deps deliberately exclude torch/mediapipe (inference-only image)

### 6.2 Model Sketch

- MLP: **1530 → 512 → 256 → C** (softmax)  
- Classes (14): Hello, Yes, No, Thank You, I Love You, Congratulations, How, My, Name, Is, A, B, H, I  

### 6.3 Normalization (Server)

Center on face (or hand) mean; scale by xy std — improves position/scale invariance before inference.

### 6.4 Sentence Layer

`SentenceBuilder`: buffer words with confidence ≥ ~0.8; 2 s pause → optional Groq grammar correction → `corrected_sentence` → bridge as `isSentence` caption.

### 6.5 Honesty for Paper

Accuracy is vocabulary-limited (14 classes). Contribution emphasis should remain **systems integration**, with ML accuracy as measurable but secondary unless experiments are expanded.

---

## 7. System Design Concerns Suitable for Research Discussion

### 7.1 Why Not Send Raw Video to ML?

Bandwidth, privacy, encoder interference with WebRTC, harder horizontal scale. Landmarks ≈ continuous telemetry (~few KB at 6–7 Hz) vs megabit video.

### 7.2 Why Not Browser-Only ONNX?

Possible (onnxruntime-web), but model update + device variance; centralized ONNX guarantees consistent labels for all peers seeing captions.

### 7.3 Sync Semantics

Captions are **soft real-time** (human-readable overlay), not frame-accurate lip-sync. Acceptable for accessibility overlays; paper should state this QoS target explicitly.

### 7.4 Multi-Signer Semantics

Captions are keyed by username; timers independent. No arbitration of “speaker of record” for ASL — future work: turn-taking or pin-follow-signer.

### 7.5 Screen Share Interaction

SLR uses camera stream; screen share replaces video track on WebRTC but SLR can continue on camera — documented product behavior.

---

## 8. Suggested Paper Outline for Gemini Expansion

1. Introduction & problem gap  
2. Related work (SLR; WebRTC accessibility; live captions)  
3. System overview (call vs accessibility planes) — diagram required  
4. **Integration pipeline (detailed)** — algorithms for throttle, vector build, bridge  
5. Security & reliability analysis (failure matrix)  
6. ML backend (short)  
7. Implementation notes (React hook, Node handler, Flask server)  
8. Evaluation plan: latency breakdown (MediaPipe → network → ONNX → caption RTT), call MOS/FPS with SLR on/off, false-positive rate under motion gate  
9. Limitations (vocab size, mesh scale, English-only Groq layer)  
10. Conclusion & future work (SFU, larger vocab, continuous CRNN/transformer, TURN, federated model updates)

---

## 9. Evaluation Ideas Gemini Should Propose

| Metric | How |
|--------|-----|
| Landmark→prediction latency | Client timestamps on emit/receive |
| Caption end-to-end (signer → remote overlay) | Dual clocks / synchronized rooms |
| WebRTC outbound bitrate / FPS with SLR on/off | `getStats()` |
| CPU % client | Chrome performance + MediaPipe complexity 0 |
| Server landmarks blocked rate | `/api/metrics` |
| User study | Comprehension of signed message by hearing peer using captions only |

---

## 10. Limitations & Threats to Validity

- 14-class closed vocabulary  
- Static gesture classification ≠ full continuous ASL grammar  
- Mesh call scale ≠ enterprise SFU  
- Landmark zero-padding may leak “missing hand” patterns  
- Groq optional — grammar quality depends on external API  
- Cross-origin Socket.IO + CORS operational complexity  

---

## 11. Contribution Statement (Paste-Ready)

This work contributes a **practical systems architecture for embedding sign-language recognition into multi-party WebRTC meetings** by:

1. Extracting MediaPipe Holistic landmarks from the live call camera without shipping video to ML  
2. Serving predictions on an isolated ONNX microservice  
3. Bridging predictions into the meeting as authenticated, rate-limited caption events  
4. Preserving call continuity under ML failure (graceful degradation)  
5. Supporting multi-signer caption overlays and post-call sign-detection analytics  

---

## 12. Glossary

| Term | Meaning |
|------|---------|
| Mesh WebRTC | Every peer connects to every other peer for media |
| Control plane | Signaling/chat/captions over Socket.IO |
| Media plane | RTP audio/video via WebRTC |
| Landmark vector | Fixed-size pose features, dim 1530 |
| Caption bridge | prediction → meeting `caption` broadcast |
| Graceful degradation | Call works without SLR |

---

## 13. Prompt for Gemini Pro (Copy-Paste)

```
Using PROJECT_RESEARCH_BRIEF.md + RESEARCH_PAPER_SL_CONNECTION_DRAFT.md as only technical sources,
write a draft research paper titled:

"In-Call Sign Language Recognition for Peer-to-Peer Video Conferencing:
A Dual-Plane Integration Architecture"

Requirements:
- ~75% focus on the integration/connection USP; 15% model; 10% WebRTC substrate.
- Include System Model section with dual-plane diagram description.
- Formalize the pipeline as numbered stages with inputs/outputs.
- Discuss failure isolation, security of caption bridge, throttling/backpressure.
- Separate Related Work from Contribution claims.
- Academic tone, IEEE-style sections; keep claims scoped to the implemented system.
- Propose evaluation methodology even if empirical tables are placeholders.
- End with limitations and future work (SFU, larger vocabulary, continuous signing).
```

---

*Seed document for research drafting. Implementation-faithful to Apna Meet / sign_lang_01.*
