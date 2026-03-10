/**
 * ControlBar — Bottom control bar with media toggles, screen share, chat, etc.
 */
import {
  CallEnd,
  Chat,
  ClosedCaption,
  ClosedCaptionDisabled,
  Mic,
  MicOff,
  PanTool,
  People,
  ScreenShare,
  StopScreenShare,
  Videocam,
  VideocamOff,
} from "@mui/icons-material";
import { Badge, IconButton, Tooltip } from "@mui/material";
import React from "react";
import styles from "../../styles/videoComponent.module.css";

const ControlBar = ({
  video,
  audio,
  screen,
  signLangEnabled,
  captionsVisible,
  chatOpen,
  newMessages,
  peopleOpen,
  participantCount,
  onToggleVideo,
  onToggleAudio,
  onToggleScreen,
  onToggleSignLang,
  onToggleCaptions,
  onToggleChat,
  onTogglePeople,
  onEndCall,
}) => {
  return (
    <div className={styles.controlBar}>
      <div className={styles.controlGroup}>
        {/* Video toggle */}
        <Tooltip title={video ? "Turn off camera" : "Turn on camera"}>
          <IconButton
            onClick={onToggleVideo}
            className={`${styles.controlBtn} ${!video ? styles.controlBtnOff : ""}`}
            size="large"
          >
            {video ? <Videocam /> : <VideocamOff />}
          </IconButton>
        </Tooltip>

        {/* Audio toggle */}
        <Tooltip title={audio ? "Mute" : "Unmute"}>
          <IconButton
            onClick={onToggleAudio}
            className={`${styles.controlBtn} ${!audio ? styles.controlBtnOff : ""}`}
            size="large"
          >
            {audio ? <Mic /> : <MicOff />}
          </IconButton>
        </Tooltip>

        {/* Screen share */}
        <Tooltip title={screen ? "Stop sharing" : "Share screen"}>
          <IconButton
            onClick={onToggleScreen}
            className={`${styles.controlBtn} ${screen ? styles.controlBtnActive : ""}`}
            size="large"
          >
            {screen ? <StopScreenShare /> : <ScreenShare />}
          </IconButton>
        </Tooltip>

        {/* Sign language recognition toggle */}
        <Tooltip
          title={
            signLangEnabled
              ? "Disable sign language recognition"
              : "Enable sign language recognition"
          }
        >
          <IconButton
            onClick={onToggleSignLang}
            className={`${styles.controlBtn} ${signLangEnabled ? styles.controlBtnActive : ""}`}
            size="large"
          >
            <PanTool />
          </IconButton>
        </Tooltip>

        {/* Captions visibility toggle (CC button) */}
        <Tooltip title={captionsVisible ? "Hide captions" : "Show captions"}>
          <IconButton
            onClick={onToggleCaptions}
            className={`${styles.controlBtn} ${captionsVisible ? styles.controlBtnActive : ""}`}
            size="large"
          >
            {captionsVisible ? <ClosedCaption /> : <ClosedCaptionDisabled />}
          </IconButton>
        </Tooltip>

        {/* Chat toggle */}
        <Tooltip title="Chat">
          <IconButton
            onClick={onToggleChat}
            className={styles.controlBtn}
            size="large"
          >
            <Badge badgeContent={chatOpen ? 0 : newMessages} color="error">
              <Chat />
            </Badge>
          </IconButton>
        </Tooltip>

        {/* People toggle */}
        <Tooltip title="People">
          <IconButton
            onClick={onTogglePeople}
            className={`${styles.controlBtn} ${peopleOpen ? styles.controlBtnActive : ""}`}
            size="large"
          >
            <Badge badgeContent={participantCount} color="primary">
              <People />
            </Badge>
          </IconButton>
        </Tooltip>
      </div>

      {/* End call */}
      <Tooltip title="Leave call">
        <IconButton
          onClick={onEndCall}
          className={styles.endCallBtn}
          size="large"
        >
          <CallEnd />
        </IconButton>
      </Tooltip>
    </div>
  );
};

export default React.memo(ControlBar);
