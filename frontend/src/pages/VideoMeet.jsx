import CallEndIcon from "@mui/icons-material/CallEnd";
import ChatIcon from "@mui/icons-material/Chat";
import MicIcon from "@mui/icons-material/Mic";
import MicOffIcon from "@mui/icons-material/MicOff";
import ScreenShareIcon from "@mui/icons-material/ScreenShare";
import StopScreenShareIcon from "@mui/icons-material/StopScreenShare";
import VideocamIcon from "@mui/icons-material/Videocam";
import VideocamOffIcon from "@mui/icons-material/VideocamOff";
import { Badge, Button, IconButton, TextField } from "@mui/material";
import { useContext, useEffect, useMemo, useRef, useState } from "react";
import io from "socket.io-client";
import { AuthContext } from "../contexts/AuthContext";
import server from "../environment";
import styles from "../styles/videoComponent.module.css";

const server_url = server;
const signLangServerUrl =
  import.meta.env.VITE_SIGNLANG_URL || "http://localhost:5000";

var connections = {};

const peerConfigConnections = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    ...(import.meta.env.VITE_TURN_URL
      ? [
          {
            urls: import.meta.env.VITE_TURN_URL,
            username: import.meta.env.VITE_TURN_USERNAME,
            credential: import.meta.env.VITE_TURN_CREDENTIAL,
          },
        ]
      : []),
  ],
};

