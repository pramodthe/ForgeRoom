import { describe, expect, it } from "vitest";
import { AgUiActivitySlot, ComponentHostBoundary, ControlledComponentSlot } from "./component-host";

describe("component host slots", () => {
  it("exposes stable slot kinds for AG-UI and controlled components", () => {
    expect(AgUiActivitySlot.name).toBe("AgUiActivitySlot");
    expect(ControlledComponentSlot.name).toBe("ControlledComponentSlot");
    expect(ComponentHostBoundary.name).toBe("ComponentHostBoundary");
  });
});
