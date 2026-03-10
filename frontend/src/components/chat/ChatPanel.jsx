/**
 * ChatPanel — Side panel for in-room chat messaging.
 */
import { Close, Send } from "@mui/icons-material";
import { IconButton, TextField, Typography } from "@mui/material";
import React, { useEffect, useRef, useState } from "react";
import styles from "../../styles/videoComponent.module.css";
import { formatTime } from "../../utils/helpers";

const ChatPanel = ({ messages, onSend, username, onClose }) => {
  const [text, setText] = useState("");
  const messagesEndRef = useRef(null);

  // Auto-scroll to bottom on new messages
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
    <div className={styles.chatPanel}>
      {/* Header */}
      <div className={styles.chatHeader}>
        <Typography variant="subtitle1" sx={{ fontWeight: 600, color: "#fff" }}>
          Chat
        </Typography>
        <IconButton onClick={onClose} size="small" sx={{ color: "#aaa" }}>
          <Close />
        </IconButton>
      </div>

      {/* Messages */}
      <div className={styles.chatMessages}>
        {messages.length === 0 && (
          <Typography
            variant="body2"
            sx={{ color: "#666", textAlign: "center", mt: 4 }}
          >
            No messages yet. Say hello!
          </Typography>
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

      {/* Input */}
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
              color: "#fff",
              backgroundColor: "#2a2a3e",
              borderRadius: "8px",
            },
            "& .MuiOutlinedInput-notchedOutline": {
              borderColor: "transparent",
            },
          }}
        />
        <IconButton
          onClick={handleSend}
          disabled={!text.trim()}
          sx={{ color: text.trim() ? "#FF9839" : "#555" }}
        >
          <Send />
        </IconButton>
      </div>
    </div>
  );
};

export default React.memo(ChatPanel);
