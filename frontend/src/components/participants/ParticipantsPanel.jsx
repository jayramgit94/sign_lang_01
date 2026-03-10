/**
 * ParticipantsPanel — Shows list of participants in the room.
 */
import { Close, Mic, MicOff, Videocam, VideocamOff } from "@mui/icons-material";
import { Avatar, IconButton, Typography } from "@mui/material";
import React from "react";
import styles from "../../styles/videoComponent.module.css";
import { getInitials } from "../../utils/helpers";

const ParticipantsPanel = ({
  localUsername,
  remoteStreams,
  video,
  audio,
  onClose,
}) => {
  const participants = [
    { username: `${localUsername} (You)`, isLocal: true, video, audio },
    ...remoteStreams.map((s) => ({
      username: s.username || "Peer",
      isLocal: false,
      video: true,
      audio: true,
    })),
  ];

  return (
    <div className={styles.chatPanel}>
      <div className={styles.chatHeader}>
        <Typography variant="subtitle1" sx={{ fontWeight: 600, color: "#fff" }}>
          Participants ({participants.length})
        </Typography>
        <IconButton onClick={onClose} size="small" sx={{ color: "#aaa" }}>
          <Close />
        </IconButton>
      </div>

      <div className={styles.participantsList}>
        {participants.map((p, idx) => (
          <div key={idx} className={styles.participantItem}>
            <Avatar
              sx={{
                width: 32,
                height: 32,
                bgcolor: p.isLocal ? "#FF9839" : "#3a3a5c",
                fontSize: "0.8rem",
              }}
            >
              {getInitials(p.username)}
            </Avatar>
            <span className={styles.participantName}>{p.username}</span>
            <div className={styles.participantIcons}>
              {p.audio ? (
                <Mic sx={{ fontSize: 16, color: "#aaa" }} />
              ) : (
                <MicOff sx={{ fontSize: 16, color: "#ff4444" }} />
              )}
              {p.video ? (
                <Videocam sx={{ fontSize: 16, color: "#aaa" }} />
              ) : (
                <VideocamOff sx={{ fontSize: 16, color: "#ff4444" }} />
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default React.memo(ParticipantsPanel);
