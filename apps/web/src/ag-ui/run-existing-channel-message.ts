import { HttpAgent } from "@forgeroom/ag-ui/browser";
import type { PostedChannelMessage } from "../api/workspace-api";
import { apiUrl } from "../api/http-client";
import { isFixtureMode } from "../api/mode";

export async function runExistingChannelMessage(input: {
  channelId: string;
  body: string;
  csrfToken: string;
  posted: PostedChannelMessage;
}): Promise<void> {
  if (isFixtureMode) return;
  if (!input.posted.run_id) return;

  await Promise.all(
    input.posted.run_step_assignments.map(async (assignment) => {
      const agent = new HttpAgent({
        url: apiUrl(
          `/api/ag-ui/channels/${encodeURIComponent(input.channelId)}/coworkers/${encodeURIComponent(assignment.coworker_id)}/runs`,
        ),
        threadId: assignment.logical_thread_id,
        initialMessages: [
          {
            id: input.posted.message_id,
            role: "user",
            content: input.body,
          },
        ],
        headers: { "x-csrf-token": input.csrfToken },
        fetch: (url, init) => fetch(url, { ...init, credentials: "include" }),
      });
      await agent.runAgent({
        runId: `agui_${assignment.run_step_id}`,
        forwardedProps: {
          forgeroomV1: {
            schemaVersion: 1,
            sourceMessageId: input.posted.message_id,
            applicationRunId: input.posted.run_id,
            runStepId: assignment.run_step_id,
          },
        },
      });
    }),
  );
}
