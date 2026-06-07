/**
 * ChatPanel — Side panel for in-room chat messaging.
 */
import { Close, Send } from "@mui/icons-material";
import { IconButton, TextField, Typography } from "@mui/material";
import { motion, useReducedMotion } from "framer-motion";
import React, { useEffect, useRef, useState } from "react";
import styles from "../../styles/videoComponent.module.css";
import { formatTime } from "../../utils/helpers";
import { panelVariants, springPanel } from "../../utils/motion";

const ChatPanel = ({ messages, onSend, username, onClose }) => {
  const reduced = useReducedMotion();
  const [text, setText] = useState("");
  const messagesEndRef = useRef(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  const handleSend = () => {
    if (!text.trim()) return;
    onSend(text, username);
    setText("");
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <motion.aside
      className={styles.chatPanel}
      role="complementary"
      aria-label="Meeting chat"
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
          sx={{ fontWeight: 700, color: "#fff", fontFamily: "inherit" }}
        >
          Chat
        </Typography>
        <IconButton
          onClick={onClose}
          size="small"
          sx={{ color: "rgba(148,163,184,0.8)" }}
          aria-label="Close chat"
        >
          <Close />
        </IconButton>
      </div>

      <div
        className={styles.chatMessages}
        role="log"
        aria-live="polite"
        aria-relevant="additions"
      >
        {messages.length === 0 && (
          <div className={styles.emptyState}>
            <Typography variant="body2" component="p">
              No messages yet
            </Typography>
            <Typography variant="caption" component="p">
              Say hello to start the conversation
            </Typography>
          </div>
        )}

        {messages.map((msg, idx) => {
          const isOwn = msg.sender === username;
          return (
            <div
              key={idx}
              className={`${styles.chatMessage} ${
                isOwn ? styles.chatMessageOwn : styles.chatMessageOther
              }`}
            >
              {!isOwn && (
                <span className={styles.chatSender}>{msg.sender}</span>
              )}
              <span className={styles.chatText}>{msg.data}</span>
              <span className={styles.chatTime}>
                {formatTime(msg.timestamp)}
              </span>
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      <div className={styles.chatInputArea}>
        <TextField
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type a message..."
          size="small"
          fullWidth
          multiline
          maxRows={3}
          sx={{
            "& .MuiInputBase-root": {
              color: "#f1f5f9",
              backgroundColor: "rgba(15,23,42,0.6)",
              borderRadius: "12px",
              border: "1px solid rgba(148,163,184,0.15)",
            },
            "& .MuiOutlinedInput-notchedOutline": { border: "none" },
            "& .MuiInputBase-root.Mui-focused": {
              boxShadow: "0 0 0 2px rgba(99,102,241,0.25)",
            },
          }}
        />
        <IconButton
          onClick={handleSend}
          disabled={!text.trim()}
          sx={{
            color: text.trim() ? "#ff9839" : "rgba(148,163,184,0.4)",
            transition: "color 0.2s ease, transform 0.2s ease",
            "&:hover:not(:disabled)": { transform: "scale(1.05)" },
          }}
          aria-label="Send message"
        >
          <Send />
        </IconButton>
      </div>
    </motion.aside>
  );
};

export default React.memo(ChatPanel);
