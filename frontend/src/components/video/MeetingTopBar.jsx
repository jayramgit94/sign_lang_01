/**
 * MeetingTopBar — In-call header with meeting info and layout controls.
 */
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import FiberManualRecordIcon from "@mui/icons-material/FiberManualRecord";
import GridViewIcon from "@mui/icons-material/GridView";
import GroupsIcon from "@mui/icons-material/Groups";
import SpeakerViewIcon from "@mui/icons-material/Speaker";
import { Tooltip } from "@mui/material";
import React, { useCallback, useState } from "react";
import styles from "../../styles/videoComponent.module.css";

const MeetingTopBar = ({
  meetingCode,
  participantCount,
  callDuration,
  signLangEnabled,
  layoutMode = "grid",
  onLayoutModeChange,
}) => {
  const [copied, setCopied] = useState(false);

  const handleCopyCode = useCallback(async () => {
    if (!meetingCode) return;
    try {
      await navigator.clipboard.writeText(meetingCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard unavailable */
    }
  }, [meetingCode]);

  return (
    <header className={styles.meetingTopBar} aria-label="Meeting information">
      <div className={styles.meetingTopBarLeft}>
        <span className={styles.liveBadge} aria-live="polite">
          <FiberManualRecordIcon sx={{ fontSize: 10 }} aria-hidden />
          Live
        </span>
        {callDuration != null && (
          <span className={styles.callDuration} aria-label="Call duration">
            {callDuration}
          </span>
        )}
      </div>

      <div className={styles.meetingTopBarCenter}>
        <Tooltip title={copied ? "Copied!" : "Copy meeting code"}>
          <button
            type="button"
            className={styles.meetingCodeChip}
            onClick={handleCopyCode}
            aria-label={`Meeting code ${meetingCode}. Click to copy.`}
          >
            <span className={styles.meetingCodeLabel}>Code</span>
            <span className={styles.meetingCodeValue}>{meetingCode}</span>
            <ContentCopyIcon sx={{ fontSize: 14 }} aria-hidden />
          </button>
        </Tooltip>
      </div>

      <div className={styles.meetingTopBarRight}>
        {onLayoutModeChange && participantCount > 1 && (
          <div
            className={styles.layoutToggle}
            role="group"
            aria-label="Layout mode"
          >
            <Tooltip title="Gallery view">
              <button
                type="button"
                className={`${styles.layoutBtn} ${layoutMode === "grid" ? styles.layoutBtnActive : ""}`}
                onClick={() => onLayoutModeChange("grid")}
                aria-label="Gallery view"
                aria-pressed={layoutMode === "grid"}
              >
                <GridViewIcon sx={{ fontSize: 18 }} />
              </button>
            </Tooltip>
            <Tooltip title="Speaker view — auto-focus active speaker">
              <button
                type="button"
                className={`${styles.layoutBtn} ${layoutMode === "speaker" ? styles.layoutBtnActive : ""}`}
                onClick={() => onLayoutModeChange("speaker")}
                aria-label="Speaker view"
                aria-pressed={layoutMode === "speaker"}
              >
                <SpeakerViewIcon sx={{ fontSize: 18 }} />
              </button>
            </Tooltip>
          </div>
        )}

        {signLangEnabled && (
          <span
            className={styles.signLangBadge}
            aria-label="Sign language recognition active"
          >
            ASL
          </span>
        )}
        <span
          className={styles.participantBadge}
          aria-label={`${participantCount} participants`}
        >
          <GroupsIcon sx={{ fontSize: 16 }} aria-hidden />
          {participantCount}
        </span>
      </div>
    </header>
  );
};

export default React.memo(MeetingTopBar);
