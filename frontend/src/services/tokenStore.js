/**
 * Token Store — In-memory access token + localStorage refresh token.
 * Fallback for cross-origin deployments where httpOnly cookies are blocked.
 *
 * Access token: kept in memory only (cleared on page refresh, re-obtained via refresh flow).
 * Refresh token: stored in localStorage (survives page refresh, 7-day expiry).
 */

let accessToken = null;

export const getAccessToken = () => accessToken;
export const setAccessToken = (token) => {
  accessToken = token;
};

const REFRESH_KEY = "apna_meet_rt";

export const getRefreshToken = () => {
  try {
    return localStorage.getItem(REFRESH_KEY);
  } catch {
    return null;
  }
};

export const setRefreshToken = (token) => {
  try {
    if (token) {
      localStorage.setItem(REFRESH_KEY, token);
    } else {
      localStorage.removeItem(REFRESH_KEY);
    }
  } catch {
    // localStorage unavailable (private browsing, etc.)
  }
};

export const clearAllTokens = () => {
  accessToken = null;
  try {
    localStorage.removeItem(REFRESH_KEY);
  } catch {
    // ignore
  }
};
