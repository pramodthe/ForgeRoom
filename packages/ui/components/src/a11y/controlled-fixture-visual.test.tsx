import { render } from "@testing-library/react";
import { loadControlledUiFixtures } from "@forgeroom/test-fixtures";
import { describe, expect, it } from "vitest";
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

describe("controlled component 1440px visual baseline", () => {
  for (const fixture of loadControlledUiFixtures()) {
    it(`${fixture.componentName} matches stable markup snapshot`, () => {
      const { container } = render(
        <div className="p0-visual-baseline" style={{ width: P0_VIEWPORT_WIDTH_PX }}>
          <ControlledInstance
            instanceId={`visual_${fixture.componentName}`}
            componentName={fixture.componentName as AgentToolComponentName}
            status="ready"
            textAlternative={`${fixture.componentName} fixture`}
            validatedProps={fixture.props as Record<string, unknown>}
            data={fixtureData(fixture.componentName)}
            interactionEnabled={fixture.componentName === "ChoiceForm"}
          />
        </div>,
      );
      expect(container.firstElementChild?.innerHTML).toMatchSnapshot();
    });
  }
});
