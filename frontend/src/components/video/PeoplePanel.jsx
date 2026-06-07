/**
 * PeoplePanel — Side drawer showing meeting participants with status.
 */
import CloseIcon from "@mui/icons-material/Close";
import MicOffIcon from "@mui/icons-material/MicOff";
import PersonIcon from "@mui/icons-material/Person";
import VideocamOffIcon from "@mui/icons-material/VideocamOff";
import { IconButton, Typography } from "@mui/material";
import { motion, useReducedMotion } from "framer-motion";
import React, { useMemo } from "react";
import styles from "../../styles/videoComponent.module.css";
import { panelVariants, springPanel } from "../../utils/motion";

const StatusIcons = ({ video, audio }) => (
  <span className={styles.peopleStatus}>
    {video === false && (
      <VideocamOffIcon sx={{ fontSize: 14, color: "#fbbf24" }} aria-label="Camera off" />
    )}
    {audio === false && (
      <MicOffIcon sx={{ fontSize: 14, color: "#f87171" }} aria-label="Muted" />
    )}
  </span>
);

const PeoplePanel = ({
  participants,
  remoteStreams = [],
  localUsername,
  localVideo = true,
  localAudio = true,
  onClose,
}) => {
  const reduced = useReducedMotion();
  const totalCount = 1 + participants.length;

  const streamById = useMemo(() => {
    const map = new Map();
    remoteStreams.forEach((r) => map.set(r.socketId, r));
    return map;
  }, [remoteStreams]);

  return (
    <motion.aside
      className={styles.chatPanel}
      role="complementary"
      aria-label="Meeting participants"
      variants={panelVariants}
      initial={reduced ? false : "initial"}
      animate="animate"
      exit={reduced ? undefined : "exit"}
      transition={springPanel(reduced)}
    >
      <div className={styles.chatHeader}>
        <Typography
          component="h2"
          variant="subtitle1"
          sx={{ color: "#fff", fontWeight: 700, fontFamily: "inherit" }}
        >
          People ({totalCount})
        </Typography>
        <IconButton
          onClick={onClose}
          size="small"
          sx={{ color: "#94a3b8" }}
          aria-label="Close people panel"
        >
          <CloseIcon fontSize="small" />
        </IconButton>
      </div>

      <ul className={styles.peopleList} aria-label="Participant list">
        <li className={`${styles.peopleItem} ${styles.peopleItemYou}`}>
          <PersonIcon sx={{ color: "#ff9839", fontSize: 20, mr: 1 }} aria-hidden />
          <span className={styles.peopleName}>
            {localUsername || "You"} (You)
          </span>
          <StatusIcons video={localVideo} audio={localAudio} />
        </li>

        {participants.map(({ socketId, username: name }) => {
          const peer = streamById.get(socketId);
          return (
            <li key={socketId} className={styles.peopleItem}>
              <PersonIcon sx={{ color: "#94a3b8", fontSize: 20, mr: 1 }} aria-hidden />
              <span className={styles.peopleName}>{name || "Guest"}</span>
              <StatusIcons
                video={peer?.video !== false}
                audio={peer?.audio !== false}
              />
            </li>
          );
        })}

        {participants.length === 0 && (
          <li className={styles.emptyState}>
            <Typography variant="body2" component="p">
              Waiting for others to join
            </Typography>
          </li>
        )}
      </ul>
    </motion.aside>
  );
};

export default React.memo(PeoplePanel);
