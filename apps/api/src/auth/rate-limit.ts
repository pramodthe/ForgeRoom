export type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  retryAfterMs: number;
};

export function createSlidingWindowRateLimiter(options: {
  limit: number;
  windowMs: number;
  now?: () => number;
  /** Soft cap to bound memory under unique-key abuse. */
  maxKeys?: number;
}) {
  const hits = new Map<string, number[]>();
  const now = options.now ?? (() => Date.now());
  const maxKeys = options.maxKeys ?? 10_000;

  function pruneExpired(windowStart: number) {
    for (const [key, stamps] of hits) {
      const recent = stamps.filter((stamp) => stamp > windowStart);
      if (recent.length === 0) {
        hits.delete(key);
      } else if (recent.length !== stamps.length) {
        hits.set(key, recent);
      }
    }
  }

  return {
    take(key: string): RateLimitResult {
      const current = now();
      const windowStart = current - options.windowMs;

      // Cheap path: only filter this key. Full prune only when near capacity.
      const recent = (hits.get(key) ?? []).filter((stamp) => stamp > windowStart);
      if (recent.length === 0) {
        hits.delete(key);
      } else {
        hits.set(key, recent);
      }

      if (!hits.has(key) && hits.size >= maxKeys) {
        pruneExpired(windowStart);
      }
      if (!hits.has(key) && hits.size >= maxKeys) {
        return { allowed: false, remaining: 0, retryAfterMs: options.windowMs };
      }

      if (recent.length >= options.limit) {
        const retryAfterMs = Math.max(0, recent[0]! + options.windowMs - current);
        return { allowed: false, remaining: 0, retryAfterMs };
      }
      recent.push(current);
      hits.set(key, recent);
      return {
        allowed: true,
        remaining: Math.max(0, options.limit - recent.length),
        retryAfterMs: 0,
      };
    },
    reset() {
      hits.clear();
    },
    size() {
      return hits.size;
    },
  };
}
