/**
 * CaptionOverlay — Displays sign language captions at the bottom of the video area.
 *
 * Supports multiple simultaneous signers — each user's caption appears
 * in its own line with a color-coded label.
 */
import React from "react";
import styles from "../../styles/videoComponent.module.css";

const CAPTION_COLORS = [
  "#93c5fd", // blue
  "#86efac", // green
  "#fcd34d", // amber
  "#f9a8d4", // pink
  "#c4b5fd", // violet
  "#fca5a5", // red
];

const CaptionOverlay = ({
  localCaption,
  remoteCaptions,
  correctedSentence,
}) => {
  const allCaptions = [];

  // Show corrected sentence prominently if available
  if (correctedSentence) {
    allCaptions.push({
      username: "AI",
      text: correctedSentence,
      score: 0,
      isSentence: true,
    });
  }

  if (localCaption?.text) {
    allCaptions.push({ username: "You", ...localCaption });
  }

  if (remoteCaptions?.length) {
    allCaptions.push(...remoteCaptions);
  }

  if (allCaptions.length === 0) return null;

  return (
    <div className={styles.captionOverlay}>
      {allCaptions.map((caption, idx) => (
        <div
          key={`${caption.username}-${idx}`}
          className={styles.captionLine}
          style={
            caption.isSentence
              ? { fontSize: "1.1em", fontStyle: "italic" }
              : undefined
          }
        >
          <strong
            style={{
              color: caption.isSentence
                ? "#facc15"
                : CAPTION_COLORS[idx % CAPTION_COLORS.length],
            }}
          >
            {caption.username}:
          </strong>{" "}
          <span>{caption.text}</span>
          {caption.score > 0 && (
            <span className={styles.captionScore}>
              {Math.round(caption.score * 100)}%
            </span>
          )}
        </div>
      ))}
    </div>
  );
};

export default React.memo(CaptionOverlay);
