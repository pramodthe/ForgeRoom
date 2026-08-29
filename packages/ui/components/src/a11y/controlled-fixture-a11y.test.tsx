import { render } from "@testing-library/react";
import { loadControlledUiFixtures } from "@forgeroom/test-fixtures";
import { describe, it } from "vitest";
import { axe } from "vitest-axe";
import { AXE_JSDOM_OPTIONS, expectNoAxeViolations } from "./axe-helpers";
import {
  ControlledInstance,
  P0_AGENT_TOOL_COMPONENT_NAMES,
  type ControlledInstanceData,
} from "../index";

const P0_VIEWPORT_WIDTH_PX = 1440;

type AgentToolComponentName = (typeof P0_AGENT_TOOL_COMPONENT_NAMES)[number];

function fixtureData(componentName: string): ControlledInstanceData | undefined {
  switch (componentName) {
    case "DataTable":
      return {
        rows: [
          { record_id: "demo-rec-001", status: "open", owner: "fixture" },
          { record_id: "demo-rec-002", status: "ready", owner: "fixture" },
        ],
      };
    case "BarOrLineChart":
      return {
        points: [
          { status: "open", count: 1 },
          { status: "ready", count: 1 },
        ],
      };
    case "TaskCard":
      return {
        task: {
          title: "Demo Task",
          description: "Fixture task card",
          status: "in_progress",
          assignee_name: "Operator",
          revision: 1,
        },
      };
    case "ArtifactCard":
      return {
        artifactId: "art_demo_001",
        artifact: {
          name: "summary.md",
          mime_type: "text/markdown",
          preview_label: "Sandbox summary",
          creator_name: "Operator",
          revision: 1,
        },
      };
    default:
      return undefined;
  }
}

function renderFixture(componentName: AgentToolComponentName, props: unknown) {
  return render(
    <div style={{ width: P0_VIEWPORT_WIDTH_PX }}>
      <ControlledInstance
        instanceId={`a11y_${componentName}`}
        componentName={componentName}
        status="ready"
        textAlternative={`${componentName} fixture`}
        validatedProps={props as Record<string, unknown>}
        data={fixtureData(componentName)}
        interactionEnabled={componentName === "ChoiceForm"}
      />
    </div>,
  );
}

describe("controlled component accessibility", () => {
  for (const fixture of loadControlledUiFixtures()) {
    it(`${fixture.componentName} passes axe at ${P0_VIEWPORT_WIDTH_PX}px`, async () => {
      const { container } = renderFixture(
        fixture.componentName as AgentToolComponentName,
        fixture.props,
      );
      const results = await axe(container, AXE_JSDOM_OPTIONS);
      expectNoAxeViolations(results);
    });
  }
});
