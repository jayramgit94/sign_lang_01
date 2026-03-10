/**
 * VideoTile — Individual video tile with name label and status indicators.
 *
 * IMPORTANT: The <video> element is ALWAYS mounted (never conditionally rendered)
 * so that srcObject survives video on/off toggle cycles without losing the stream.
 */
import MicOffIcon from "@mui/icons-material/MicOff";
import React, { useEffect, useRef } from "react";
import styles from "../../styles/videoComponent.module.css";
import { getInitials } from "../../utils/helpers";

const VideoTile = ({
  stream,
  username,
  muted = false,
  isLocal = false,
  videoEnabled = true,
  audioEnabled = true,
}) => {
  const videoRef = useRef(null);

  // Set srcObject when stream changes.
  // We intentionally do NOT clear srcObject in cleanup — React StrictMode's
  // mount→cleanup→remount cycle would blank the video. The browser handles
  // cleanup automatically when the element is removed from the DOM.
  useEffect(() => {
    const videoEl = videoRef.current;
    if (!videoEl) return;

    if (stream) {
      videoEl.srcObject = stream;
      videoEl.play().catch(() => {
        // Retry once — some browsers need a tick after srcObject assignment
        setTimeout(() => {
          if (videoEl.srcObject === stream) {
            videoEl.play().catch(() => {});
          }
        }, 150);
      });
    } else {
      videoEl.srcObject = null;
    }
  }, [stream]);

  const hasVideo = stream && stream.getVideoTracks().length > 0 && videoEnabled;

  return (
    <div className={styles.videoTile}>
      {/* Video element is ALWAYS mounted — just hidden when video is off */}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={muted}
        className={styles.videoElement}
        style={{
          transform: isLocal ? "scaleX(-1)" : "none",
          display: hasVideo ? "block" : "none",
        }}
      />

      {/* Avatar placeholder when video is off */}
      {!hasVideo && (
        <div className={styles.avatarPlaceholder}>
          <div className={styles.avatarCircle}>{getInitials(username)}</div>
        </div>
      )}

      {/* Name label */}
      <div className={styles.nameLabel}>
        {!audioEnabled && (
          <MicOffIcon sx={{ fontSize: 14, color: "#ff4444", mr: 0.5 }} />
        )}
        <span>{username || "Unknown"}</span>
      </div>
    </div>
  );
};

export default React.memo(VideoTile);
