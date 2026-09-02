import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { ChannelRosterCoworker } from "@forgeroom/contracts";
import type { TimelineItem } from "../ag-ui/channel-timeline-reducer";
import { ChannelTimeline } from "./channel-timeline";

const roster: ChannelRosterCoworker[] = [
  {
    participant_id: "part_operator",
    coworker_id: "cw_operator",
    handle: "operator",
    name: "Operator",
    title: "Operations coordinator",
    role: "member",
    availability: "available",
    assignment_summary: null,
    effective_tools: ["TASK_WRITE"],
  },
  {
    participant_id: "part_busy",
    coworker_id: "cw_busy",
    handle: "busy",
    name: "Busy teammate",
    title: "Busy specialist",
    role: "member",
    availability: "busy",
    assignment_summary: "Finishing a run",
    effective_tools: [],
  },
];

function renderTimeline(items: TimelineItem[], archived = false): string {
  return renderToStaticMarkup(
    <ChannelTimeline
      workspaceId="workspace_1"
      channelId="channel_1"
      items={items}
      runs={{}}
      threadActivityStates={{}}
      threadToolCallStates={{}}
      roster={roster}
      connection="live"
      archived={archived}
      currentHumanId="user_1"
      currentHumanName="Owner"
    />,
  );
}

describe("ChannelTimeline demo guidance", () => {
  it("renders the welcome path with only coworkers available for new work", () => {
    const html = renderTimeline([]);

    expect(html).toContain("Your room is ready");
    expect(html).toContain("1 coworker available");
    expect(html).toContain("Control sensitive changes");
  });

  it("keeps the real channel-created event but presents it as friendly room status", () => {
    const html = renderTimeline([
      {
        kind: "custom",
        key: "event_channel_created",
        sequence: 0,
        custom: {
          key: "event_channel_created",
          sequence: 0,
          name: "channel.created",
          actorKind: "system",
        },
      },
    ]);

    expect(html).toContain("Room created · Ready for coworker work");
    expect(html).not.toContain("Normalized channel event");
  });

  it("does not show active-work guidance in archived rooms", () => {
    expect(renderTimeline([], true)).not.toContain("Your room is ready");
  });
});
