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
import { useEffect, useRef, useState } from "react";
import styles from "../../styles/videoComponent.module.css";

const Lobby = ({ meetingCode, username, onJoin }) => {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const pendingGUMRef = useRef(null); // Dedup concurrent getUserMedia (StrictMode)
  const [previewVideo, setPreviewVideo] = useState(true);
  const [previewAudio, setPreviewAudio] = useState(true);
  const [guestName, setGuestName] = useState(username || "");

  // Start camera preview
  // Uses a shared ref to ensure only ONE getUserMedia call is made even when
  // React StrictMode double-mounts (two concurrent calls can deadlock on Windows).
  useEffect(() => {
    let active = true;

    const startPreview = async () => {
      // Reuse existing stream if available (StrictMode remount after cleanup no-op)
      if (streamRef.current) {
        if (videoRef.current) {
          videoRef.current.srcObject = streamRef.current;
        }
        return;
      }

      try {
        // Deduplicate: reuse in-flight getUserMedia promise
        if (!pendingGUMRef.current) {
          pendingGUMRef.current = navigator.mediaDevices.getUserMedia({
            video: true,
            audio: true,
          });
        }

        const stream = await pendingGUMRef.current;
        pendingGUMRef.current = null;

        if (!active) return; // StrictMode's first mount — let remount handle it

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
      // On StrictMode's fake unmount, streamRef is still null (getUserMedia is async)
      // so this is a no-op. On real unmount, it properly stops tracks.
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
    };
  }, []);

  // Toggle preview toggles
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
    // Stop preview stream (the actual call will create its own)
    streamRef.current?.getTracks().forEach((t) => t.stop());
    onJoin(guestName || "Guest");
  };

  return (
    <div className={styles.lobbyContainer}>
      <div className={styles.lobbyCard}>
        <Typography variant="h5" sx={{ color: "#fff", mb: 2, fontWeight: 600 }}>
          Ready to join?
        </Typography>

        <Typography variant="body2" sx={{ color: "#aaa", mb: 3 }}>
          Meeting: <strong style={{ color: "#FF9839" }}>{meetingCode}</strong>
        </Typography>

        {/* Video preview */}
        <div className={styles.lobbyPreview}>
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className={styles.lobbyVideo}
            style={{ transform: "scaleX(-1)" }}
          />

          <div className={styles.lobbyPreviewControls}>
            <Tooltip title={previewVideo ? "Camera off" : "Camera on"}>
              <IconButton
                onClick={togglePreviewVideo}
                size="small"
                sx={{ color: "#fff" }}
              >
                {previewVideo ? <Videocam /> : <VideocamOff />}
              </IconButton>
            </Tooltip>
            <Tooltip title={previewAudio ? "Mute" : "Unmute"}>
              <IconButton
                onClick={togglePreviewAudio}
                size="small"
                sx={{ color: "#fff" }}
              >
                {previewAudio ? <Mic /> : <MicOff />}
              </IconButton>
            </Tooltip>
          </div>
        </div>

        {/* Name input (for guests) */}
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
              "& .MuiInputBase-root": { color: "#fff" },
              "& .MuiInputLabel-root": { color: "#aaa" },
              "& .MuiOutlinedInput-notchedOutline": { borderColor: "#444" },
            }}
          />
        )}

        <Box sx={{ display: "flex", gap: 2, mt: 2 }}>
          <Button
            variant="contained"
            onClick={handleJoin}
            fullWidth
            sx={{
              background: "#FF9839",
              color: "#000",
              fontWeight: 600,
              "&:hover": { background: "#e88830" },
            }}
          >
            Join Now
          </Button>
        </Box>
      </div>
    </div>
  );
};

export default Lobby;
