/**
 * API Service — Axios instance with interceptors for JWT auth.
 * Uses cookies as primary auth + Authorization header as cross-origin fallback.
 */
import axios from "axios";
import server from "../environment";
import { getAccessToken, getRefreshToken, setAccessToken } from "./tokenStore";

const API_BASE = server;

const api = axios.create({
  baseURL: `${API_BASE}/api/v1`,
  withCredentials: true, // Send cookies automatically
  timeout: 15000,
  headers: {
    "Content-Type": "application/json",
  },
});

// Request interceptor — attach Authorization header as fallback for cross-origin
api.interceptors.request.use((config) => {
  const token = getAccessToken();
  if (token && !config.headers.Authorization) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Response interceptor — auto-refresh token on 401
let isRefreshing = false;
let failedQueue = [];

const processQueue = (error) => {
  failedQueue.forEach(({ resolve, reject }) => {
    error ? reject(error) : resolve();
  });
  failedQueue = [];
};

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    const url = originalRequest.url || "";

    // Don't attempt refresh for auth check or refresh endpoints
    const skipRefresh =
      url.includes("/auth/me") ||
      url.includes("/auth/refresh") ||
      url.includes("/auth/login") ||
      url.includes("/auth/register");

    // If 401 and not already retrying, attempt token refresh
    if (
      error.response?.status === 401 &&
      !originalRequest._retry &&
      !skipRefresh
    ) {
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        }).then(() => api(originalRequest));
      }

      originalRequest._retry = true;
      isRefreshing = true;

      try {
        const refreshRes = await axios.post(
          `${API_BASE}/api/v1/auth/refresh`,
          { refreshToken: getRefreshToken() },
          { withCredentials: true },
        );
        if (refreshRes.data.accessToken) {
          setAccessToken(refreshRes.data.accessToken);
        }
        processQueue(null);
        return api(originalRequest);
      } catch (refreshError) {
        processQueue(refreshError);
        // Redirect to login on refresh failure
        window.dispatchEvent(new CustomEvent("auth:expired"));
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(error);
  },
);

export default api;
export { API_BASE };
