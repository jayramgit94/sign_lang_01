import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutline";
import ErrorOutlineIcon from "@mui/icons-material/ErrorOutline";
import { Box, Button, CircularProgress, Paper, Typography } from "@mui/material";
import { useContext, useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import PageTransition from "../components/common/PageTransition";
import { AuthContext } from "../contexts/AuthContext";

export default function VerifyEmail() {
  const [params] = useSearchParams();
  const token = params.get("token") || "";
  const { handleVerifyEmail } = useContext(AuthContext);

  const [loading, setLoading] = useState(true);
  const [success, setSuccess] = useState(false);
  const [message, setMessage] = useState("Verifying your email...");

  useEffect(() => {
    const verify = async () => {
      if (!token) {
        setSuccess(false);
        setMessage("Missing verification token.");
        setLoading(false);
        return;
      }

      const result = await handleVerifyEmail(token);
      setSuccess(result.success);
      setMessage(result.message);
      setLoading(false);
    };

    verify();
  }, [handleVerifyEmail, token]);

  return (
    <PageTransition>
      <Box
        sx={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(165deg, #0c1221 0%, #060a13 60%)",
          px: 2,
        }}
      >
        <Paper
          elevation={0}
          sx={{
            maxWidth: 460,
            width: "100%",
            p: 4,
            borderRadius: "20px",
            background: "rgba(15,23,42,0.55)",
            border: "1px solid rgba(148,163,184,0.2)",
            color: "#e2e8f0",
            textAlign: "center",
          }}
        >
          {loading ? (
            <CircularProgress sx={{ color: "#60a5fa", mb: 2 }} />
          ) : success ? (
            <CheckCircleOutlineIcon sx={{ fontSize: 52, color: "#34d399", mb: 1 }} />
          ) : (
            <ErrorOutlineIcon sx={{ fontSize: 52, color: "#f87171", mb: 1 }} />
          )}

          <Typography variant="h5" sx={{ fontWeight: 700, mb: 1 }}>
            {loading
              ? "Verifying Email"
              : success
                ? "Email Verified"
                : "Verification Failed"}
          </Typography>

          <Typography sx={{ color: "rgba(226,232,240,0.82)", mb: 3 }}>
            {message}
          </Typography>

          <Button
            component={Link}
            to={success ? "/home" : "/auth"}
            variant="contained"
            sx={{
              textTransform: "none",
              fontWeight: 700,
              borderRadius: "10px",
              background: "linear-gradient(135deg, #3b82f6, #6366f1)",
            }}
          >
            {success ? "Go to Home" : "Back to Login"}
          </Button>
        </Paper>
      </Box>
    </PageTransition>
  );
}
