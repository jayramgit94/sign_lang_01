/**
 * Screen Share Status Badge
 * Shows when screen sharing is active
 */

import { Box, Chip, Typography } from "@mui/material";
import ScreenShareIcon from "@mui/icons-material/ScreenShare";
import RefreshIcon from "@mui/icons-material/Refresh";

const ScreenShareStatus = ({ isActive, isTransitioning }) => {
  if (!isActive && !isTransitioning) return null;

  return (
    <Box
      sx={{
        position: "absolute",
        top: 16,
        left: 16,
        zIndex: 100,
        animation: isTransitioning ? "pulse 1.5s infinite" : "none",
        "@keyframes pulse": {
          "0%, 100%": { opacity: 1 },
          "50%": { opacity: 0.6 },
        },
      }}
    >
      <Chip
        icon={isTransitioning ? <RefreshIcon /> : <ScreenShareIcon />}
        label={isTransitioning ? "Switching layout..." : "Screen Sharing"}
        color={isTransitioning ? "warning" : "success"}
        variant="filled"
        sx={{
          fontWeight: 600,
          fontSize: "0.875rem",
          ".MuiChip-icon": {
            animation: isTransitioning ? "spin 1s linear infinite" : "none",
            "@keyframes spin": {
              "0%": { transform: "rotate(0deg)" },
              "100%": { transform: "rotate(360deg)" },
            },
          },
        }}
      />
    </Box>
  );
};

export default ScreenShareStatus;
