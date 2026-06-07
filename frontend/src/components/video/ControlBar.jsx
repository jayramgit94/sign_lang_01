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

const ControlButton = ({
  label,
  shortLabel,
  ariaPressed,
  activeClass,
  offClass,
  disabled,
  onClick,
  children,
  badge,
  badgeColor = "error",
}) => (
  <div className={styles.controlButtonWrap}>
    <Tooltip title={label}>
      <span className={disabled ? styles.controlBtnDisabledWrap : undefined}>
        <IconButton
          onClick={onClick}
          disabled={disabled}
          className={[
            styles.controlBtn,
            activeClass ? styles[activeClass] : "",
            offClass ? styles[offClass] : "",
          ]
            .filter(Boolean)
            .join(" ")}
          size="large"
          aria-label={label}
          aria-pressed={ariaPressed}
        >
          {badge != null && badge !== false ? (
            <Badge badgeContent={badge} color={badgeColor} max={99}>
              {children}
            </Badge>
          ) : (
            children
          )}
        </IconButton>
      </span>
    </Tooltip>
    <span className={styles.controlLabel} aria-hidden="true">
      {shortLabel || label.split(" ").slice(0, 2).join(" ")}
    </span>
  </div>
);

const ControlBar = ({
  video,
  audio,
  screen,
  canScreenShare,
  screenShareSupportReason,
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
  const screenLabel = canScreenShare
    ? screen
      ? "Stop sharing screen"
      : "Share screen"
    : screenShareSupportReason || "Screen sharing not supported";

  return (
    <footer
      className={styles.controlBar}
      role="toolbar"
      aria-label="Meeting controls"
    >
      <div className={styles.controlBarInner}>
        <div className={styles.controlScrollArea}>
          <div
            className={styles.controlGroup}
            role="group"
            aria-label="Media controls"
          >
            <ControlButton
              label={video ? "Turn off camera" : "Turn on camera"}
              shortLabel={video ? "Camera" : "Camera off"}
              ariaPressed={video}
              offClass={!video ? "controlBtnOff" : ""}
              onClick={onToggleVideo}
            >
              {video ? <Videocam /> : <VideocamOff />}
            </ControlButton>

            <ControlButton
              label={audio ? "Mute microphone" : "Unmute microphone"}
              shortLabel={audio ? "Mic" : "Muted"}
              ariaPressed={!audio}
              offClass={!audio ? "controlBtnOff" : ""}
              onClick={onToggleAudio}
            >
              {audio ? <Mic /> : <MicOff />}
            </ControlButton>

            <ControlButton
              label={screenLabel}
              shortLabel="Share"
              ariaPressed={screen}
              activeClass={screen ? "controlBtnActive" : ""}
              disabled={!canScreenShare}
              onClick={onToggleScreen}
            >
              {screen ? <StopScreenShare /> : <ScreenShare />}
            </ControlButton>
          </div>

          <div className={styles.controlDivider} aria-hidden="true" />

          <div
            className={styles.controlGroup}
            role="group"
            aria-label="Accessibility and panels"
          >
            <ControlButton
              label={
                signLangEnabled
                  ? "Disable sign language recognition"
                  : "Enable sign language recognition"
              }
              shortLabel="Sign"
              ariaPressed={signLangEnabled}
              activeClass={signLangEnabled ? "controlBtnActive" : ""}
              onClick={onToggleSignLang}
            >
              <PanTool />
            </ControlButton>

            <ControlButton
              label={captionsVisible ? "Hide captions" : "Show captions"}
              shortLabel="Captions"
              ariaPressed={captionsVisible}
              activeClass={captionsVisible ? "controlBtnActive" : ""}
              onClick={onToggleCaptions}
            >
              {captionsVisible ? <ClosedCaption /> : <ClosedCaptionDisabled />}
            </ControlButton>

            <ControlButton
              label={chatOpen ? "Close chat" : "Open chat"}
              shortLabel="Chat"
              ariaPressed={chatOpen}
              activeClass={chatOpen ? "controlBtnActive" : ""}
              onClick={onToggleChat}
              badge={!chatOpen && newMessages > 0 ? newMessages : null}
            >
              <Chat />
            </ControlButton>

            <ControlButton
              label={peopleOpen ? "Close people panel" : "Open people panel"}
              shortLabel="People"
              ariaPressed={peopleOpen}
              activeClass={peopleOpen ? "controlBtnActive" : ""}
              onClick={onTogglePeople}
              badge={participantCount}
              badgeColor="primary"
            >
              <People />
            </ControlButton>
          </div>
        </div>

        <div className={styles.controlLeave}>
          <Tooltip title="Leave call">
            <IconButton
              onClick={onEndCall}
              className={styles.endCallBtn}
              size="large"
              aria-label="Leave call"
            >
              <CallEnd />
            </IconButton>
          </Tooltip>
        </div>
      </div>
    </footer>
  );
};

export default React.memo(ControlBar);
