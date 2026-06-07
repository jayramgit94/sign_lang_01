/**
 * CaptionOverlay — Displays sign language captions at the bottom of the video area.
 */
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import React from "react";
import styles from "../../styles/videoComponent.module.css";
import { captionVariants } from "../../utils/motion";

const CAPTION_COLORS = [
  "#93c5fd",
  "#86efac",
  "#fcd34d",
  "#f9a8d4",
  "#c4b5fd",
  "#fca5a5",
];

const CaptionOverlay = ({
  localCaption,
  remoteCaptions,
  correctedSentence,
}) => {
  const reduced = useReducedMotion();
  const allCaptions = [];

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
    <div
      className={styles.captionOverlay}
      role="region"
      aria-live="polite"
      aria-label="Sign language captions"
    >
      <AnimatePresence mode="popLayout">
        {allCaptions.map((caption, idx) => (
          <motion.div
            key={`${caption.username}-${caption.text}-${idx}`}
            className={styles.captionLine}
            variants={captionVariants}
            initial={reduced ? false : "initial"}
            animate="animate"
            exit={reduced ? undefined : "exit"}
            transition={{ duration: reduced ? 0 : 0.22 }}
            layout
            style={
              caption.isSentence
                ? { fontSize: "1.05em", fontStyle: "italic" }
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
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
};

export default React.memo(CaptionOverlay);
