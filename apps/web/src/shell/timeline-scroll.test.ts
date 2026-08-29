import { describe, expect, it } from "vitest";
import { isNearBottom, timelineLiveAnnouncement } from "./timeline-scroll";

describe("timeline scroll and live announcements", () => {
  it("detects near-bottom stickiness", () => {
    expect(isNearBottom({ scrollTop: 920, scrollHeight: 1000, clientHeight: 100 })).toBe(true);
    expect(isNearBottom({ scrollTop: 100, scrollHeight: 1000, clientHeight: 100 })).toBe(false);
  });

  it("announces reconnect and input without token spam", () => {
    expect(
      timelineLiveAnnouncement({
        connection: "reconnecting",
        activeRunCount: 2,
        needsInputCount: 0,
      }),
    ).toBe("Timeline reconnecting. Scroll position is preserved.");
    expect(
      timelineLiveAnnouncement({
        connection: "live",
        activeRunCount: 2,
        needsInputCount: 1,
      }),
    ).toBe("1 coworker needs input.");
    expect(
      timelineLiveAnnouncement({
        connection: "live",
        activeRunCount: 0,
        needsInputCount: 0,
      }),
    ).toBe("Timeline live.");
  });
});
