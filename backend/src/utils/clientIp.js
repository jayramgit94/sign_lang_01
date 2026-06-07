/**
 * Resolve client IP from Express req or Socket.IO handshake.
 * Handles comma-separated x-forwarded-for chains from reverse proxies.
 */
export const getClientIpFromForwarded = (forwarded, fallback = "") => {
  if (!forwarded) return fallback || "";
  const first = String(forwarded).split(",")[0]?.trim();
  return first || fallback || "";
};

export const getClientIpFromRequest = (req) => {
  const fromForwarded = getClientIpFromForwarded(
    req.headers["x-forwarded-for"],
    "",
  );
  if (fromForwarded) return fromForwarded;
  const realIp = req.headers["x-real-ip"];
  if (realIp) return String(realIp).trim();
  return req.socket?.remoteAddress || req.ip || "unknown";
};

export const getClientIpFromSocket = (socket) =>
  getClientIpFromForwarded(
    socket.handshake.headers["x-forwarded-for"],
    socket.handshake.address || "",
  );
