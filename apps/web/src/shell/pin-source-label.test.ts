import { describe, expect, it } from "vitest";
import { pinLabelFromArtifactName, pinLabelFromMessageBody } from "./pin-source-label";

describe("pin source labels", () => {
  it("uses the first non-empty line of a message body", () => {
    expect(pinLabelFromMessageBody("  \nHello team\nMore text")).toBe("Hello team");
  });

  it("falls back when a message body is empty", () => {
    expect(pinLabelFromMessageBody("   \n")).toBe("Pinned message");
  });

  it("truncates long artifact names", () => {
    const label = pinLabelFromArtifactName("a".repeat(90));
    expect(label).toHaveLength(78);
    expect(label.endsWith("…")).toBe(true);
  });
});
