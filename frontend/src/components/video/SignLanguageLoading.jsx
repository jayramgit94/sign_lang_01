/**
 * Sign Language Loading overlay
 * Shows loading state while MediaPipe and server are initializing
 */

import { CircularProgress, Box, Typography, Alert } from "@mui/material";

const SignLanguageLoading = ({ isLoading, loadingError, onClose }) => {
  if (!isLoading && !loadingError) return null;

  return (
    <Box
      sx={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        bgcolor: "rgba(0, 0, 0, 0.7)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 9999,
        backdropFilter: "blur(4px)",
      }}
    >
      {isLoading && (
        <Box sx={{ textAlign: "center" }}>
          <CircularProgress
            size={60}
            sx={{ mb: 2, color: "primary.main" }}
          />
          <Typography
            variant="h6"
            sx={{ color: "white", fontWeight: 500, mb: 1 }}
          >
            Loading Sign Language Recognition...
          </Typography>
          <Typography
            variant="body2"
            sx={{ color: "rgba(255,255,255,0.7)" }}
          >
            Initializing MediaPipe and connecting to server
          </Typography>
        </Box>
      )}

      {loadingError && (
        <Box sx={{ textAlign: "center", maxWidth: 500 }}>
          <Alert
            severity="error"
            sx={{ mb: 2 }}
            onClose={onClose}
          >
            <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1 }}>
              Sign Language Recognition Error
            </Typography>
            <Typography variant="body2">{loadingError}</Typography>
          </Alert>
          <Typography
            variant="caption"
            sx={{ color: "rgba(255,255,255,0.6)" }}
          >
            Try refreshing the page or check your internet connection
          </Typography>
        </Box>
      )}
    </Box>
  );
};

export default SignLanguageLoading;
