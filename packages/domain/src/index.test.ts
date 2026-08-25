import { describe, expect, it } from "vitest";
import * as contracts from "@forgeroom/contracts";
import {
  assertFoundationBoundary,
  canTransitionCoworkerDraft,
  canTransitionRunLifecycle,
  canTransitionTask,
  DOMAIN_RELEASE,
  taskRecordV1Schema,
} from "./index";

describe("domain contract reuse", () => {
  it("re-exports the shared Zod schemas instead of duplicating them", () => {
    expect(DOMAIN_RELEASE).toBe("0.1");
    expect(assertFoundationBoundary().agUiProfile).toBe("unset-pending-P0-210");
    expect(taskRecordV1Schema).toBe(contracts.taskRecordV1Schema);
  });

  it("enforces closed task and draft transitions", () => {
    expect(canTransitionTask("todo", "in_progress")).toBe(true);
    expect(canTransitionTask("todo", "done")).toBe(false);
    expect(canTransitionRunLifecycle("active", "completed")).toBe(true);
    expect(canTransitionRunLifecycle("completed", "active")).toBe(false);
    expect(canTransitionCoworkerDraft("awaiting_review", "confirmed")).toBe(true);
    expect(canTransitionCoworkerDraft("ready", "draft")).toBe(false);
  });
});
