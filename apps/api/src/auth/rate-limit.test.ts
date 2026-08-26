import { describe, expect, it } from "vitest";
import { createSlidingWindowRateLimiter } from "./rate-limit";

describe("createSlidingWindowRateLimiter", () => {
  it("filters the active key and prunes expired entries when at capacity", () => {
    let nowMs = 1_000;
    const limiter = createSlidingWindowRateLimiter({
      limit: 1,
      windowMs: 100,
      now: () => nowMs,
      maxKeys: 2,
    });

    expect(limiter.take("a").allowed).toBe(true);
    expect(limiter.take("b").allowed).toBe(true);
    expect(limiter.size()).toBe(2);

    nowMs += 200;
    // At capacity with expired keys — prune then accept the new key.
    expect(limiter.take("c").allowed).toBe(true);
    expect(limiter.size()).toBe(1);
  });

  it("rejects new keys once the soft cap is reached with live entries", () => {
    const limiter = createSlidingWindowRateLimiter({
      limit: 5,
      windowMs: 60_000,
      maxKeys: 2,
    });
    expect(limiter.take("a").allowed).toBe(true);
    expect(limiter.take("b").allowed).toBe(true);
    expect(limiter.take("c").allowed).toBe(false);
    expect(limiter.take("a").allowed).toBe(true);
  });
});
