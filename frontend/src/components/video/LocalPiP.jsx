/**
 * LocalPiP — Draggable picture-in-picture for self-view during spotlight mode.
 * UI-only; does not modify WebRTC streams.
 */
import CloseIcon from "@mui/icons-material/Close";
import { IconButton } from "@mui/material";
import React, { useCallback, useEffect, useRef, useState } from "react";
import styles from "../../styles/videoComponent.module.css";
import { getInitials } from "../../utils/helpers";

const LocalPiP = ({
  stream,
  username,
  videoEnabled,
  audioEnabled,
  visible,
  onDismiss,
}) => {
  const videoRef = useRef(null);
  const dragRef = useRef(null);
  const [pos, setPos] = useState({ x: 16, y: 120 });
  const dragging = useRef(false);
  const dragStart = useRef({ x: 0, y: 0, posX: 0, posY: 0 });

  useEffect(() => {
    const videoEl = videoRef.current;
    if (!videoEl || !stream) return;
    videoEl.srcObject = stream;
    videoEl.play().catch(() => {});
  }, [stream]);

  const onPointerDown = useCallback(
    (e) => {
      if (e.target.closest("button")) return;
      dragging.current = true;
      dragStart.current = {
        x: e.clientX,
        y: e.clientY,
        posX: pos.x,
        posY: pos.y,
      };
      dragRef.current?.setPointerCapture(e.pointerId);
    },
    [pos.x, pos.y],
  );

  const onPointerMove = useCallback((e) => {
    if (!dragging.current) return;
    const dx = e.clientX - dragStart.current.x;
    const dy = e.clientY - dragStart.current.y;
    setPos({
      x: Math.max(8, dragStart.current.posX - dx),
      y: Math.max(8, dragStart.current.posY - dy),
    });
  }, []);

  const onPointerUp = useCallback(() => {
    dragging.current = false;
  }, []);

  if (!visible || !stream) return null;

  const hasVideo =
    stream.getVideoTracks().length > 0 && videoEnabled !== false;

  return (
    <div
      ref={dragRef}
      className={styles.localPip}
      style={{ right: pos.x, bottom: pos.y }}
      role="complementary"
      aria-label="Your video picture-in-picture"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      <div className={styles.localPipHeader}>
        <span className={styles.localPipLabel}>You</span>
        <IconButton
          size="small"
          onClick={onDismiss}
          className={styles.localPipClose}
          aria-label="Hide self view"
        >
          <CloseIcon sx={{ fontSize: 14 }} />
        </IconButton>
      </div>
      <div className={styles.localPipBody}>
        {hasVideo ? (
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className={styles.localPipVideo}
            style={{ transform: "scaleX(-1)" }}
          />
        ) : (
          <div className={styles.localPipAvatar}>{getInitials(username)}</div>
        )}
      </div>
      <div className={styles.localPipFooter}>
        {!audioEnabled && <span className={styles.localPipMuted}>Muted</span>}
      </div>
    </div>
  );
};

export default React.memo(LocalPiP);
