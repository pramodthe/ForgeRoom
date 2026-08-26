export type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  retryAfterMs: number;
};

export function createSlidingWindowRateLimiter(options: {
  limit: number;
  windowMs: number;
  now?: () => number;
}) {
  const hits = new Map<string, number[]>();
  const now = options.now ?? (() => Date.now());

  return {
    take(key: string): RateLimitResult {
      const current = now();
      const windowStart = current - options.windowMs;
      const recent = (hits.get(key) ?? []).filter((stamp) => stamp > windowStart);
      if (recent.length >= options.limit) {
        hits.set(key, recent);
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
  };
}
