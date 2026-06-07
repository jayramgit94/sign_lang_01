/**
 * Socket rate limiter — simple fixed-window counters per key.
 */
export const createRateLimiter = ({ windowMs, max }) => {
  const counters = new Map();

  return (key) => {
    const now = Date.now();
    const entry = counters.get(key);

    if (!entry || now > entry.resetAt) {
      counters.set(key, { count: 1, resetAt: now + windowMs });
      return true;
    }

    entry.count += 1;
    return entry.count <= max;
  };
};
