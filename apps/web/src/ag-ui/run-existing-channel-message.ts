import { createCredentialedAgUiClient } from "./credentialed-agui-client";
import type { PostedChannelMessage } from "../api/workspace-api";
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
      const agent = createCredentialedAgUiClient({
        channelId: input.channelId,
        coworkerId: assignment.coworker_id,
        logicalThreadId: assignment.logical_thread_id,
        csrfToken: input.csrfToken,
        initialUserMessage: {
          id: input.posted.message_id,
          content: input.body,
        },
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
