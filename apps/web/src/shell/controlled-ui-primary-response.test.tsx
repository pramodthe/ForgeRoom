import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ControlledUiPrimaryChrome } from "./controlled-ui-primary-response";

describe("ControlledUiPrimaryChrome", () => {
  it("renders provenance, text alternative, and primary-response marker", () => {
    const html = renderToStaticMarkup(
      <ControlledUiPrimaryChrome
        roster={[
          {
            participant_id: "part_1",
            coworker_id: "cw_1",
            name: "Analyst",
            handle: "analyst",
            title: "Research analyst",
            role: "member",
            availability: "available",
            assignment_summary: null,
            effective_tools: ["DataTable"],
          },
        ]}
        ownerCoworkerId="cw_1"
        content={{
          schemaVersion: 1,
          activityRevision: 1,
          activityType: "forgeroom.controlled_ui.v1",
          surfaceId: "surface_1",
          rail: "registry_v1",
          componentName: "DataTable",
          componentVersion: "1.0.0",
          status: "ready",
          renderRevision: 2,
          stateRevision: 1,
          textAlternative: "Open issues table",
        }}
      >
        <div>component slot</div>
      </ControlledUiPrimaryChrome>,
    );

    expect(html).toContain('data-primary-response="controlled-ui"');
    expect(html).toContain('data-ui-instance-id="surface_1"');
    expect(html).toContain("Reviewed component");
    expect(html).toContain("Analyst");
    expect(html).toContain("Open issues table");
    expect(html).toContain("DataTable");
    expect(html).toContain("Replay details");
    expect(html).toContain("component slot");
  });
});
