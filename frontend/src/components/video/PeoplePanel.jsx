/**
 * PeoplePanel — Side drawer showing meeting participants.
 */
import CloseIcon from "@mui/icons-material/Close";
import PersonIcon from "@mui/icons-material/Person";
import { IconButton, Typography } from "@mui/material";
import React from "react";
import styles from "../../styles/videoComponent.module.css";

const PeoplePanel = ({ participants, localUsername, onClose }) => {
  const totalCount = 1 + participants.length; // local + remotes

  return (
    <div className={styles.chatPanel}>
      <div className={styles.chatHeader}>
        <Typography variant="subtitle1" sx={{ color: "#fff", fontWeight: 600 }}>
          People ({totalCount})
        </Typography>
        <IconButton onClick={onClose} size="small" sx={{ color: "#94a3b8" }}>
          <CloseIcon fontSize="small" />
        </IconButton>
      </div>

      <div className={styles.peopleList}>
        {/* Local user */}
        <div className={styles.peopleItem}>
          <PersonIcon sx={{ color: "#FF9839", fontSize: 20, mr: 1 }} />
          <span className={styles.peopleName}>
            {localUsername || "You"} (You)
          </span>
        </div>

        {/* Remote participants */}
        {participants.map(({ socketId, username }) => (
          <div key={socketId} className={styles.peopleItem}>
            <PersonIcon sx={{ color: "#94a3b8", fontSize: 20, mr: 1 }} />
            <span className={styles.peopleName}>{username || "Guest"}</span>
          </div>
        ))}

        {participants.length === 0 && (
          <Typography
            variant="body2"
            sx={{ color: "#64748b", textAlign: "center", mt: 3 }}
          >
            No one else has joined yet
          </Typography>
        )}
      </div>
    </div>
  );
};

export default React.memo(PeoplePanel);
