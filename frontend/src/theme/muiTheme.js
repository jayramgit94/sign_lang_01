import { createTheme } from "@mui/material/styles";

/** Shared MUI theme aligned with design tokens */
const muiTheme = createTheme({
  palette: {
    mode: "dark",
    primary: { main: "#6366f1", light: "#818cf8", dark: "#4f46e5" },
    secondary: { main: "#ff9839" },
    error: { main: "#ef4444" },
    warning: { main: "#fbbf24" },
    success: { main: "#34d399" },
    background: {
      default: "#050810",
      paper: "#0c1221",
    },
    text: {
      primary: "#f4f6fb",
      secondary: "rgba(226, 232, 240, 0.78)",
    },
  },
  typography: {
    fontFamily: '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    h1: { fontFamily: '"Plus Jakarta Sans", sans-serif', fontWeight: 800 },
    h2: { fontFamily: '"Plus Jakarta Sans", sans-serif', fontWeight: 700 },
    h3: { fontFamily: '"Plus Jakarta Sans", sans-serif', fontWeight: 700 },
    h4: { fontFamily: '"Plus Jakarta Sans", sans-serif', fontWeight: 700 },
    h5: { fontFamily: '"Plus Jakarta Sans", sans-serif', fontWeight: 700 },
    h6: { fontFamily: '"Plus Jakarta Sans", sans-serif', fontWeight: 600 },
    button: { textTransform: "none", fontWeight: 600 },
  },
  shape: { borderRadius: 12 },
  components: {
    MuiButton: {
      styleOverrides: {
        root: {
          borderRadius: 12,
          padding: "8px 18px",
        },
        containedPrimary: {
          background: "linear-gradient(135deg, #6366f1, #4f46e5)",
          boxShadow: "0 8px 24px rgba(99, 102, 241, 0.28)",
          "&:hover": {
            background: "linear-gradient(135deg, #818cf8, #6366f1)",
          },
        },
      },
    },
    MuiOutlinedInput: {
      styleOverrides: {
        root: {
          borderRadius: 12,
        },
      },
    },
    MuiTooltip: {
      styleOverrides: {
        tooltip: {
          backgroundColor: "rgba(15, 23, 42, 0.95)",
          border: "1px solid rgba(148, 163, 184, 0.2)",
          fontSize: "0.8125rem",
        },
      },
    },
  },
});

export default muiTheme;
