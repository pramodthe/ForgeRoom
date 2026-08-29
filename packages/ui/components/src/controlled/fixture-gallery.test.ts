import { describe, expect, it } from "vitest";
import { loadControlledUiFixtures } from "@forgeroom/test-fixtures";
import { validateControlledProps } from "./validate-props";

describe("controlled UI fixture gallery", () => {
  it("validates every checked-in P0 controlled component fixture", () => {
    for (const fixture of loadControlledUiFixtures()) {
      const result = validateControlledProps(fixture.componentName, fixture.props);
      expect(result.ok, `${fixture.componentName} fixture should validate`).toBe(true);
    }
  });
});
