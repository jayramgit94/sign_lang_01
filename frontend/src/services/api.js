/**
 * API Service — Axios instance with interceptors for JWT auth.
 * Uses cookies as primary auth + Authorization header as cross-origin fallback.
 */
import axios from "axios";
import server from "../environment";
import {
  getAccessToken,
  getRefreshToken,
  setAccessToken,
  setRefreshToken,
} from "./tokenStore";

const API_BASE = server;
const CSRF_COOKIE_NAME = "XSRF-TOKEN";

const getCookieValue = (name) => {
  if (typeof document === "undefined") return "";
  const cookie = document.cookie
    .split("; ")
    .find((row) => row.startsWith(`${name}=`));
  return cookie ? decodeURIComponent(cookie.split("=")[1]) : "";
};

let csrfInitPromise = null;

const bootstrapCsrfToken = async () => {
  const existing = getCookieValue(CSRF_COOKIE_NAME);
  if (existing) return existing;

  if (!csrfInitPromise) {
    csrfInitPromise = axios
      .get(`${API_BASE}/api/v1/auth/csrf-token`, {
        withCredentials: true,
        timeout: 7000,
      })
      .finally(() => {
        csrfInitPromise = null;
      });
  }

  await csrfInitPromise;
  return getCookieValue(CSRF_COOKIE_NAME);
};

const api = axios.create({
  baseURL: `${API_BASE}/api/v1`,
  withCredentials: true, // Send cookies automatically
  timeout: 15000,
  headers: {
    "Content-Type": "application/json",
  },
});

// Request interceptor — attach Authorization and CSRF headers
api.interceptors.request.use(async (config) => {
  const token = getAccessToken();
  if (token && !config.headers.Authorization) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  const method = (config.method || "get").toLowerCase();
  const isMutating = ["post", "put", "patch", "delete"].includes(method);
  const isCsrfBootstrap = (config.url || "").includes("/auth/csrf-token");

  if (isMutating && !isCsrfBootstrap) {
    let csrfToken = getCookieValue(CSRF_COOKIE_NAME);
    if (!csrfToken) {
      csrfToken = await bootstrapCsrfToken();
    }
    if (csrfToken) {
      config.headers["X-XSRF-TOKEN"] = csrfToken;
    }
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
        if (refreshRes.data.refreshToken) {
          setRefreshToken(refreshRes.data.refreshToken);
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
export const ensureCsrfToken = bootstrapCsrfToken;
