/**
 * Auth Context — JWT cookie-based authentication.
 * Handles register, login, logout, token refresh, and user state.
 */
import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../services/api";
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

  // Check auth status on mount — tries cookie first, then token refresh fallback
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const res = await api.get("/auth/me");
        setUserData(res.data.user);
      } catch {
        // Access token missing/expired — try refreshing with stored refresh token
        const storedRefresh = getRefreshToken();
        if (storedRefresh) {
          try {
            const refreshRes = await api.post("/auth/refresh", {
              refreshToken: storedRefresh,
            });
            if (refreshRes.data.accessToken) {
              setAccessToken(refreshRes.data.accessToken);
            }
            // Retry auth check with new token
            const retryRes = await api.get("/auth/me");
            setUserData(retryRes.data.user);
            return;
          } catch {
            // Refresh also failed — user is truly unauthenticated
          }
        }
        setUserData(null);
        clearAllTokens();
      } finally {
        setLoading(false);
      }
    };
    checkAuth();

    // Listen for token expiry events from API interceptor
    const handleExpired = () => {
      setUserData(null);
      router("/auth");
    };
    window.addEventListener("auth:expired", handleExpired);
    return () => window.removeEventListener("auth:expired", handleExpired);
  }, [router]);

  const handleRegister = async (name, username, password) => {
    try {
      const res = await api.post("/auth/register", {
        name,
        username,
        password,
      });
      if (res.data.accessToken) setAccessToken(res.data.accessToken);
      if (res.data.refreshToken) setRefreshToken(res.data.refreshToken);
      setUserData(res.data.user);
      return { success: true, message: "Registration successful." };
    } catch (error) {
      if (!error.response) {
        return { success: false, message: "Unable to reach server." };
      }
      return {
        success: false,
        message: error.response?.data?.message || "Registration failed.",
        errors: error.response?.data?.errors,
      };
    }
  };

  const handleLogin = async (username, password) => {
    try {
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
      return {
        success: false,
        message: error.response?.data?.message || "Invalid credentials.",
      };
    }
  };

  const handleLogout = useCallback(async () => {
    try {
      await api.post("/auth/logout");
    } catch {
      // Logout even if request fails
    }
    setUserData(null);
    clearAllTokens();
    router("/");
  }, [router]);

  const getHistoryOfUser = async () => {
    try {
      const res = await api.get("/meetings");
      return res.data;
    } catch (error) {
      console.error("Failed to get history:", error.message);
      return [];
    }
  };

  const addToUserHistory = async (meetingCode) => {
    try {
      await api.post("/meetings", { meetingCode });
    } catch (error) {
      console.error("Failed to save meeting:", error.message);
    }
  };

  const data = {
    userData,
    setUserData,
    loading,
    isAuthenticated: !!userData,
    addToUserHistory,
    getHistoryOfUser,
    handleRegister,
    handleLogin,
    handleLogout,
  };

  return <AuthContext.Provider value={data}>{children}</AuthContext.Provider>;
};

export { AuthContext };
