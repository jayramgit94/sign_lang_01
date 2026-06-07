/**
 * VideoTile — Individual video tile with name label and status indicators.
 *
 * IMPORTANT: The <video> element is ALWAYS mounted (never conditionally rendered)
 * so that srcObject survives video on/off toggle cycles without losing the stream.
 */
import MicOffIcon from "@mui/icons-material/MicOff";
import PushPinIcon from "@mui/icons-material/PushPin";
import PushPinOutlinedIcon from "@mui/icons-material/PushPinOutlined";
import VideocamOffIcon from "@mui/icons-material/VideocamOff";
import { IconButton, Tooltip } from "@mui/material";
import { motion, useReducedMotion } from "framer-motion";
import React, { useEffect, useRef } from "react";
import useAudioLevel from "../../hooks/useAudioLevel";
import styles from "../../styles/videoComponent.module.css";
import { getInitials } from "../../utils/helpers";
import { tileTransition, tileVariants } from "../../utils/motion";

const TILE_VARIANT_CLASS = {
  default: "",
  spotlight: "tileSpotlight",
  thumbnail: "tileThumbnail",
};

const VideoTile = ({
  tileId,
  stream,
  username,
  muted = false,
  isLocal = false,
  videoEnabled = true,
  audioEnabled = true,
  isPinned = false,
  onPinToggle,
  onAudioLevel,
  variant = "default",
}) => {
  const reduced = useReducedMotion();
  const videoRef = useRef(null);
  const isSpeaking = useAudioLevel(
    stream,
    audioEnabled && !muted,
    tileId,
    onAudioLevel,
  );

  useEffect(() => {
    const videoEl = videoRef.current;
    if (!videoEl) return;

    if (stream) {
      videoEl.srcObject = stream;
      videoEl.play().catch(() => {
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
  const variantClass = TILE_VARIANT_CLASS[variant] || "";
  const displayName = username || "Unknown";

  return (
    <motion.article
      layout={!reduced}
      layoutId={undefined}
      variants={tileVariants}
      initial={reduced ? false : "initial"}
      animate="animate"
      exit={reduced ? undefined : "exit"}
      transition={tileTransition(reduced)}
      className={[
        styles.videoTile,
        variantClass ? styles[variantClass] : "",
        isPinned ? styles.tilePinned : "",
        isSpeaking ? styles.speakingTile : "",
      ]
        .filter(Boolean)
        .join(" ")}
      aria-label={`${displayName}${isSpeaking ? ", speaking" : ""}${!audioEnabled ? ", muted" : ""}${!videoEnabled ? ", camera off" : ""}`}
    >
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
        aria-hidden={!hasVideo}
      />

      {!hasVideo && (
        <div className={styles.avatarPlaceholder} aria-hidden="true">
          <div className={styles.avatarCircle}>{getInitials(displayName)}</div>
        </div>
      )}

      {onPinToggle && (
        <div className={styles.tileActions}>
          <Tooltip title={isPinned ? "Unpin" : "Pin participant"}>
            <IconButton
              size="small"
              onClick={onPinToggle}
              className={styles.pinBtn}
              aria-label={
                isPinned ? `Unpin ${displayName}` : `Pin ${displayName}`
              }
              aria-pressed={isPinned}
            >
              {isPinned ? (
                <PushPinIcon sx={{ fontSize: 16 }} />
              ) : (
                <PushPinOutlinedIcon sx={{ fontSize: 16 }} />
              )}
            </IconButton>
          </Tooltip>
        </div>
      )}

      <div className={styles.nameLabel}>
        {!videoEnabled && (
          <VideocamOffIcon
            sx={{ fontSize: 14, color: "#fbbf24", flexShrink: 0 }}
            aria-hidden
          />
        )}
        {!audioEnabled && (
          <MicOffIcon
            sx={{ fontSize: 14, color: "#f87171", flexShrink: 0 }}
            aria-hidden
          />
        )}
        <span className={styles.nameLabelText}>{displayName}</span>
        {isSpeaking && (
          <span className={styles.speakingBadge} aria-hidden>
            Speaking
          </span>
        )}
        {isPinned && (
          <span className={styles.pinnedBadge} aria-hidden>
            Pinned
          </span>
        )}
      </div>
    </motion.article>
  );
};

export default React.memo(VideoTile);
