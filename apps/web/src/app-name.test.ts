import { describe, expect, it } from "vitest";
import { errorCodeSchema } from "@forgeroom/contracts";
import { APP_NAME, CONTRACT_RELEASE } from "./app-name";

describe("web shell", () => {
  it("uses the product name without loading generated UI", () => {
    expect(APP_NAME).toBe("ForgeRoom");
  });

  it("imports shared contracts instead of duplicating schemas", () => {
    expect(CONTRACT_RELEASE).toBe("0.1");
    expect(errorCodeSchema.options).toContain("stale_task_revision");
  });
});
