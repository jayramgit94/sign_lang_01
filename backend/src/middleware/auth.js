/**
 * JWT Authentication Middleware
 * - Extracts accessToken from httpOnly cookie
 * - Verifies and attaches decoded user to req.user
 * - Optional mode: sets req.user if present, skips if not
 */
import { verifyAccessToken } from "../services/jwt.service.js";

/**
 * Require authentication — rejects request if token is missing/invalid.
 */
export const requireAuth = (req, res, next) => {
  const token = req.cookies?.accessToken;

  if (!token) {
    return res.status(401).json({ message: "Authentication required." });
  }

  const decoded = verifyAccessToken(token);
  if (!decoded) {
    return res.status(401).json({ message: "Invalid or expired token." });
  }

  req.user = decoded;
  next();
};

/**
 * Optional authentication — attaches user if token present, continues either way.
 */
export const optionalAuth = (req, res, next) => {
  const token = req.cookies?.accessToken;
  if (token) {
    const decoded = verifyAccessToken(token);
    if (decoded) req.user = decoded;
  }
  next();
};

/**
 * Socket.IO authentication middleware
 * - Extracts token from handshake cookie or auth object
 * - Sets socket.userId and socket.username
 */
export const socketAuth = (socket, next) => {
  // Try cookie first (automatic with withCredentials)
  let token = null;
  const cookieHeader = socket.handshake.headers?.cookie || "";
  const match = cookieHeader.match(/accessToken=([^;]+)/);
  if (match) token = match[1];

  // Fallback: handshake auth object (for environments where cookies don't work)
  if (!token && socket.handshake.auth?.token) {
    token = socket.handshake.auth.token;
  }

  if (token) {
    const decoded = verifyAccessToken(token);
    if (decoded) {
      socket.userId = decoded.userId;
      socket.username = decoded.username;
      socket.authenticated = true;
    }
  }

  // Allow unauthenticated connections (guest users) but mark them
  if (!socket.authenticated) {
    socket.authenticated = false;
    socket.username = socket.handshake.auth?.username || "Guest";
  }

  next();
};
