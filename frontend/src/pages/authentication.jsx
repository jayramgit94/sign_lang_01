import LockOutlinedIcon from "@mui/icons-material/LockOutlined";
import Visibility from "@mui/icons-material/Visibility";
import VisibilityOff from "@mui/icons-material/VisibilityOff";
import { CircularProgress, Snackbar } from "@mui/material";
import Avatar from "@mui/material/Avatar";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import CssBaseline from "@mui/material/CssBaseline";
import Grid from "@mui/material/Grid";
import IconButton from "@mui/material/IconButton";
import InputAdornment from "@mui/material/InputAdornment";
import Link from "@mui/material/Link";
import Paper from "@mui/material/Paper";
import TextField from "@mui/material/TextField";
import { ThemeProvider } from "@mui/material/styles";
import { AnimatePresence, motion } from "framer-motion";
import * as React from "react";
import { useNavigate } from "react-router-dom";
import PageTransition from "../components/common/PageTransition";
import { AuthContext } from "../contexts/AuthContext";
import muiTheme from "../theme/muiTheme";

const theme = muiTheme;

const fadeUp = (delay = 0) => ({
  initial: { opacity: 0, y: 20 },
  animate: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.45, delay, ease: [0.25, 0.46, 0.45, 0.94] },
  },
});

