/**
 * Auth Context — JWT cookie-based authentication.
 * Handles register, login, logout, token refresh, and user state.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import api, { ensureCsrfToken } from "../services/api";
import {
  clearAllTokens,
  getRefreshToken,
  setAccessToken,
  setRefreshToken,
} from "../services/tokenStore";
import { AuthContext } from "./AuthContextType";

export const AuthProvider = ({ children }) => {
  const [userData, setUserData] = useState(null);
  const [loading, setLoading] = useState(true);
  const router = useNavigate();

  // Stable ref for navigate — avoids useEffect re-running on every route change.
  // In React Router v7, useNavigate() returns a new reference on location change,
  // which would cause the effect to re-fire and race with login state updates.
  const routerRef = useRef(router);
  routerRef.current = router;

  const getDetailedErrorMessage = (error, fallback) => {
    const data = error?.response?.data;
    const firstValidationMessage = Array.isArray(data?.errors)
      ? data.errors[0]?.message
      : null;
    return firstValidationMessage || data?.message || fallback;
  };

  // Check auth status ONCE on mount — tries cookie first, then token refresh fallback
  useEffect(() => {
    let cancelled = false;

    const checkAuth = async () => {
      try {
        const res = await api.get("/auth/me");
        if (!cancelled) setUserData(res.data.user);
      } catch {
        // Access token missing/expired — try refreshing with stored refresh token
        const storedRefresh = getRefreshToken();
        if (storedRefresh) {
          try {
            const refreshRes = await api.post("/auth/refresh", {
              refreshToken: storedRefresh,
            });
            if (!cancelled && refreshRes.data.accessToken) {
              setAccessToken(refreshRes.data.accessToken);
            }
            if (!cancelled && refreshRes.data.refreshToken) {
              setRefreshToken(refreshRes.data.refreshToken);
            }
            // Retry auth check with new token
            const retryRes = await api.get("/auth/me");
            if (!cancelled) setUserData(retryRes.data.user);
            return;
          } catch {
            // Refresh also failed — user is truly unauthenticated
          }
        }
        if (!cancelled) {
          setUserData(null);
          clearAllTokens();
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    checkAuth();

    // Listen for token expiry events from API interceptor
    const handleExpired = () => {
      setUserData(null);
      clearAllTokens();
      // Don't rip user out of an active video call
      const path = window.location.pathname;
      const safeRoutes = ["/", "/auth", "/home", "/history"];
      if (safeRoutes.includes(path)) {
        routerRef.current("/auth");
      }
    };
    window.addEventListener("auth:expired", handleExpired);
    return () => {
      cancelled = true;
      window.removeEventListener("auth:expired", handleExpired);
    };
  }, []);

  const handleRegister = async (name, username, email, password) => {
    try {
      await ensureCsrfToken();
      const payload = {
        name,
        username,
        password,
      };

      if (email?.trim()) {
        payload.email = email.trim().toLowerCase();
      }

      const res = await api.post("/auth/register", payload);
      if (res.data.accessToken) setAccessToken(res.data.accessToken);
      if (res.data.refreshToken) setRefreshToken(res.data.refreshToken);
      setUserData(res.data.user);
      return {
        success: true,
        message: res.data?.message || "Registration successful.",
        emailVerificationToken: res.data?.emailVerificationToken,
      };
    } catch (error) {
      if (!error.response) {
        return { success: false, message: "Unable to reach server." };
      }

      const serverCode = error.response?.data?.code;
      const validationErrors = error.response?.data?.errors;

      if (serverCode === "USERNAME_TAKEN") {
        return { success: false, message: "Username already in use. Try another one." };
      }

      if (serverCode === "EMAIL_ALREADY_REGISTERED") {
        return {
          success: false,
          message: "Email is already registered. Try logging in or use Forgot Password.",
        };
      }

      if (error.response?.status === 400) {
        return {
          success: false,
          message: getDetailedErrorMessage(error, "Registration failed."),
          errors: validationErrors,
        };
      }

      return {
        success: false,
        message: getDetailedErrorMessage(error, "Registration failed."),
        errors: validationErrors,
      };
    }
  };

  const handleLogin = async (username, password) => {
    try {
      await ensureCsrfToken();
      const res = await api.post("/auth/login", { username, password });
      if (res.data.accessToken) setAccessToken(res.data.accessToken);
      if (res.data.refreshToken) setRefreshToken(res.data.refreshToken);
      setUserData(res.data.user);
      router("/home");
      return { success: true, message: "Login successful." };
    } catch (error) {
      if (!error.response) {
        return { success: false, message: "Unable to reach server." };
      }

      const serverCode = error.response?.data?.code;
      if (serverCode === "USER_NOT_FOUND") {
        return {
          success: false,
          message: "This username is not registered. Please sign up first.",
          code: serverCode,
        };
      }

      if (serverCode === "WRONG_PASSWORD") {
        return {
          success: false,
          message: "Wrong password. Please try again.",
          code: serverCode,
          attemptsRemaining: error.response?.data?.attemptsRemaining,
        };
      }

      if (serverCode === "ACCOUNT_LOCKED") {
        return {
          success: false,
          message:
            "Account temporarily locked after too many failed attempts. Try again in 30 minutes.",
          code: serverCode,
        };
      }

      return {
        success: false,
        message: getDetailedErrorMessage(error, "Login failed."),
        attemptsRemaining: error.response?.data?.attemptsRemaining,
        code: serverCode,
      };
    }
  };

  const handleForgotPassword = async (email) => {
    try {
      await ensureCsrfToken();
      const res = await api.post("/auth/forgot-password", { email });
      return {
        success: true,
        message: res.data?.resetUrl
          ? "Email service is not configured yet. Use the temporary reset link below."
          : res.data?.message ||
            "If email exists, you will receive a password reset link.",
        resetUrl: res.data?.resetUrl,
      };
    } catch (error) {
      if (!error.response) {
        return { success: false, message: "Unable to reach server." };
      }
      return {
        success: false,
        message: getDetailedErrorMessage(error, "Failed to request reset."),
      };
    }
  };

  const handleResetPassword = async (token, newPassword) => {
    try {
      await ensureCsrfToken();
      const res = await api.post("/auth/reset-password", {
        token,
        newPassword,
      });
      return {
        success: true,
        message:
          res.data?.message ||
          "Password reset successful. Please login with your new password.",
      };
    } catch (error) {
      if (!error.response) {
        return { success: false, message: "Unable to reach server." };
      }
      return {
        success: false,
        message: getDetailedErrorMessage(error, "Failed to reset password."),
      };
    }
  };

  const handleVerifyEmail = useCallback(async (token) => {
    try {
      await ensureCsrfToken();
      const res = await api.post("/auth/verify-email", { token });
      setUserData(res.data?.user || null);
      return {
        success: true,
        message: res.data?.message || "Email verified successfully.",
      };
    } catch (error) {
      if (!error.response) {
        return { success: false, message: "Unable to reach server." };
      }
      return {
        success: false,
        message: getDetailedErrorMessage(error, "Failed to verify email."),
      };
    }
  }, []);

  const handleLogout = useCallback(async () => {
    try {
      await api.post("/auth/logout");
    } catch {
      // Logout even if request fails
    }
    setUserData(null);
    clearAllTokens();
    routerRef.current("/");
  }, []);

  const getHistoryOfUser = async (params = {}) => {
    try {
      const res = await api.get("/meetings", { params });
      return res.data;
    } catch (error) {
      console.error("Failed to get history:", error.message);
      return { meetings: [], total: 0, page: 1, totalPages: 1, hasMore: false };
    }
  };

  const addToUserHistory = async (meetingCode) => {
    try {
      const res = await api.post("/meetings", { meetingCode });
      return res.data; // returns created meeting doc with _id
    } catch (error) {
      console.error("Failed to save meeting:", error.message);
      return null;
    }
  };

  const updateMeeting = async (id, data) => {
    try {
      const res = await api.patch(`/meetings/${id}`, data);
      return res.data;
    } catch (error) {
      console.error("Failed to update meeting:", error.message);
      return null;
    }
  };

  const deleteMeeting = async (id) => {
    try {
      await api.delete(`/meetings/${id}`);
      return true;
    } catch (error) {
      console.error("Failed to delete meeting:", error.message);
      return false;
    }
  };

  const getMeetingStats = async () => {
    try {
      const res = await api.get("/meetings/stats");
      return res.data;
    } catch (error) {
      console.error("Failed to get stats:", error.message);
      return null;
    }
  };

  const data = {
    userData,
    setUserData,
    loading,
    isAuthenticated: !!userData,
    addToUserHistory,
    getHistoryOfUser,
    updateMeeting,
    deleteMeeting,
    getMeetingStats,
    handleRegister,
    handleLogin,
    handleForgotPassword,
    handleResetPassword,
    handleVerifyEmail,
    handleLogout,
  };

  return <AuthContext.Provider value={data}>{children}</AuthContext.Provider>;
};

export { AuthContext };
