import { describe, expect, it } from "vitest";
import { trustedHitlCardElementId } from "./trusted-hitl-host";

describe("trusted HITL host", () => {
  it("builds stable anchor ids for approval and question cards", () => {
    expect(trustedHitlCardElementId({ kind: "approval", id: "proposal_1" })).toBe(
      "trusted-hitl-approval-proposal_1",
    );
    expect(trustedHitlCardElementId({ kind: "question", id: "question_1" })).toBe(
      "trusted-hitl-question-question_1",
    );
  });
});
