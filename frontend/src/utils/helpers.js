/**
 * Utility Helpers
 */

/**
 * Generate a meeting code (human-readable format: xxx-xxxx-xxx).
 */
export const generateMeetingCode = () => {
  const chars = "abcdefghijklmnopqrstuvwxyz";
  const rand = (len) =>
    Array.from(
      { length: len },
      () => chars[Math.floor(Math.random() * chars.length)],
    ).join("");
  return `${rand(3)}-${rand(4)}-${rand(3)}`;
};

/**
 * Format a timestamp to a human-readable string.
 */
export const formatTime = (timestamp) => {
  const date = new Date(timestamp);
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
};

/**
 * Format a date for meeting history.
 */
export const formatDate = (dateStr) => {
  return new Date(dateStr).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

/**
 * Debounce function.
 */
export const debounce = (fn, delay) => {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
};

/**
 * Throttle function.
 */
export const throttle = (fn, limit) => {
  let inThrottle = false;
  return (...args) => {
    if (!inThrottle) {
      fn(...args);
      inThrottle = true;
      setTimeout(() => (inThrottle = false), limit);
    }
  };
};

/**
 * Truncate text to a maximum length.
 */
export const truncate = (text, maxLen = 50) =>
  text.length > maxLen ? text.slice(0, maxLen) + "..." : text;

/**
 * Get initials from a name (for avatars).
 */
export const getInitials = (name) => {
  if (!name) return "?";
  return name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
};

/**
 * Classify grid layout based on participant count.
 */
export const getGridClass = (count) => {
  if (count <= 1) return "gridSingle";
  if (count === 2) return "gridDouble";
  return "gridMulti";
};
