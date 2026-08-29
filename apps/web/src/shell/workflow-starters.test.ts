import { describe, expect, it } from "vitest";
import { buildWorkflowStarters } from "./workflow-starters";

describe("buildWorkflowStarters", () => {
  it("offers a governed action-plan prompt for the seeded operator", () => {
    const starters = buildWorkflowStarters([
      { handle: "operator", name: "Operator", availability: "available" },
    ]);

    expect(starters).toEqual([
      expect.objectContaining({
        label: "Build an action plan",
        prompt: expect.stringContaining("Ask before making any external change"),
      }),
    ]);
  });

  it("adds a team workflow only when multiple coworkers are available", () => {
    const starters = buildWorkflowStarters([
      { handle: "operator", name: "Operator", availability: "available" },
      { handle: "analyst", name: "Analyst", availability: "available" },
      { handle: "offline", name: "Offline", availability: "offline" },
    ]);

    expect(starters.map((starter) => starter.label)).toEqual([
      "Analyze evidence",
      "Build an action plan",
      "Coordinate the team",
    ]);
    expect(starters.at(-1)?.prompt).toMatch(/^@team /);
  });

  it.each(["busy", "queued", "needs_you", "cancelling", "disabled", "offline"])(
    "does not offer new work to a coworker who is %s",
    (availability) => {
      expect(
        buildWorkflowStarters([{ handle: "operator", name: "Operator", availability }]),
      ).toEqual([]);
    },
  );
});