export default function VideoMeetComponent() {
  const { addToUserHistory } = useContext(AuthContext);

  const meetingCode = useMemo(
    () => window.location.pathname.split("/").pop(),
    [],
  );

  var socketRef = useRef();
  let socketIdRef = useRef();
  // reference to the local video

  let localVideoref = useRef();

  let [videoAvailable, setVideoAvailable] = useState(true);
  // reference to the local video will take permission from user

  let [audioAvailable, setAudioAvailable] = useState(true);
  // reference to the local video will take permission from user

  let [video, setVideo] = useState(false);
  //vedio turn on or off jesa button

  let [audio, setAudio] = useState(false);
  // same as this ane mute like
  let [screen, setScreen] = useState(false);
  // screen shre ke liye button

  let [showModal, setModal] = useState(false);
  //chat model open or close

  let [screenAvailable, setScreenAvailable] = useState(false);
  // to check screen share permission

  let [messages, setMessages] = useState([]);
  // all chat messages

  let [message, setMessage] = useState("");
  // current message to be sent jo hum likh rhe honge

  let [newMessages, setNewMessages] = useState(0);
  //jaha pr likhenege new message ka badge show hoga

  let [askForUsername, setAskForUsername] = useState(true);
  // to ask for username jab koi guest se login kr rha hoga

  let [username, setUsername] = useState("");
  // to store the username of the user

  const [signLangEnabled, setSignLangEnabled] = useState(false);
  const signLangEnabledRef = useRef(false);
  const signLangConsentRef = useRef(false);
  const [captionState, setCaptionState] = useState({
    text: "",
    score: null,
    sender: "",
    time: null,
  });
  const [showCaptions, setShowCaptions] = useState(true);

  const signLangSocketRef = useRef(null);
  const holisticRef = useRef(null);
  const signLangVideoRef = useRef(null);
  const signLangStreamRef = useRef(null);
  const signLangRafRef = useRef(null);
  const dataChannelsRef = useRef({});
  const lastSentRef = useRef(0);
  const scriptsLoadedRef = useRef(false);
  const processingRef = useRef(false);
  const lastPredictionRef = useRef({ label: "", score: 0, time: 0 });
  const stableCountRef = useRef(0);
  const lastEmitRef = useRef(0);

  const videoRef = useRef([]);
  // reference to the video elements

  let [videos, setVideos] = useState([]);

  const chatBodyRef = useRef(null);
  const chatEndRef = useRef(null);
  const [showParticipants, setShowParticipants] = useState(false);

  // TODO
  // if(isChrome() === false) {

  // }

  useEffect(() => {
    console.log("HELLO");
    getPermissions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    signLangEnabledRef.current = signLangEnabled;
  }, [signLangEnabled]);

  let getDislayMedia = () => {
    if (screen) {
      if (navigator.mediaDevices.getDisplayMedia) {
        navigator.mediaDevices
          .getDisplayMedia({ video: true, audio: true })
          .then(getDislayMediaSuccess)
          .catch((e) => console.log(e));
      }
    } else {
      // Switch back to camera when screen sharing is turned off
      getUserMedia();
    }
  };

  const getPermissions = async () => {
    //camera permission is there
    try {
      let videoGranted = false;
      let audioGranted = false;

      try {
        const videoPermission = await navigator.mediaDevices.getUserMedia({
          video: true,
        });
        if (videoPermission) {
          videoGranted = true;
          videoPermission.getTracks().forEach((track) => track.stop());
          console.log("Video permission granted");
        }
      } catch (err) {
        console.log("Video permission denied", err);
      }

      try {
        const audioPermission = await navigator.mediaDevices.getUserMedia({
          audio: true,
        });
        if (audioPermission) {
          audioGranted = true;
          audioPermission.getTracks().forEach((track) => track.stop());
          console.log("Audio permission granted");
        }
      } catch (err) {
        console.log("Audio permission denied", err);
      }

      setVideoAvailable(videoGranted);
      setAudioAvailable(audioGranted);
      setVideo(videoGranted);
      setAudio(audioGranted);

      if (videoGranted || audioGranted) {
        const userMediaStream = await navigator.mediaDevices.getUserMedia({
          video: videoGranted,
          audio: audioGranted,
        });

        if (userMediaStream) {
          window.localStream = userMediaStream;
          if (localVideoref.current) {
            localVideoref.current.srcObject = userMediaStream;
            localVideoref.current.play?.().catch(() => {});
            //stream ko video element me dal diya
          }
        }
      }
    } catch (error) {
      console.log(error);
    }

    // Check screen sharing availability separately (not dependent on camera/mic)
    try {
      if (navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia) {
        setScreenAvailable(true);
        console.log("✅ Screen sharing is available");
      } else {
        setScreenAvailable(false);
        console.log(
          "❌ Screen sharing is NOT available - getDisplayMedia not found",
        );
      }
    } catch (err) {
      console.log("Screen sharing check error:", err);
      setScreenAvailable(false);
    }
  };

  const SIGN_LANG_SEND_INTERVAL_MS = 100;
  const CAPTION_MIN_SCORE = 0.6;
  const CAPTION_STABLE_HITS = 2;
  const CAPTION_COOLDOWN_MS = 200;

  const loadScript = (src) =>
    new Promise((resolve, reject) => {
      const existing = document.querySelector(`script[data-src="${src}"]`);
      if (existing) {
        if (existing.getAttribute("data-loaded") === "true") {
          resolve();
        } else {
          existing.addEventListener("load", resolve, { once: true });
          existing.addEventListener("error", reject, { once: true });
        }
        return;
      }

      const script = document.createElement("script");
      script.src = src;
      script.async = true;
      script.defer = true;
      script.setAttribute("data-src", src);
      script.onload = () => {
        script.setAttribute("data-loaded", "true");
        resolve();
      };
      script.onerror = reject;
      document.body.appendChild(script);
    });

  const ensureMediapipeLoaded = async () => {
    if (scriptsLoadedRef.current) return;
    await loadScript(
      "https://cdn.jsdelivr.net/npm/@mediapipe/holistic/holistic.js",
    );
    await loadScript(
      "https://cdn.jsdelivr.net/npm/@mediapipe/camera_utils/camera_utils.js",
    );
    scriptsLoadedRef.current = true;
  };

  const flattenLandmarks = (arr = []) => {
    const out = [];
    for (const pt of arr) {
      out.push(pt.x, pt.y, pt.z);
    }
    return out;
  };

  const broadcastCaption = (payload) => {
    setCaptionState(payload);

    Object.entries(dataChannelsRef.current).forEach(([, channel]) => {
      if (!channel || channel.readyState !== "open") return;
      try {
        channel.send(JSON.stringify(payload));
      } catch (err) {
        console.log(err);
      }
    });
  };

  const requestSignLangConsent = () => {
    if (signLangConsentRef.current) return true;
    const confirmed = window.confirm(
      "Sign language translation needs camera access. Allow camera for sign language?",
    );
    if (!confirmed) return false;
    signLangConsentRef.current = true;
    return true;
  };

  const emitCaptionToCall = (label, score) => {
    const payload = {
      text: label,
      score: typeof score === "number" ? score : null,
      sender: username || "You",
      time: Date.now(),
      socketId: socketIdRef.current,
    };
    broadcastCaption(payload);
  };

  const setupSignLangSocket = () => {
    if (signLangSocketRef.current) return;
    const socket = io.connect(signLangServerUrl, { secure: false });
    socket.on("prediction", (data) => {
      if (!signLangEnabledRef.current) return;
      if (!data || data.error) return;
      const label = String(data.label || "").trim();
      const score = typeof data.score === "number" ? data.score : 0;
      if (!label || label === "unknown") return;
      if (score < CAPTION_MIN_SCORE) return;

      const now = Date.now();
      if (label === lastPredictionRef.current.label) {
        stableCountRef.current += 1;
      } else {
        stableCountRef.current = 1;
      }

      lastPredictionRef.current = { label, score, time: now };

      if (
        stableCountRef.current >= CAPTION_STABLE_HITS &&
        now - lastEmitRef.current >= CAPTION_COOLDOWN_MS
      ) {
        lastEmitRef.current = now;
        emitCaptionToCall(label, score);
      }
    });
    signLangSocketRef.current = socket;
  };

  const sendLandmarksToModel = (results) => {
    if (!signLangSocketRef.current) return;
    const now = performance.now();
    if (now - lastSentRef.current < SIGN_LANG_SEND_INTERVAL_MS) return;

    const hand = results.rightHandLandmarks || results.leftHandLandmarks || [];
    if (hand.length === 0) return;

    const face = results.faceLandmarks || [];

    let handVec = flattenLandmarks(hand).slice(0, 126);
    let faceVec = flattenLandmarks(face).slice(0, 1404);

    while (handVec.length < 126) handVec.push(0);
    while (faceVec.length < 1404) faceVec.push(0);

    const full = handVec.concat(faceVec).slice(0, 1530);

    signLangSocketRef.current.emit("landmark", {
      vector: full,
      normalized: false,
    });

    lastSentRef.current = now;
  };

  const ensureSignLangStream = async () => {
    const baseStream = window.localStream || localVideoref.current?.srcObject;
    const baseVideoTrack = baseStream?.getVideoTracks?.()[0];
    const shouldUseCameraStream = !screen && baseVideoTrack?.enabled;

    if (
      signLangStreamRef.current &&
      signLangStreamRef.current.getTracks().some((t) => t.readyState === "live")
    ) {
      return true;
    }

    if (shouldUseCameraStream) {
      const clonedTrack = baseVideoTrack.clone();
      const signStream = new MediaStream([clonedTrack]);
      signLangStreamRef.current = signStream;

      if (signLangVideoRef.current) {
        signLangVideoRef.current.srcObject = signStream;
        signLangVideoRef.current.play?.().catch(() => {});
      }

      return true;
    }

    if (!signLangConsentRef.current) {
      console.log("Sign language requires camera permission.");
      return false;
    }

    try {
      const cameraStream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: false,
      });

      signLangStreamRef.current = cameraStream;
      if (signLangVideoRef.current) {
        signLangVideoRef.current.srcObject = cameraStream;
        signLangVideoRef.current.play?.().catch(() => {});
      }

      return true;
    } catch (err) {
      console.log("Sign language camera request denied", err);
      return false;
    }
  };

  const startSignLang = async () => {
    if (!localVideoref.current) return;
    await ensureMediapipeLoaded();
    setupSignLangSocket();

    const streamReady = await ensureSignLangStream();
    if (!streamReady) return;

    if (!holisticRef.current) {
      const holistic = new window.Holistic({
        locateFile: (file) =>
          `https://cdn.jsdelivr.net/npm/@mediapipe/holistic/${file}`,
      });

      holistic.setOptions({
        modelComplexity: 0,
        smoothLandmarks: true,
        refineFaceLandmarks: false,
        minDetectionConfidence: 0.7,
        minTrackingConfidence: 0.7,
      });

      holistic.onResults((results) => {
        if (!signLangEnabledRef.current) return;
        sendLandmarksToModel(results);
      });

      holisticRef.current = holistic;
    }

    if (!signLangRafRef.current) {
      const processFrame = async () => {
        if (!signLangEnabledRef.current) {
          signLangRafRef.current = requestAnimationFrame(processFrame);
          return;
        }

        const signVideo = signLangVideoRef.current;
        if (!holisticRef.current || !signVideo) {
          signLangRafRef.current = requestAnimationFrame(processFrame);
          return;
        }

        if (processingRef.current || signVideo.readyState < 2) {
          signLangRafRef.current = requestAnimationFrame(processFrame);
          return;
        }

        processingRef.current = true;
        try {
          await holisticRef.current.send({ image: signVideo });
        } finally {
          processingRef.current = false;
        }

        signLangRafRef.current = requestAnimationFrame(processFrame);
      };

      signLangRafRef.current = requestAnimationFrame(processFrame);
    }
  };

  const stopSignLang = () => {
    if (signLangRafRef.current) {
      cancelAnimationFrame(signLangRafRef.current);
      signLangRafRef.current = null;
    }

    if (holisticRef.current) {
      holisticRef.current.close();
      holisticRef.current = null;
    }

    if (signLangStreamRef.current) {
      signLangStreamRef.current.getTracks().forEach((track) => track.stop());
      signLangStreamRef.current = null;
    }

    if (signLangVideoRef.current) {
      signLangVideoRef.current.srcObject = null;
    }

    if (signLangSocketRef.current) {
      signLangSocketRef.current.disconnect();
      signLangSocketRef.current = null;
    }
  };

  const setupDataChannel = (peerId, channel) => {
    dataChannelsRef.current[peerId] = channel;

    channel.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        if (!payload?.text) return;
        setCaptionState({
          text: payload.text || "",
          score: typeof payload.score === "number" ? payload.score : null,
          sender: payload.sender || "Guest",
          time: payload.time || Date.now(),
        });
      } catch (err) {
        console.log(err);
      }
    };

    channel.onclose = () => {
      if (dataChannelsRef.current[peerId] === channel) {
        delete dataChannelsRef.current[peerId];
      }
    };
  };

  const ensureDataChannel = (peerId) => {
    const existing = dataChannelsRef.current[peerId];
    if (existing && existing.readyState !== "closed") return existing;
    const channel = connections[peerId]?.createDataChannel("captions");
    if (channel) setupDataChannel(peerId, channel);
    return channel;
  };

  const setLocalTrackEnabled = (kind, enabled) => {
    const stream = window.localStream || localVideoref.current?.srcObject;
    if (!stream) return false;
    const tracks =
      kind === "video" ? stream.getVideoTracks() : stream.getAudioTracks();
    if (!tracks || tracks.length === 0) return false;
    tracks.forEach((track) => {
      track.enabled = enabled;
    });
    return true;
  };

  useEffect(() => {
    if (screen) return;
    const hasStream = window.localStream || localVideoref.current?.srcObject;

    if (!hasStream) {
      if (video || audio) {
        getUserMedia();
      }
      return;
    }

    setLocalTrackEnabled("video", video);
    setLocalTrackEnabled("audio", audio);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [video, audio, screen]);
  let getMedia = () => {
    const nextVideo = !!videoAvailable;
    const nextAudio = !!audioAvailable;
    setVideo(nextVideo);
    setAudio(nextAudio);
    getUserMedia({ video: nextVideo, audio: nextAudio });
    connectToSocketServer();
  };

  let getUserMediaSuccess = (stream) => {
    try {
      window.localStream.getTracks().forEach((track) => track.stop());
    } catch (e) {
      console.log(e);
    }

    window.localStream = stream;
    localVideoref.current.srcObject = stream;
    localVideoref.current.play?.().catch(() => {});

    const localVideoTrack = stream.getVideoTracks()[0];
    const localAudioTrack = stream.getAudioTracks()[0];
    if (localVideoTrack) setVideo(localVideoTrack.enabled);
    if (localAudioTrack) setAudio(localAudioTrack.enabled);

    // Add or replace tracks in all peer connections
    for (let id in connections) {
      if (id === socketIdRef.current) continue;

      // Replace video and audio tracks
      stream.getTracks().forEach((track) => {
        const sender = connections[id]
          .getSenders()
          .find((s) => s.track && s.track.kind === track.kind);

        if (sender) {
          sender.replaceTrack(track).catch((e) => console.log(e));
        } else {
          connections[id].addTrack(track, stream).catch((e) => console.log(e));
        }
      });

      connections[id].createOffer().then((description) => {
        console.log(description);
        connections[id]
          .setLocalDescription(description)
          .then(() => {
            socketRef.current.emit(
              "signal",
              id,
              JSON.stringify({ sdp: connections[id].localDescription }),
            );
          })
          .catch((e) => console.log(e));
      });
    }

    stream.getTracks().forEach(
      (track) =>
        (track.onended = () => {
          setVideo(false);
          setAudio(false);

          try {
            let tracks = localVideoref.current.srcObject.getTracks();
            tracks.forEach((track) => track.stop());
          } catch (e) {
            console.log(e);
          }

          let blackSilence = (...args) =>
            new MediaStream([black(...args), silence()]);
          window.localStream = blackSilence();
          localVideoref.current.srcObject = window.localStream;

          for (let id in connections) {
            connections[id].addStream(window.localStream);

            connections[id].createOffer().then((description) => {
              connections[id]
                .setLocalDescription(description)
                .then(() => {
                  socketRef.current.emit(
                    "signal",
                    id,
                    JSON.stringify({ sdp: connections[id].localDescription }),
                  );
                })
                .catch((e) => console.log(e));
            });
          }
        }),
    );
  };

  let getUserMedia = (constraintsOverride = null) => {
    if (screen) {
      // Skip if screen sharing is active
      return;
    }

    const requestVideo =
      typeof constraintsOverride?.video === "boolean"
        ? constraintsOverride.video
        : video;
    const requestAudio =
      typeof constraintsOverride?.audio === "boolean"
        ? constraintsOverride.audio
        : audio;

    if ((requestVideo && videoAvailable) || (requestAudio && audioAvailable)) {
      navigator.mediaDevices
        .getUserMedia({ video: requestVideo, audio: requestAudio })
        .then(getUserMediaSuccess)
        .catch((e) => console.log(e));
    } else {
      setLocalTrackEnabled("video", false);
      setLocalTrackEnabled("audio", false);
    }
  };

  let getDislayMediaSuccess = (stream) => {
    console.log("HERE - Screen share started");
    try {
      window.localStream.getTracks().forEach((track) => track.stop());
    } catch (e) {
      console.log(e);
    }

    window.localStream = stream;
    localVideoref.current.srcObject = stream;
    localVideoref.current.play?.().catch(() => {});

    // Replace tracks in all peer connections with screen share stream
    for (let id in connections) {
      if (id === socketIdRef.current) continue;

      // Replace video tracks with screen share
      const videoTrack = stream.getVideoTracks()[0];
      if (videoTrack) {
        const sender = connections[id]
          .getSenders()
          .find((s) => s.track && s.track.kind === "video");
        if (sender) {
          sender.replaceTrack(videoTrack).catch((e) => console.log(e));
        }
      }

      connections[id].createOffer().then((description) => {
        connections[id]
          .setLocalDescription(description)
          .then(() => {
            socketRef.current.emit(
              "signal",
              id,
              JSON.stringify({ sdp: connections[id].localDescription }),
            );
          })
          .catch((e) => console.log(e));
      });
    }

    stream.getTracks().forEach(
      (track) =>
        (track.onended = () => {
          console.log("Screen share track ended");
          setScreen(false);

          try {
            let tracks = localVideoref.current.srcObject.getTracks();
            tracks.forEach((track) => track.stop());
          } catch (e) {
            console.log(e);
          }

          let blackSilence = (...args) =>
            new MediaStream([black(...args), silence()]);
          window.localStream = blackSilence();
          localVideoref.current.srcObject = window.localStream;

          getUserMedia();
        }),
    );
  };

  let gotMessageFromServer = (fromId, message) => {
    var signal = JSON.parse(message);

    if (fromId !== socketIdRef.current) {
      if (signal.sdp) {
        connections[fromId]
          .setRemoteDescription(new RTCSessionDescription(signal.sdp))
          .then(() => {
            if (signal.sdp.type === "offer") {
              connections[fromId]
                .createAnswer()
                .then((description) => {
                  connections[fromId]
                    .setLocalDescription(description)
                    .then(() => {
                      socketRef.current.emit(
                        "signal",
                        fromId,
                        JSON.stringify({
                          sdp: connections[fromId].localDescription,
                        }),
                      );
                    })
                    .catch((e) => console.log(e));
                })
                .catch((e) => console.log(e));
            }
          })
          .catch((e) => console.log(e));
      }

      if (signal.ice) {
        connections[fromId]
          .addIceCandidate(new RTCIceCandidate(signal.ice))
          .catch((e) => console.log(e));
      }
    }
  };

  let connectToSocketServer = () => {
    socketRef.current = io.connect(server_url, { secure: false });

    socketRef.current.on("signal", gotMessageFromServer);

    socketRef.current.on("connect", () => {
      const roomId = meetingCode || window.location.pathname;
      socketRef.current.emit("join-call", roomId);
      socketIdRef.current = socketRef.current.id;

      socketRef.current.on("chat-message", addMessage);
      socketRef.current.on("user-left", (id) => {
        setVideos((videos) => videos.filter((video) => video.socketId !== id));
        if (connections[id]) {
          try {
            connections[id].close();
          } catch (err) {
            console.log(err);
          }
          delete connections[id];
        }
        if (dataChannelsRef.current[id]) {
          delete dataChannelsRef.current[id];
        }
        setMessages((prevMessages) => [
          ...prevMessages,
          {
            sender: "system",
            data: `${getDisplayName(id)} left the call`,
            time: Date.now(),
            type: "system",
          },
        ]);
      });

      socketRef.current.on("user-joined", (id, clients) => {
        setMessages((prevMessages) => [
          ...prevMessages,
          {
            sender: "system",
            data: `${getDisplayName(id)} joined the call`,
            time: Date.now(),
            type: "system",
          },
        ]);
        clients.forEach((socketListId) => {
          if (socketListId === socketIdRef.current) return;
          if (connections[socketListId]) return;

          connections[socketListId] = new RTCPeerConnection(
            peerConfigConnections,
          );
          // Wait for their ice candidate

          //ice == interactive connectivity establishment
          //use of ice candidate is to find the best path to connect peers

          connections[socketListId].onicecandidate = function (event) {
            if (event.candidate != null) {
              socketRef.current.emit(
                "signal",
                socketListId,

                JSON.stringify({ ice: event.candidate }),
              );
            }
          };

          // Wait for their video stream - use modern ontrack instead of deprecated onaddstream
          connections[socketListId].ontrack = (event) => {
            console.log("TRACK RECEIVED:", event.track.kind);
            const stream = event.streams[0];
            console.log("BEFORE:", videoRef.current);
            console.log("FINDING ID: ", socketListId);
            // check if we already have a video with this id
            let videoExists = videoRef.current.find(
              (video) => video.socketId === socketListId,
            );

            if (videoExists) {
              console.log("FOUND EXISTING");

              // Update the stream of the existing video
              setVideos((videos) => {
                const updatedVideos = videos.map((video) =>
                  video.socketId === socketListId
                    ? { ...video, stream: stream }
                    : video,
                );
                videoRef.current = updatedVideos;
                return updatedVideos;
              });
            } else {
              // Create a new video
              console.log("CREATING NEW");
              let newVideo = {
                socketId: socketListId,
                stream: stream,
                autoplay: true,
                playsinline: true,
              };
              // add it to the video array
              setVideos((videos) => {
                const updatedVideos = [...videos, newVideo];
                videoRef.current = updatedVideos;
                return updatedVideos;
              });
            }
          };

          connections[socketListId].ondatachannel = (event) => {
            setupDataChannel(socketListId, event.channel);
          };

          // Add the local video stream tracks
          if (window.localStream !== undefined && window.localStream !== null) {
            window.localStream.getTracks().forEach((track) => {
              connections[socketListId].addTrack(track, window.localStream);
            });
          } else {
            let blackSilence = (...args) =>
              new MediaStream([black(...args), silence()]);
            window.localStream = blackSilence();
            window.localStream.getTracks().forEach((track) => {
              connections[socketListId].addTrack(track, window.localStream);
            });
          }
        });

        if (id === socketIdRef.current) {
          for (let id2 in connections) {
            if (id2 === socketIdRef.current) continue;

            ensureDataChannel(id2);

            try {
              if (
                window.localStream !== undefined &&
                window.localStream !== null
              ) {
                window.localStream.getTracks().forEach((track) => {
                  const sender = connections[id2]
                    .getSenders()
                    .find((s) => s.track && s.track.kind === track.kind);

                  if (!sender) {
                    connections[id2].addTrack(track, window.localStream);
                  }
                });
              }
            } catch (err) {
              console.log(err);
            }

            connections[id2].createOffer().then((description) => {
              connections[id2]
                .setLocalDescription(description)
                .then(() => {
                  socketRef.current.emit(
                    "signal",
                    id2,
                    JSON.stringify({ sdp: connections[id2].localDescription }),
                  );
                })
                .catch((e) => console.log(e));
            });
          }
        }
      });
    });
  };

  let silence = () => {
    let ctx = new AudioContext();
    let oscillator = ctx.createOscillator();
    // set frequency to 0 to get silence
    let dst = oscillator.connect(ctx.createMediaStreamDestination());
    oscillator.start();
    ctx.resume();
    return Object.assign(dst.stream.getAudioTracks()[0], { enabled: false });
  };
  let black = ({ width = 640, height = 480 } = {}) => {
    let canvas = Object.assign(document.createElement("canvas"), {
      width,
      height,
    });
    canvas.getContext("2d").fillRect(0, 0, width, height);
    let stream = canvas.captureStream();
    return Object.assign(stream.getVideoTracks()[0], { enabled: false });
  };

  let handleVideo = () => {
    if (!videoAvailable) {
      alert("Camera permission is not available.");
      return;
    }
    const next = !video;
    setVideo(next);
    if (!screen) {
      const updated = setLocalTrackEnabled("video", next);
      if (!updated && next) {
        getUserMedia({ video: next, audio });
      }
    }
  };
  let handleAudio = () => {
    if (!audioAvailable) {
      alert("Microphone permission is not available.");
      return;
    }
    const next = !audio;
    setAudio(next);
    if (!screen) {
      const updated = setLocalTrackEnabled("audio", next);
      if (!updated && next) {
        getUserMedia({ video, audio: next });
      }
    }
  };

  useEffect(() => {
    if (screen !== undefined) {
      getDislayMedia();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen]);

  useEffect(() => {
    if (signLangEnabled) {
      startSignLang();
    } else {
      stopSignLang();
    }

    return () => {
      stopSignLang();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signLangEnabled]);

  useEffect(() => {
    if (!signLangEnabled) return;
    if (!screen) return;

    if (!requestSignLangConsent()) return;

    if (signLangStreamRef.current) {
      signLangStreamRef.current.getTracks().forEach((track) => track.stop());
      signLangStreamRef.current = null;
    }

    if (signLangVideoRef.current) {
      signLangVideoRef.current.srcObject = null;
    }

    startSignLang();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen]);

  useEffect(() => {
    return () => {
      stopSignLang();

      try {
        Object.values(connections).forEach((pc) => {
          try {
            pc.ontrack = null;
            pc.onicecandidate = null;
            pc.close();
          } catch (err) {
            console.log(err);
          }
        });
      } catch (err) {
        console.log(err);
      }

      connections = {};

      if (socketRef.current) {
        socketRef.current.disconnect();
      }

      try {
        const stream = localVideoref.current?.srcObject;
        stream?.getTracks?.().forEach((track) => track.stop());
      } catch (err) {
        console.log(err);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  let handleScreen = () => {
    if (!screenAvailable) {
      alert(
        "Screen sharing is not available in your browser. Please use Chrome, Edge, or Firefox.",
      );
      console.log("Screen sharing not available in this browser");
      return;
    }
    console.log("Screen Available state:", screenAvailable);
    console.log("Current screen state:", screen);
    console.log(
      "navigator.mediaDevices.getDisplayMedia exists:",
      !!navigator.mediaDevices?.getDisplayMedia,
    );
    console.log("Toggling screen to:", !screen);
    setScreen(!screen);
  };

  const handleSignLangToggle = () => {
    if (!signLangEnabled) {
      const baseStream = window.localStream || localVideoref.current?.srcObject;
      const baseVideoTrack = baseStream?.getVideoTracks?.()[0];
      const hasCameraForSignLang = !screen && baseVideoTrack?.enabled;

      if (!hasCameraForSignLang) {
        if (!requestSignLangConsent()) return;
      }
    }

    setSignLangEnabled((prev) => {
      if (prev) {
        signLangConsentRef.current = false;
      }
      return !prev;
    });
  };

  const handleCaptionToggle = () => {
    setShowCaptions((prev) => !prev);
  };

  let handleEndCall = () => {
    try {
      let tracks = localVideoref.current.srcObject.getTracks();
      tracks.forEach((track) => track.stop());
    } catch (err) {
      console.log(err);
    }
    window.location.href = "/";
  };

  let closeChat = () => {
    setModal(false);
  };

  const toggleChatPanel = () => {
    setShowParticipants(false);
    setModal((prev) => {
      if (!prev) {
        setNewMessages(0);
      }
      return !prev;
    });
  };

  const toggleParticipantsPanel = () => {
    setModal(false);
    setShowParticipants((prev) => !prev);
  };

  const addMessage = (data, sender, socketIdSender) => {
    setMessages((prevMessages) => [
      ...prevMessages,
      { sender: sender, data: data, time: Date.now() },
    ]);
    if (socketIdSender !== socketIdRef.current) {
      setNewMessages((prevNewMessages) => prevNewMessages + 1);
    }
  };

  let sendMessage = () => {
    if (!message.trim()) return;
    socketRef.current.emit("chat-message", message.trim(), username || "You");
    setMessage("");

    // this.setState({ message: "", sender: username })
  };

  let connect = () => {
    setAskForUsername(false);
    getMedia();

    // Extract meeting code from URL and add to history
    try {
      console.log("Adding to history - Meeting code:", meetingCode);
      addToUserHistory(meetingCode);
    } catch (err) {
      console.log("Error adding to history:", err);
    }
  };

  const formatTime = (time) => {
    if (!time) return "";
    return new Date(time).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const getDisplayName = (socketId) => {
    if (!socketId) return "Guest";
    return `Guest ${socketId.slice(0, 4)}`;
  };

  const participantItems = useMemo(() => {
    const local = {
      id: "local",
      name: username || "You",
      isYou: true,
      micOn: audio,
      camOn: video,
      active: audio || screen,
    };

    const remotes = videos.map((item) => {
      const audioTrack = item.stream?.getAudioTracks?.()[0];
      const videoTrack = item.stream?.getVideoTracks?.()[0];
      return {
        id: item.socketId,
        name: getDisplayName(item.socketId),
        isYou: false,
        micOn: audioTrack ? audioTrack.enabled : false,
        camOn: videoTrack ? videoTrack.enabled : false,
        active: audioTrack ? audioTrack.enabled : false,
      };
    });

    return [local, ...remotes];
  }, [audio, screen, username, video, videos]);

  useEffect(() => {
    if (!showModal) return;
    const el = chatBodyRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, showModal]);

  useEffect(() => {
    if (askForUsername) return;
    if (!meetingCode) return;
    try {
      const cached = localStorage.getItem(`chatHistory:${meetingCode}`);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed)) {
          setMessages(parsed);
        }
      }
    } catch (err) {
      console.log("Failed to load chat history", err);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [askForUsername, meetingCode]);

  useEffect(() => {
    if (askForUsername) return;
    const stream = window.localStream;
    if (stream && localVideoref.current) {
      localVideoref.current.srcObject = stream;
      localVideoref.current.play?.().catch(() => {});
    }
  }, [askForUsername]);

  useEffect(() => {
    if (!meetingCode) return;
    try {
      localStorage.setItem(
        `chatHistory:${meetingCode}`,
        JSON.stringify(messages),
      );
    } catch (err) {
      console.log("Failed to store chat history", err);
    }
  }, [meetingCode, messages]);

  return (
    <div>
      {askForUsername === true ? (
        <div className={styles.lobbyContainer}>
          <h2 className={styles.lobbyTitle}>Enter the lobby</h2>
          <p className={styles.lobbyHint}>
            Check your camera and microphone before joining.
          </p>
          <TextField
            id="outlined-basic"
            label="Username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            variant="outlined"
            className={styles.lobbyInput}
          />
          <Button
            variant="contained"
            onClick={connect}
            className={styles.lobbyButton}
          >
            Connect
          </Button>

          <div className={styles.lobbyPreview}>
            <video
              ref={localVideoref}
              autoPlay
              muted
              playsInline
              className={styles.lobbyPreviewVideo}
            ></video>
          </div>
        </div>
      ) : (
        <div className={styles.meetVideoContainer}>
          <div
            className={`${styles.meetStage} ${showModal || showParticipants ? styles.stageWithPanel : ""}`}
          >
            <video
              ref={signLangVideoRef}
              className={styles.signLangVideo}
              autoPlay
              muted
              playsInline
            />
            <div
              className={`${styles.videoGrid} ${
                videos.length + 1 === 1
                  ? styles.gridSingle
                  : videos.length + 1 === 2
                    ? styles.gridDouble
                    : styles.gridMulti
              } ${showModal ? styles.gridWithChat : ""} ${
                showParticipants ? styles.gridWithParticipants : ""
              }`}
            >
              <div
                className={`${styles.videoTile} ${
                  audio || screen ? styles.activeTile : ""
                }`}
              >
                <video
                  className={styles.videoTileVideo}
                  ref={localVideoref}
                  autoPlay
                  muted
                  playsInline
                ></video>
                {!video && (
                  <div className={styles.videoTileOverlay}>
                    <div className={styles.avatarCircle}>
                      {(username || "You").charAt(0).toUpperCase()}
                    </div>
                    <div className={styles.overlayName}>
                      {username || "You"}
                    </div>
                    <div className={styles.overlayStatus}>
                      <span className={styles.statusChip}>
                        {audio ? <MicIcon /> : <MicOffIcon />}
                      </span>
                      <span className={styles.statusChip}>
                        {video ? <VideocamIcon /> : <VideocamOffIcon />}
                      </span>
                    </div>
                  </div>
                )}
                <div className={styles.tileFooter}>
                  <div className={styles.tileName}>{username || "You"}</div>
                  <div className={styles.tileStatus}>
                    {audio ? <MicIcon /> : <MicOffIcon />}
                    {video ? <VideocamIcon /> : <VideocamOffIcon />}
                  </div>
                </div>
              </div>

              {videos.map((videoItem) => {
                const audioTrack = videoItem.stream?.getAudioTracks?.()[0];
                const videoTrack = videoItem.stream?.getVideoTracks?.()[0];
                const remoteVideoOn = videoTrack ? videoTrack.enabled : false;
                const remoteAudioOn = audioTrack ? audioTrack.enabled : false;

                return (
                  <div key={videoItem.socketId} className={styles.videoTile}>
                    <video
                      data-socket={videoItem.socketId}
                      className={styles.videoTileVideo}
                      ref={(ref) => {
                        if (ref && videoItem.stream) {
                          ref.srcObject = videoItem.stream;
                        }
                      }}
                      autoPlay
                      playsInline
                    ></video>
                    {!remoteVideoOn && (
                      <div className={styles.videoTileOverlay}>
                        <div className={styles.avatarCircle}>
                          {getDisplayName(videoItem.socketId)
                            .charAt(0)
                            .toUpperCase()}
                        </div>
                        <div className={styles.overlayName}>
                          {getDisplayName(videoItem.socketId)}
                        </div>
                        <div className={styles.overlayStatus}>
                          <span className={styles.statusChip}>
                            {remoteAudioOn ? <MicIcon /> : <MicOffIcon />}
                          </span>
                          <span className={styles.statusChip}>
                            {remoteVideoOn ? (
                              <VideocamIcon />
                            ) : (
                              <VideocamOffIcon />
                            )}
                          </span>
                        </div>
                      </div>
                    )}
                    <div className={styles.tileFooter}>
                      <div className={styles.tileName}>
                        {getDisplayName(videoItem.socketId)}
                      </div>
                      <div className={styles.tileStatus}>
                        {remoteAudioOn ? <MicIcon /> : <MicOffIcon />}
                        {remoteVideoOn ? <VideocamIcon /> : <VideocamOffIcon />}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {showCaptions && captionState.text && (
              <div className={styles.captionOverlay}>
                <div className={styles.captionBubble}>
                  <span className={styles.captionSender}>
                    {captionState.sender || "Guest"}
                  </span>
                  <span className={styles.captionText}>
                    {captionState.text}
                  </span>
                  {typeof captionState.score === "number" && (
                    <span className={styles.captionScore}>
                      {Math.round(captionState.score * 100)}%
                    </span>
                  )}
                </div>
              </div>
            )}

            <aside
              className={`${styles.panel} ${styles.chatRoom} ${
                showModal ? styles.panelOpen : styles.panelClosed
              }`}
            >
              <div className={styles.panelHeader}>
                <div>
                  <h3>Chat</h3>
                  <p>{videos.length + 1} participants</p>
                </div>
                <Button
                  size="small"
                  onClick={closeChat}
                  className={styles.panelClose}
                >
                  Close
                </Button>
              </div>

              <div className={styles.panelBody} ref={chatBodyRef}>
                {messages.length !== 0 ? (
                  messages.map((item, index) => {
                    const isSystem =
                      item.sender === "system" || item.type === "system";
                    const isSameSender =
                      index > 0 && messages[index - 1].sender === item.sender;

                    if (isSystem) {
                      return (
                        <div className={styles.systemMessage} key={index}>
                          <span>{item.data}</span>
                          <span className={styles.systemTime}>
                            {formatTime(item.time)}
                          </span>
                        </div>
                      );
                    }

                    return (
                      <div
                        className={`${styles.messageGroup} ${
                          item.sender === (username || "You")
                            ? styles.messageMine
                            : styles.messageTheirs
                        }`}
                        key={index}
                      >
                        {!isSameSender && (
                          <div className={styles.messageHeader}>
                            <div className={styles.messageAvatar}>
                              {item.sender.charAt(0).toUpperCase()}
                            </div>
                            <div>
                              <p className={styles.messageSender}>
                                {item.sender}
                              </p>
                              <p className={styles.messageTime}>
                                {formatTime(item.time)}
                              </p>
                            </div>
                          </div>
                        )}
                        <div className={styles.messageBubble}>{item.data}</div>
                      </div>
                    );
                  })
                ) : (
                  <div className={styles.emptyState}>
                    No messages yet. Say hello 👋
                  </div>
                )}
                {message.trim().length > 0 && (
                  <div className={styles.typingIndicator}>Typing…</div>
                )}
                <div ref={chatEndRef} />
              </div>

              <div className={styles.chatInputBar}>
                <TextField
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  id="outlined-basic"
                  label="Type a message"
                  variant="outlined"
                  size="small"
                  fullWidth
                />
                <Button variant="contained" onClick={sendMessage}>
                  Send
                </Button>
              </div>
            </aside>

            <aside
              className={`${styles.panel} ${styles.participantsPanel} ${
                showParticipants ? styles.panelOpen : styles.panelClosed
              }`}
            >
              <div className={styles.panelHeader}>
                <div>
                  <h3>Participants</h3>
                  <p>{participantItems.length} in call</p>
                </div>
                <Button
                  size="small"
                  onClick={() => setShowParticipants(false)}
                  className={styles.panelClose}
                >
                  Close
                </Button>
              </div>
              <div className={styles.panelBody}>
                {participantItems.map((participant) => (
                  <div
                    key={participant.id}
                    className={`${styles.participantRow} ${
                      participant.isYou ? styles.participantYou : ""
                    } ${participant.active ? styles.participantActive : ""}`}
                  >
                    <div className={styles.participantAvatar}>
                      {participant.name.charAt(0).toUpperCase()}
                    </div>
                    <div className={styles.participantInfo}>
                      <p>{participant.name}</p>
                      <span>{participant.isYou ? "You" : "Guest"}</span>
                    </div>
                    <div className={styles.participantStatus}>
                      {participant.micOn ? <MicIcon /> : <MicOffIcon />}
                      {participant.camOn ? (
                        <VideocamIcon />
                      ) : (
                        <VideocamOffIcon />
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </aside>
          </div>

          <div className={styles.controlBar}>
            <div className={styles.controlGroup}>
              <div className={styles.controlButtonWrap}>
                <IconButton
                  onClick={handleVideo}
                  title={video ? "Turn camera off" : "Turn camera on"}
                  className={`${styles.controlButton} ${
                    video ? styles.controlButtonActive : ""
                  }`}
                >
                  {video ? <VideocamIcon /> : <VideocamOffIcon />}
                </IconButton>
                <span className={styles.controlLabel}>Camera</span>
              </div>

              <div className={styles.controlButtonWrap}>
                <IconButton
                  onClick={handleAudio}
                  title={audio ? "Mute microphone" : "Unmute microphone"}
                  className={`${styles.controlButton} ${
                    audio ? styles.controlButtonActive : ""
                  }`}
                >
                  {audio ? <MicIcon /> : <MicOffIcon />}
                </IconButton>
                <span className={styles.controlLabel}>Mic</span>
              </div>

              <div className={styles.controlButtonWrap}>
                <IconButton
                  onClick={handleScreen}
                  className={`${styles.controlButton} ${
                    screen ? styles.controlButtonActive : ""
                  }`}
                  title={
                    screenAvailable
                      ? "Click to share screen"
                      : "Screen sharing not available"
                  }
                >
                  {screen ? <StopScreenShareIcon /> : <ScreenShareIcon />}
                </IconButton>
                <span className={styles.controlLabel}>Share</span>
              </div>

              <div className={styles.controlButtonWrap}>
                <IconButton
                  onClick={toggleChatPanel}
                  title={showModal ? "Close chat" : "Open chat"}
                  className={`${styles.controlButton} ${
                    showModal ? styles.controlButtonActive : ""
                  }`}
                >
                  <Badge badgeContent={newMessages} max={999} color="error">
                    <ChatIcon />
                  </Badge>
                </IconButton>
                <span className={styles.controlLabel}>Chat</span>
              </div>

              <div className={styles.controlButtonWrap}>
                <IconButton
                  onClick={handleSignLangToggle}
                  title={
                    signLangEnabled
                      ? "Turn sign language translation off"
                      : "Turn sign language translation on"
                  }
                  className={`${styles.controlButton} ${
                    signLangEnabled ? styles.controlButtonActive : ""
                  }`}
                >
                  <span className={styles.signLangIcon}>SL</span>
                </IconButton>
                <span className={styles.controlLabel}>Sign</span>
              </div>

              <div className={styles.controlButtonWrap}>
                <IconButton
                  onClick={handleCaptionToggle}
                  title={showCaptions ? "Hide captions" : "Show captions"}
                  className={`${styles.controlButton} ${
                    showCaptions ? styles.controlButtonActive : ""
                  }`}
                >
                  <span className={styles.captionIcon}>CC</span>
                </IconButton>
                <span className={styles.controlLabel}>Captions</span>
              </div>

              <div className={styles.controlButtonWrap}>
                <IconButton
                  onClick={toggleParticipantsPanel}
                  title={
                    showParticipants
                      ? "Close participants"
                      : "Open participants"
                  }
                  className={`${styles.controlButton} ${
                    showParticipants ? styles.controlButtonActive : ""
                  }`}
                >
                  <Badge badgeContent={participantItems.length} color="error">
                    <span className={styles.participantIcon}>👥</span>
                  </Badge>
                </IconButton>
                <span className={styles.controlLabel}>People</span>
              </div>
            </div>

            <div className={styles.controlGroup}>
              <div className={styles.controlButtonWrap}>
                <IconButton
                  onClick={handleEndCall}
                  title="Leave call"
                  className={`${styles.controlButton} ${styles.controlButtonDanger}`}
                >
                  <CallEndIcon />
                </IconButton>
                <span className={styles.controlLabel}>Leave</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