const textFieldSx = {
  "& .MuiOutlinedInput-root": {
    borderRadius: "12px",
    background: "rgba(15,23,42,0.5)",
    color: "#f1f5f9",
    transition: "all 0.2s ease",
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

export default function Authentication() {
  const navigate = useNavigate();
  const [username, setUsername] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [showPassword, setShowPassword] = React.useState(false);
  const [name, setName] = React.useState("");
  const [error, setError] = React.useState("");
  const [message, setMessage] = React.useState("");
  const [resetLink, setResetLink] = React.useState("");
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [forgotMode, setForgotMode] = React.useState(false);

  const [formState, setFormState] = React.useState(0);

  const [open, setOpen] = React.useState(false);

  const { handleRegister, handleLogin, handleForgotPassword } =
    React.useContext(AuthContext);

  const handleAuth = async () => {
    if (isSubmitting) return;

    setError("");
    setMessage("");
    setResetLink("");
    setIsSubmitting(true);

    try {
      if (forgotMode) {
        if (!email.trim()) {
          setError("Please enter your email address.");
          return;
        }

        const result = await handleForgotPassword(email.trim());
        if (result.success) {
          setMessage(result.message);
          setResetLink(result.resetUrl || "");
          setOpen(true);
          setForgotMode(false);
        } else {
          setError(result.message);
        }
        return;
      }

      if (formState === 0) {
        if (!username.trim() || !password.trim()) {
          setError("Username and password are required.");
          return;
        }

        const result = await handleLogin(username.trim(), password);
        if (!result.success) {
          const attemptsHint =
            typeof result.attemptsRemaining === "number" &&
            result.attemptsRemaining >= 0
              ? ` Attempts remaining: ${result.attemptsRemaining}.`
              : "";
          setError(`${result.message || "Login failed."}${attemptsHint}`);
        }
      }

      if (formState === 1) {
        if (!name.trim() || !username.trim() || !password) {
          setError("Name, username, and password are required for sign up.");
          return;
        }

        const result = await handleRegister(
          name.trim(),
          username.trim(),
          email.trim(),
          password,
        );
        if (result.success) {
          setUsername("");
          setEmail("");
          setMessage(result.message);
          setOpen(true);
          setError("");
          setFormState(0);
          setPassword("");
          setName("");

          if (result.emailVerificationToken) {
            navigate(
              `/verify-email?token=${encodeURIComponent(result.emailVerificationToken)}`,
            );
          }
        } else {
          setError(result.message);
        }
      }
    } catch (err) {
      console.log(err);
      setError("An unexpected error occurred. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <PageTransition>
      <ThemeProvider theme={theme}>
        <Grid container component="main" sx={{ minHeight: "100vh" }}>
          <CssBaseline />

          {/* ---- left panel ---- */}
          <Grid
            size={{ xs: 0, sm: 4, md: 7 }}
            sx={{
              background:
                "linear-gradient(165deg, #0c1221 0%, #060a13 40%, #0e1a2e 100%)",
              color: "#f1f5f9",
              display: { xs: "none", sm: "flex" },
              flexDirection: "column",
              justifyContent: "space-between",
              p: 6,
              position: "relative",
              overflow: "hidden",
            }}
          >
            {/* ambient glow */}
            <Box
              sx={{
                position: "absolute",
                top: "-20%",
                left: "-10%",
                width: "55%",
                height: "60%",
                background:
                  "radial-gradient(circle, rgba(99,102,241,0.08) 0%, transparent 70%)",
                pointerEvents: "none",
              }}
            />
            <Box
              sx={{
                position: "absolute",
                bottom: "-15%",
                right: "-8%",
                width: "45%",
                height: "50%",
                background:
                  "radial-gradient(circle, rgba(59,130,246,0.06) 0%, transparent 70%)",
                pointerEvents: "none",
              }}
            />

            <motion.div {...fadeUp(0.1)}>
              <Box
                sx={{
                  display: "flex",
                  alignItems: "center",
                  gap: 1,
                  position: "relative",
                  zIndex: 1,
                }}
              >
                <motion.div
                  style={{
                    width: 11,
                    height: 11,
                    borderRadius: "50%",
                    background: "#6366f1",
                    boxShadow: "0 0 14px rgba(99,102,241,0.6)",
                  }}
                  animate={{ scale: [1, 1.3, 1] }}
                  transition={{
                    repeat: Infinity,
                    duration: 3,
                    ease: "easeInOut",
                  }}
                />
                <Box
                  component="h2"
                  sx={{
                    fontSize: "1.4rem",
                    fontWeight: 700,
                    letterSpacing: "-0.02em",
                  }}
                >
                  Apna Meet
                </Box>
              </Box>
            </motion.div>

            <motion.div
              {...fadeUp(0.25)}
              style={{ position: "relative", zIndex: 1 }}
            >
              <Box sx={{ maxWidth: 400 }}>
                <Box
                  component="h1"
                  sx={{
                    fontSize: "2.8rem",
                    fontWeight: 800,
                    letterSpacing: "-0.03em",
                    lineHeight: 1.1,
                    mb: 2,
                    background: "linear-gradient(135deg, #f1f5f9, #94a3b8)",
                    WebkitBackgroundClip: "text",
                    WebkitTextFillColor: "transparent",
                  }}
                >
                  Welcome back.
                </Box>
                <Box
                  sx={{
                    color: "rgba(226,232,240,0.72)",
                    fontSize: "1.05rem",
                    lineHeight: 1.6,
                  }}
                >
                  Sign in to keep your meetings organized, secure, and always in
                  sync.
                </Box>
              </Box>
            </motion.div>

            <motion.div
              {...fadeUp(0.4)}
              style={{ position: "relative", zIndex: 1 }}
            >
              <Box sx={{ fontSize: "0.85rem", color: "rgba(148,163,184,0.6)" }}>
                Private, fast, and built for calm conversations.
              </Box>
            </motion.div>
          </Grid>

          {/* ---- right panel ---- */}
          <Grid
            size={{ xs: 12, sm: 8, md: 5 }}
            component={Paper}
            elevation={0}
            square
            sx={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: "linear-gradient(165deg, #0c1221 0%, #060a13 60%)",
            }}
          >
            <motion.div
              {...fadeUp(0.15)}
              style={{
                width: "100%",
                display: "flex",
                justifyContent: "center",
              }}
            >
              <Box
                sx={{
                  my: 6,
                  mx: { xs: 3, sm: 5 },
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "stretch",
                  width: "100%",
                  maxWidth: 420,
                  background: "rgba(15,23,42,0.45)",
                  backdropFilter: "blur(24px)",
                  WebkitBackdropFilter: "blur(24px)",
                  borderRadius: "28px",
                  border: "1px solid rgba(148,163,184,0.12)",
                  boxShadow: "0 24px 48px rgba(0,0,0,0.45)",
                  p: { xs: 3, sm: 4 },
                  position: "relative",
                  overflow: "hidden",
                  "&::before": {
                    content: '""',
                    position: "absolute",
                    top: 0,
                    left: 0,
                    right: 0,
                    height: "1px",
                    background:
                      "linear-gradient(90deg, transparent, rgba(99,102,241,0.4), transparent)",
                  },
                }}
              >
                <motion.div {...fadeUp(0.25)}>
                  <Avatar
                    sx={{
                      mb: 2,
                      bgcolor: "rgba(99,102,241,0.15)",
                      color: "#818cf8",
                      border: "1px solid rgba(99,102,241,0.3)",
                    }}
                  >
                    <LockOutlinedIcon />
                  </Avatar>
                </motion.div>

                <motion.div {...fadeUp(0.3)}>
                  <Box sx={{ mb: 3, display: "flex", gap: 1 }}>
                    <Button
                      variant={formState === 0 ? "contained" : "outlined"}
                      onClick={() => {
                        setFormState(0);
                        setForgotMode(false);
                        setError("");
                      }}
                      sx={{
                        borderRadius: "999px",
                        textTransform: "none",
                        fontWeight: 600,
                        px: 2.5,
                        ...(formState === 0
                          ? {
                              background:
                                "linear-gradient(135deg, #3b82f6, #6366f1)",
                              boxShadow: "0 6px 20px rgba(99,102,241,0.35)",
                            }
                          : {
                              borderColor: "rgba(148,163,184,0.22)",
                              color: "rgba(226,232,240,0.72)",
                              "&:hover": {
                                borderColor: "rgba(148,163,184,0.35)",
                                background: "rgba(148,163,184,0.06)",
                              },
                            }),
                      }}
                    >
                      Sign In
                    </Button>
                    <Button
                      variant={formState === 1 ? "contained" : "outlined"}
                      onClick={() => {
                        setFormState(1);
                        setForgotMode(false);
                        setError("");
                      }}
                      sx={{
                        borderRadius: "999px",
                        textTransform: "none",
                        fontWeight: 600,
                        px: 2.5,
                        ...(formState === 1
                          ? {
                              background:
                                "linear-gradient(135deg, #3b82f6, #6366f1)",
                              boxShadow: "0 6px 20px rgba(99,102,241,0.35)",
                            }
                          : {
                              borderColor: "rgba(148,163,184,0.22)",
                              color: "rgba(226,232,240,0.72)",
                              "&:hover": {
                                borderColor: "rgba(148,163,184,0.35)",
                                background: "rgba(148,163,184,0.06)",
                              },
                            }),
                      }}
                    >
                      Sign Up
                    </Button>
                  </Box>
                </motion.div>

                <Box
                  component="form"
                  noValidate
                  sx={{ mt: 1 }}
                  onSubmit={(e) => {
                    e.preventDefault();
                    handleAuth();
                  }}
                >
                  <AnimatePresence mode="wait">
                    {(formState === 1 || forgotMode) && (
                      <motion.div
                        key="email-block"
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.3 }}
                      >
                        {formState === 1 && !forgotMode && (
                          <TextField
                            margin="normal"
                            required
                            fullWidth
                            id="fullname"
                            label="Full Name"
                            name="fullname"
                            value={name}
                            autoFocus
                            size="small"
                            onChange={(e) => setName(e.target.value)}
                            sx={textFieldSx}
                          />
                        )}

                        <TextField
                          margin="normal"
                          required={forgotMode}
                          fullWidth
                          id="email"
                          label={forgotMode ? "Email" : "Email (optional)"}
                          name="email"
                          value={email}
                          type="email"
                          autoFocus={forgotMode}
                          size="small"
                          onChange={(e) => setEmail(e.target.value)}
                          sx={textFieldSx}
                        />
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {!forgotMode && (
                    <>
                      <TextField
                        margin="normal"
                        required
                        fullWidth
                        id="username"
                        label="Username"
                        name="username"
                        value={username}
                        autoFocus={formState === 0}
                        size="small"
                        onChange={(e) => setUsername(e.target.value)}
                        sx={textFieldSx}
                      />
                      <TextField
                        margin="normal"
                        required
                        fullWidth
                        name="password"
                        label="Password"
                        value={password}
                        type={showPassword ? "text" : "password"}
                        size="small"
                        autoComplete="current-password"
                        onChange={(e) => setPassword(e.target.value)}
                        id="password"
                        InputProps={{
                          endAdornment: (
                            <InputAdornment position="end">
                              <IconButton
                                aria-label={
                                  showPassword ? "Hide password" : "Show password"
                                }
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
                    </>
                  )}

                  {formState === 0 && !forgotMode && (
                    <Box sx={{ display: "flex", justifyContent: "flex-end", mt: 0.5 }}>
                      <Link
                        component="button"
                        type="button"
                        underline="hover"
                        onClick={() => {
                          setForgotMode(true);
                          setError("");
                        }}
                        sx={{
                          color: "#93c5fd",
                          fontSize: "0.85rem",
                          textDecorationColor: "rgba(147,197,253,0.4)",
                        }}
                      >
                        Forgot password?
                      </Link>
                    </Box>
                  )}

                  {forgotMode && (
                    <Box sx={{ display: "flex", justifyContent: "flex-start", mt: 0.5 }}>
                      <Link
                        component="button"
                        type="button"
                        underline="hover"
                        onClick={() => {
                          setForgotMode(false);
                          setError("");
                        }}
                        sx={{
                          color: "rgba(226,232,240,0.8)",
                          fontSize: "0.85rem",
                        }}
                      >
                        Back to login
                      </Link>
                    </Box>
                  )}

                  <AnimatePresence>
                    {error && (
                      <motion.div
                        initial={{ opacity: 0, y: -6 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.25 }}
                      >
                        <Box
                          sx={{
                            color: "#fca5a5",
                            background: "rgba(239,68,68,0.08)",
                            borderRadius: "10px",
                            p: 1,
                            mt: 1,
                            fontSize: "0.875rem",
                            border: "1px solid rgba(239,68,68,0.2)",
                          }}
                        >
                          {error}
                        </Box>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {resetLink && (
                    <Box
                      sx={{
                        mt: 1.5,
                        p: 1.5,
                        borderRadius: "10px",
                        border: "1px solid rgba(59,130,246,0.35)",
                        background: "rgba(59,130,246,0.08)",
                      }}
                    >
                      <Box
                        sx={{
                          color: "#bfdbfe",
                          fontSize: "0.82rem",
                          mb: 0.8,
                          fontWeight: 600,
                        }}
                      >
                        Development reset link
                      </Box>
                      <Link
                        href={resetLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        sx={{
                          color: "#93c5fd",
                          fontSize: "0.82rem",
                          wordBreak: "break-all",
                          textDecorationColor: "rgba(147,197,253,0.5)",
                        }}
                      >
                        {resetLink}
                      </Link>
                    </Box>
                  )}

                  <motion.div
                    whileHover={{ scale: 1.01 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    <Button
                      type="submit"
                      fullWidth
                      variant="contained"
                      disabled={isSubmitting}
                      sx={{
                        mt: 3,
                        mb: 2,
                        borderRadius: "12px",
                        textTransform: "none",
                        fontWeight: 700,
                        fontSize: "0.95rem",
                        py: 1.2,
                        background: "linear-gradient(135deg, #3b82f6, #6366f1)",
                        boxShadow: "0 8px 24px rgba(99,102,241,0.35)",
                        "&:hover": {
                          boxShadow: "0 12px 32px rgba(99,102,241,0.45)",
                        },
                      }}
                    >
                      {isSubmitting ? (
                        <CircularProgress size={20} sx={{ color: "white" }} />
                      ) : forgotMode ? (
                        "Send Reset Link"
                      ) : formState === 0 ? (
                        "Login"
                      ) : (
                        "Register"
                      )}
                    </Button>
                  </motion.div>
                </Box>
              </Box>
            </motion.div>
          </Grid>
        </Grid>

        <Snackbar
          open={open}
          autoHideDuration={3500}
          onClose={() => setOpen(false)}
          message={message}
        />
      </ThemeProvider>
    </PageTransition>
  );
}
