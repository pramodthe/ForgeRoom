import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { RunLifecycle } from "@forgeroom/contracts";
import { cancelRun } from "../api/channel-resources-api";
import { newIdempotencyKey } from "../api/http-client";
import { useSession } from "../auth/session-context";

export function useCancelChannelRun(channelId: string) {
  const { session } = useSession();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: { runId: string; expectedLifecycle: RunLifecycle }) => {
      if (!session) {
        throw new Error("Session required.");
      }
      return cancelRun({
        runId: input.runId,
        csrfToken: session.csrf_token,
        command: {
          schemaVersion: 1,
          expected_lifecycle: input.expectedLifecycle,
          reason: "Owner requested stop from work panel",
          idempotency_key: newIdempotencyKey("cancel_run"),
        },
      });
    },
    onSuccess: async (_result, variables) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["run", variables.runId] }),
        queryClient.invalidateQueries({ queryKey: ["run-receipt", variables.runId] }),
        queryClient.invalidateQueries({ queryKey: ["channel-tasks", channelId] }),
      ]);
    },
  });
}
