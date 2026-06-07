/**
 * Utility Helpers
 */

/**
 * Generate a simple 6-letter meeting code.
 */
export const generateMeetingCode = () => {
  const chars = "abcdefghijklmnopqrstuvwxyz";
  return Array.from(
    { length: 6 },
    () => chars[Math.floor(Math.random() * chars.length)],
  ).join("");
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

/** Max tiles shown per page in gallery mode (large meetings). */
export const GALLERY_PAGE_SIZE = 16;

/** Participant count above which gallery pagination activates. */
export const GALLERY_THRESHOLD = 25;

/**
 * Classify grid layout based on participant count.
 * @deprecated Prefer getGridLayout for column-aware layouts.
 */
export const getGridClass = (count) => getGridLayout(count).className;

/**
 * Smart grid layout config — scales from 1 to 50+ participants.
 * @returns {{ className: string, columns: number, rows: number, paginated?: boolean }}
 */
export const getGridLayout = (count) => {
  if (count <= 1) return { className: "gridSingle", columns: 1, rows: 1 };
  if (count === 2) return { className: "gridDouble", columns: 2, rows: 1 };
  if (count <= 4) return { className: "gridQuad", columns: 2, rows: 2 };
  if (count <= 6) return { className: "gridSix", columns: 3, rows: 2 };
  if (count <= 9) return { className: "gridNine", columns: 3, rows: 3 };
  if (count <= 12) return { className: "gridTwelve", columns: 4, rows: 3 };
  if (count <= 16) return { className: "gridSixteen", columns: 4, rows: 4 };
  if (count <= 25) return { className: "gridTwentyFive", columns: 5, rows: 5 };
  if (count <= GALLERY_THRESHOLD)
    return { className: "gridLarge", columns: 6, rows: 6 };
  return {
    className: "gridGallery",
    columns: 4,
    rows: 4,
    paginated: true,
  };
};

/**
 * Format elapsed seconds as MM:SS or H:MM:SS.
 */
export const formatDuration = (totalSeconds) => {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  const pad = (n) => String(n).padStart(2, "0");
  if (h > 0) return `${h}:${pad(m)}:${pad(s)}`;
  return `${pad(m)}:${pad(s)}`;
};
