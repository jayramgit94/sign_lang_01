/**
 * Audit Logging Service
 * Tracks user actions for compliance and security auditing
 */

import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { getClientIpFromRequest } from "../utils/clientIp.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const logsDir = path.join(__dirname, "../../logs");

// Ensure logs directory exists
await fs.mkdir(logsDir, { recursive: true });

const AUDIT_LOG_FILE = path.join(logsDir, "audit.log");

/**
 * Log audit event
 * @param {Object} event - Event object
 * @param {String} event.userId - User ID (optional)
 * @param {String} event.username - Username
 * @param {String} event.action - Action type (login, logout, password_reset, etc.)
 * @param {String} event.resource - Resource affected (user, meeting, etc.)
 * @param {String} event.ip - IP address
 * @param {String} event.userAgent - User agent string
 * @param {Boolean} event.success - Whether action succeeded
 * @param {String} event.details - Additional context
 */
export const logAudit = async (event) => {
  try {
    const timestamp = new Date().toISOString();
    const logEntry = {
      timestamp,
      userId: event.userId || "unknown",
      username: event.username || "unknown",
      action: event.action,
      resource: event.resource,
      ip: event.ip,
      userAgent: event.userAgent?.substring(0, 200) || "unknown",
      success: event.success !== false,
      details: event.details || "",
    };

    // Write to audit log file (append mode)
    const logLine = JSON.stringify(logEntry) + "\n";
    await fs.appendFile(AUDIT_LOG_FILE, logLine, "utf-8");
  } catch (err) {
    console.error("Error logging audit event:", err.message);
  }
};

/**
 * Create audit middleware for Express
 * Logs common actions (login, logout, API calls)
 */
export const auditMiddleware = () => {
  return (req, res, next) => {
    const originalSend = res.send;

    res.send = function (data) {
      // Log after response is sent (check status code)
      const success = res.statusCode >= 200 && res.statusCode < 400;
      const action = getActionFromPath(req.path, req.method);

      if (action) {
        const event = {
          userId: req.userId || null,
          username: req.username || "anonymous",
          action,
          resource: getResourceFromPath(req.path),
          ip: getClientIpFromRequest(req),
          userAgent: req.headers["user-agent"],
          success,
          details: `${req.method} ${req.path} - Status: ${res.statusCode}`,
        };

        logAudit(event);
      }

      return originalSend.call(this, data);
    };

    next();
  };
};

/**
 * Determine action type from request path and method
 */
function getActionFromPath(path, method) {
  if (path.includes("/auth/register")) return "register";
  if (path.includes("/auth/login")) return "login";
  if (path.includes("/auth/logout")) return "logout";
  if (path.includes("/auth/refresh")) return "token_refresh";
  if (path.includes("/auth/verify-email")) return "email_verification";
  if (path.includes("/auth/forgot-password")) return "password_reset_request";
  if (path.includes("/auth/reset-password")) return "password_reset";
  if (path.includes("/meetings") && method === "POST") return "create_meeting";
  if (path.includes("/meetings") && method === "DELETE") return "delete_meeting";
  return null;
}

/**
 * Get resource type from request path
 */
function getResourceFromPath(path) {
  if (path.includes("/auth")) return "auth";
  if (path.includes("/meetings")) return "meeting";
  if (path.includes("/users")) return "user";
  return "unknown";
}

/**
 * Get audit logs (latest first)
 * @param {Number} limit - Number of logs to return
 */
export const getAuditLogs = async (limit = 100) => {
  try {
    const data = await fs.readFile(AUDIT_LOG_FILE, "utf-8");
    const logs = data
      .split("\n")
      .filter((line) => line.trim())
      .map((line) => JSON.parse(line))
      .reverse()
      .slice(0, limit);

    return logs;
  } catch (err) {
    console.error("Error reading audit logs:", err.message);
    return [];
  }
};

/**
 * Get audit logs for specific user
 */
export const getUserAuditLogs = async (userId, limit = 50) => {
  try {
    const logs = await getAuditLogs(1000); // Get more to filter
    return logs.filter((log) => log.userId === userId).slice(0, limit);
  } catch (err) {
    console.error("Error reading user audit logs:", err.message);
    return [];
  }
};
