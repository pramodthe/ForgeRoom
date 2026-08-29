/** Scroll helpers for reconnect-safe timeline stickiness. */

export const NEAR_BOTTOM_PX = 80;

export function isNearBottom(element: {
  scrollTop: number;
  scrollHeight: number;
  clientHeight: number;
}): boolean {
  return element.scrollHeight - element.scrollTop - element.clientHeight <= NEAR_BOTTOM_PX;
}

export function timelineLiveAnnouncement(input: {
  connection: "connecting" | "live" | "reconnecting" | "offline";
  activeRunCount: number;
  needsInputCount: number;
}): string {
  if (input.connection === "reconnecting") {
    return "Timeline reconnecting. Scroll position is preserved.";
  }
  if (input.connection === "offline") {
    return "Timeline offline.";
  }
  if (input.connection === "connecting") {
    return "Timeline connecting.";
  }
  if (input.needsInputCount > 0) {
    return `${input.needsInputCount} coworker${input.needsInputCount === 1 ? " needs" : "s need"} input.`;
  }
  if (input.activeRunCount > 0) {
    return `${input.activeRunCount} coworker${input.activeRunCount === 1 ? " is" : "s are"} working.`;
  }
  return "Timeline live.";
}
