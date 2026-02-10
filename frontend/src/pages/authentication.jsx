import LockOutlinedIcon from "@mui/icons-material/LockOutlined";
import { Snackbar } from "@mui/material";
import Avatar from "@mui/material/Avatar";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import CssBaseline from "@mui/material/CssBaseline";
import Grid from "@mui/material/Grid";
import Paper from "@mui/material/Paper";
import TextField from "@mui/material/TextField";
import { createTheme, ThemeProvider } from "@mui/material/styles";
import * as React from "react";
import { AuthContext } from "../contexts/AuthContext";

// TODO remove, this demo shouldn't need to reset the theme.

const defaultTheme = createTheme({
  palette: {
    primary: {
      main: "#3b82f6",
    },
    background: {
      default: "#f8fafc",
    },
  },
  typography: {
    fontFamily: "'Inter', 'Segoe UI', sans-serif",
  },
});

export default function Authentication() {
  const [username, setUsername] = React.useState();
  const [password, setPassword] = React.useState();
  const [name, setName] = React.useState();
  const [error, setError] = React.useState();
  const [message, setMessage] = React.useState();

  const [formState, setFormState] = React.useState(0);

  const [open, setOpen] = React.useState(false);

  const { handleRegister, handleLogin } = React.useContext(AuthContext);

  let handleAuth = async () => {
    try {
      if (formState === 0) {
        // Login
        const result = await handleLogin(username, password);
        if (!result.success) {
          setError(result.message);
        }
      }
      if (formState === 1) {
        // Register
        const result = await handleRegister(name, username, password);
        if (result.success) {
          setUsername("");
          setMessage(result.message);
          setOpen(true);
          setError("");
          setFormState(0);
          setPassword("");
          setName("");
        } else {
          setError(result.message);
        }
      }
    } catch (err) {
      console.log(err);
      setError("An unexpected error occurred. Please try again.");
    }
  };

  return (
    <ThemeProvider theme={defaultTheme}>
      <Grid container component="main" sx={{ minHeight: "100vh" }}>
        <CssBaseline />
        <Grid
          item
          xs={false}
          sm={4}
          md={7}
          sx={{
            background:
              "linear-gradient(135deg, rgba(15,23,42,0.95), rgba(59,130,246,0.4))",
            color: "#f8fafc",
            display: { xs: "none", sm: "flex" },
            flexDirection: "column",
            justifyContent: "space-between",
            p: 6,
          }}
        >
          <Box>
            <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
              <Box
                sx={{
                  width: 12,
                  height: 12,
                  borderRadius: "50%",
                  background: "#60a5fa",
                  boxShadow: "0 0 12px rgba(96,165,250,0.8)",
                }}
              />
              <Box component="h2" sx={{ fontSize: "1.4rem" }}>
                Apna Meet
              </Box>
            </Box>
            <Box sx={{ mt: 8, maxWidth: 380 }}>
              <Box component="h1" sx={{ fontSize: "2.5rem", mb: 2 }}>
                Welcome back.
              </Box>
              <Box sx={{ color: "rgba(248,250,252,0.8)", fontSize: "1rem" }}>
                Sign in to keep your meetings organized, secure, and always in
                sync.
              </Box>
            </Box>
          </Box>
          <Box sx={{ fontSize: "0.9rem", color: "rgba(248,250,252,0.7)" }}>
            Private, fast, and built for calm conversations.
          </Box>
        </Grid>
        <Grid
          item
          xs={12}
          sm={8}
          md={5}
          component={Paper}
          elevation={0}
          square
          sx={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "#f8fafc",
          }}
        >
          <Box
            sx={{
              my: 6,
              mx: { xs: 3, sm: 6 },
              display: "flex",
              flexDirection: "column",
              alignItems: "stretch",
              width: "100%",
              maxWidth: 420,
            }}
          >
            <Avatar sx={{ mb: 2, bgcolor: "primary.main" }}>
              <LockOutlinedIcon />
            </Avatar>

            <Box sx={{ mb: 3 }}>
              <Button
                variant={formState === 0 ? "contained" : "outlined"}
                onClick={() => {
                  setFormState(0);
                }}
                sx={{ mr: 1 }}
              >
                Sign In
              </Button>
              <Button
                variant={formState === 1 ? "contained" : "outlined"}
                onClick={() => {
                  setFormState(1);
                }}
              >
                Sign Up
              </Button>
            </Box>

            <Box component="form" noValidate sx={{ mt: 1 }}>
              {formState === 1 ? (
                <TextField
                  margin="normal"
                  required
                  fullWidth
                  id="username"
                  label="Full Name"
                  name="username"
                  value={name}
                  autoFocus
                  size="small"
                  onChange={(e) => setName(e.target.value)}
                />
              ) : (
                <></>
              )}

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
              />
              <TextField
                margin="normal"
                required
                fullWidth
                name="password"
                label="Password"
                value={password}
                type="password"
                size="small"
                onChange={(e) => setPassword(e.target.value)}
                id="password"
              />

              <Box sx={{ color: "#ef4444", minHeight: 20 }}>{error}</Box>

              <Button
                type="button"
                fullWidth
                variant="contained"
                sx={{ mt: 3, mb: 2 }}
                onClick={handleAuth}
              >
                {formState === 0 ? "Login " : "Register"}
              </Button>
            </Box>
          </Box>
        </Grid>
      </Grid>

      <Snackbar open={open} autoHideDuration={4000} message={message} />
    </ThemeProvider>
  );
}
