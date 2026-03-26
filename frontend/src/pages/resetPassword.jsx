import LockResetIcon from "@mui/icons-material/LockReset";
import Visibility from "@mui/icons-material/Visibility";
import VisibilityOff from "@mui/icons-material/VisibilityOff";
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  CssBaseline,
  IconButton,
  InputAdornment,
  Paper,
  Snackbar,
  TextField,
  Typography,
} from "@mui/material";
import { createTheme, ThemeProvider } from "@mui/material/styles";
import * as React from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import PageTransition from "../components/common/PageTransition";
import { AuthContext } from "../contexts/AuthContext";

const theme = createTheme({
  palette: {
    primary: { main: "#6366f1" },
    background: { default: "#060a13" },
  },
  typography: {
    fontFamily: "'Inter', 'Segoe UI', sans-serif",
  },
});

const textFieldSx = {
  "& .MuiOutlinedInput-root": {
    borderRadius: "12px",
    background: "rgba(15,23,42,0.5)",
    color: "#f1f5f9",
    "& fieldset": { borderColor: "rgba(148,163,184,0.22)" },
    "&:hover fieldset": { borderColor: "rgba(99,102,241,0.4)" },
    "&.Mui-focused fieldset": {
      borderColor: "#6366f1",
      boxShadow: "0 0 0 3px rgba(99,102,241,0.12)",
    },
  },
  "& .MuiInputLabel-root": { color: "rgba(148,163,184,0.6)" },
  "& .MuiInputLabel-root.Mui-focused": { color: "#818cf8" },
};

export default function ResetPassword() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") || "";
  const navigate = useNavigate();

  const { handleResetPassword } = React.useContext(AuthContext);

  const [password, setPassword] = React.useState("");
  const [confirmPassword, setConfirmPassword] = React.useState("");
  const [showPassword, setShowPassword] = React.useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = React.useState(false);
  const [error, setError] = React.useState("");
  const [message, setMessage] = React.useState("");
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [open, setOpen] = React.useState(false);

  const validate = () => {
    if (!token) {
      setError("Reset token is missing or invalid.");
      return false;
    }

    if (!password || !confirmPassword) {
      setError("Please fill both password fields.");
      return false;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return false;
    }

    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return false;
    }

    return true;
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    if (isSubmitting) return;

    setError("");
    setMessage("");

    if (!validate()) return;

    setIsSubmitting(true);
    try {
      const result = await handleResetPassword(token, password);
      if (!result.success) {
        setError(result.message);
        return;
      }

      setMessage(result.message);
      setOpen(true);
      setPassword("");
      setConfirmPassword("");

      setTimeout(() => {
        navigate("/auth");
      }, 1800);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <PageTransition>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <Box
          sx={{
            minHeight: "100vh",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "linear-gradient(165deg, #0c1221 0%, #060a13 60%)",
            p: 2,
          }}
        >
          <Paper
            elevation={0}
            sx={{
              width: "100%",
              maxWidth: 460,
              background: "rgba(15,23,42,0.45)",
              backdropFilter: "blur(24px)",
              borderRadius: "24px",
              border: "1px solid rgba(148,163,184,0.12)",
              p: { xs: 3, sm: 4 },
              color: "#f1f5f9",
            }}
          >
            <Box sx={{ display: "flex", alignItems: "center", gap: 1.2, mb: 1.5 }}>
              <LockResetIcon sx={{ color: "#818cf8" }} />
              <Typography variant="h5" sx={{ fontWeight: 700 }}>
                Reset Password
              </Typography>
            </Box>
            <Typography sx={{ color: "rgba(226,232,240,0.72)", mb: 2.5 }}>
              Enter your new password below.
            </Typography>

            {!!error && (
              <Alert severity="error" sx={{ mb: 2 }}>
                {error}
              </Alert>
            )}

            <Box component="form" onSubmit={onSubmit} noValidate>
              <TextField
                margin="normal"
                required
                fullWidth
                name="password"
                label="New Password"
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                InputProps={{
                  endAdornment: (
                    <InputAdornment position="end">
                      <IconButton
                        onClick={() => setShowPassword((prev) => !prev)}
                        edge="end"
                        sx={{ color: "rgba(148,163,184,0.9)" }}
                      >
                        {showPassword ? <VisibilityOff /> : <Visibility />}
                      </IconButton>
                    </InputAdornment>
                  ),
                }}
                sx={textFieldSx}
              />

              <TextField
                margin="normal"
                required
                fullWidth
                name="confirmPassword"
                label="Confirm Password"
                type={showConfirmPassword ? "text" : "password"}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                InputProps={{
                  endAdornment: (
                    <InputAdornment position="end">
                      <IconButton
                        onClick={() => setShowConfirmPassword((prev) => !prev)}
                        edge="end"
                        sx={{ color: "rgba(148,163,184,0.9)" }}
                      >
                        {showConfirmPassword ? <VisibilityOff /> : <Visibility />}
                      </IconButton>
                    </InputAdornment>
                  ),
                }}
                sx={textFieldSx}
              />

              <Button
                type="submit"
                fullWidth
                variant="contained"
                disabled={isSubmitting}
                sx={{
                  mt: 2.5,
                  borderRadius: "12px",
                  textTransform: "none",
                  fontWeight: 700,
                  py: 1.2,
                  background: "linear-gradient(135deg, #3b82f6, #6366f1)",
                  boxShadow: "0 8px 24px rgba(99,102,241,0.35)",
                }}
              >
                {isSubmitting ? (
                  <CircularProgress size={20} sx={{ color: "white" }} />
                ) : (
                  "Update Password"
                )}
              </Button>

              <Button
                type="button"
                fullWidth
                variant="text"
                onClick={() => navigate("/auth")}
                sx={{ mt: 1, textTransform: "none", color: "#93c5fd" }}
              >
                Back to Login
              </Button>
            </Box>
          </Paper>
        </Box>

        <Snackbar
          open={open}
          autoHideDuration={2500}
          onClose={() => setOpen(false)}
          message={message}
        />
      </ThemeProvider>
    </PageTransition>
  );
}
