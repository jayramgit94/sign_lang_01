/**
 * Sign Language Loading overlay — premium loading state.
 */
import { Alert, CircularProgress, Typography } from "@mui/material";
import { motion, useReducedMotion } from "framer-motion";
import styles from "../../styles/videoComponent.module.css";
import { fadeUpTransition, fadeUpVariants } from "../../utils/motion";

const SignLanguageLoading = ({ isLoading, loadingError, onClose }) => {
  const reduced = useReducedMotion();

  if (!isLoading && !loadingError) return null;

  return (
    <div className={styles.signLangOverlay} role="alertdialog" aria-modal="true">
      <motion.div
        className={styles.signLangOverlayCard}
        variants={fadeUpVariants}
        initial={reduced ? false : "initial"}
        animate="animate"
        transition={fadeUpTransition(0, reduced)}
      >
        {isLoading && (
          <>
            <CircularProgress size={52} thickness={4} sx={{ color: "#6366f1", mb: 2 }} />
            <Typography variant="h6" sx={{ color: "#fff", fontWeight: 700, mb: 1 }}>
              Loading sign language recognition
            </Typography>
            <Typography variant="body2" sx={{ color: "rgba(226,232,240,0.65)" }}>
              Initializing MediaPipe and connecting to the server
            </Typography>
          </>
        )}

        {loadingError && (
          <>
            <Alert severity="error" sx={{ mb: 2, width: "100%" }} onClose={onClose}>
              <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 0.5 }}>
                Sign language recognition error
              </Typography>
              <Typography variant="body2">{loadingError}</Typography>
            </Alert>
            <Typography variant="caption" sx={{ color: "rgba(226,232,240,0.55)" }}>
              Try refreshing the page or check your connection
            </Typography>
          </>
        )}
      </motion.div>
    </div>
  );
};

export default SignLanguageLoading;
