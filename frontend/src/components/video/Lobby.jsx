/**
 * Lobby — Pre-join screen for camera/mic preview and meeting setup.
 */
import { Mic, MicOff, Videocam, VideocamOff } from "@mui/icons-material";
import {
  Box,
  Button,
  IconButton,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import { motion, useReducedMotion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import styles from "../../styles/videoComponent.module.css";
import { fadeUpTransition, fadeUpVariants } from "../../utils/motion";

const Lobby = ({ meetingCode, username, onJoin }) => {
  const reduced = useReducedMotion();
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const pendingGUMRef = useRef(null);
  const [previewVideo, setPreviewVideo] = useState(true);
  const [previewAudio, setPreviewAudio] = useState(true);
  const [guestName, setGuestName] = useState(username || "");

  useEffect(() => {
    let active = true;

    const startPreview = async () => {
      if (streamRef.current) {
        if (videoRef.current) {
          videoRef.current.srcObject = streamRef.current;
        }
        return;
      }

      try {
        if (!pendingGUMRef.current) {
          pendingGUMRef.current = navigator.mediaDevices.getUserMedia({
            video: true,
            audio: true,
          });
        }

        const stream = await pendingGUMRef.current;
        pendingGUMRef.current = null;

        if (!active) return;

        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch(() => {});
        }
      } catch (err) {
        pendingGUMRef.current = null;
        console.warn("[Lobby] Camera preview failed:", err.message);
      }
    };

    startPreview();

    return () => {
      active = false;
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
    };
  }, []);

  const togglePreviewVideo = () => {
    const track = streamRef.current?.getVideoTracks()[0];
    if (track) {
      track.enabled = !track.enabled;
      setPreviewVideo(track.enabled);
    }
  };

  const togglePreviewAudio = () => {
    const track = streamRef.current?.getAudioTracks()[0];
    if (track) {
      track.enabled = !track.enabled;
      setPreviewAudio(track.enabled);
    }
  };

  const handleJoin = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    onJoin(guestName || "Guest");
  };

  return (
    <div className={styles.lobbyContainer} role="main">
      <motion.div
        className={styles.lobbyCard}
        variants={fadeUpVariants}
        initial={reduced ? false : "initial"}
        animate="animate"
        transition={fadeUpTransition(0.05, reduced)}
      >
        <Typography
          component="h1"
          variant="h5"
          className={styles.lobbyTitle}
          sx={{ color: "#fff", mb: 2, fontWeight: 700, fontFamily: "inherit" }}
        >
          Ready to join?
        </Typography>

        <Typography variant="body2" sx={{ color: "var(--color-text-muted)", mb: 3 }}>
          Meeting:{" "}
          <strong style={{ color: "#ff9839" }} aria-label={`Meeting code ${meetingCode}`}>
            {meetingCode}
          </strong>
        </Typography>

        <motion.div
          className={styles.lobbyPreview}
          aria-label="Camera preview"
          initial={reduced ? false : { opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={fadeUpTransition(0.12, reduced)}
        >
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className={styles.lobbyVideo}
            style={{ transform: "scaleX(-1)" }}
          />

          <div className={styles.lobbyPreviewControls}>
            <Tooltip title={previewVideo ? "Turn off camera" : "Turn on camera"}>
              <IconButton
                onClick={togglePreviewVideo}
                size="small"
                sx={{ color: "#fff" }}
                aria-label={previewVideo ? "Turn off camera" : "Turn on camera"}
                aria-pressed={previewVideo}
              >
                {previewVideo ? <Videocam /> : <VideocamOff />}
              </IconButton>
            </Tooltip>
            <Tooltip title={previewAudio ? "Mute microphone" : "Unmute microphone"}>
              <IconButton
                onClick={togglePreviewAudio}
                size="small"
                sx={{ color: "#fff" }}
                aria-label={previewAudio ? "Mute microphone" : "Unmute microphone"}
                aria-pressed={previewAudio}
              >
                {previewAudio ? <Mic /> : <MicOff />}
              </IconButton>
            </Tooltip>
          </div>
        </motion.div>

        {!username && (
          <TextField
            label="Your name"
            value={guestName}
            onChange={(e) => setGuestName(e.target.value)}
            size="small"
            fullWidth
            sx={{
              mt: 2,
              mb: 2,
              "& .MuiOutlinedInput-root": {
                color: "#f1f5f9",
                borderRadius: "12px",
                background: "rgba(15,23,42,0.5)",
                "& fieldset": { borderColor: "rgba(148,163,184,0.22)" },
                "&:hover fieldset": { borderColor: "rgba(99,102,241,0.4)" },
                "&.Mui-focused fieldset": { borderColor: "#6366f1" },
              },
              "& .MuiInputLabel-root": { color: "rgba(148,163,184,0.6)" },
            }}
          />
        )}

        <p className={styles.lobbyHint}>
          Check your camera and microphone before joining
        </p>

        <Box sx={{ display: "flex", gap: 2, mt: 2, width: "100%" }}>
          <Button
            variant="contained"
            onClick={handleJoin}
            fullWidth
            aria-label="Join meeting now"
            sx={{
              py: 1.2,
              borderRadius: "12px",
              background: "linear-gradient(135deg, #ff9839, #f97316)",
              color: "#0f172a",
              fontWeight: 700,
              boxShadow: "0 8px 24px rgba(255,152,57,0.25)",
              "&:hover": {
                background: "linear-gradient(135deg, #f97316, #ea580c)",
                boxShadow: "0 12px 28px rgba(255,152,57,0.32)",
              },
            }}
          >
            Join Now
          </Button>
        </Box>
      </motion.div>
    </div>
  );
};

export default Lobby;
