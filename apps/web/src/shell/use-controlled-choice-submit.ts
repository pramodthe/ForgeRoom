import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { SafeJsonValue, UiInstanceReplayResponse } from "@forgeroom/contracts";
import { ApiError, newIdempotencyKey } from "../api/http-client";
import {
  postUiInstanceInteraction,
  postUiInstanceInteractionToken,
} from "../api/channel-resources-api";
import { useSession } from "../auth/session-context";

type SubmitChoiceInput = {
  replay: UiInstanceReplayResponse;
  values: Record<string, unknown>;
};

function findSubmitActionGrant(replay: UiInstanceReplayResponse) {
  return replay.actionGrants.find(
    (grant) =>
      !grant.revoked &&
      grant.mode === "complete_component_interrupt" &&
      grant.actionRef === "submit",
  );
}

function toSafeJsonValue(value: unknown): SafeJsonValue {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((entry) => toSafeJsonValue(entry));
  }
  if (typeof value === "object") {
    const record: Record<string, SafeJsonValue> = {};
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      record[key] = toSafeJsonValue(entry);
    }
    return record;
  }
  return String(value);
}

export function useControlledChoiceSubmit(instanceId: string) {
  const { session } = useSession();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ replay, values }: SubmitChoiceInput) => {
      if (!session) {
        throw new Error("Session is required to submit a choice form.");
      }
      if (replay.renderRevision === null) {
        throw new Error("Controlled UI render revision is missing.");
      }
      const actionGrant = findSubmitActionGrant(replay);
      if (!actionGrant) {
        throw new Error("Submit action grant is unavailable.");
      }
      const renderNodeId = actionGrant.allowedRenderNodeIds[0];
      if (!renderNodeId) {
        throw new Error("Submit render node is unavailable.");
      }

      const token = await postUiInstanceInteractionToken({
        instanceId: replay.instanceId,
        csrfToken: session.csrf_token,
        request: {
          schemaVersion: 1,
          surfaceId: replay.instanceId,
          renderNodeId,
          renderRevision: replay.renderRevision,
          expectedStateRevision: replay.stateRevision,
          actionGrantId: actionGrant.id,
          actionRef: "submit",
          input: toSafeJsonValue(values),
          clientKind: "registry",
          idempotencyKey: newIdempotencyKey("choice_form_submit"),
        },
      });

      const result = await postUiInstanceInteraction({
        instanceId: replay.instanceId,
        csrfToken: session.csrf_token,
        command: {
          schemaVersion: 1,
          interactionId: token.interactionId,
          interactionToken: token.interactionToken,
        },
      });

      if (result.state === "denied" || result.state === "failed" || result.state === "stale") {
        throw new Error(`Choice form submission ${result.state}.`);
      }

      return result;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["ui-instance-replay", instanceId] });
    },
  });
}

export function choiceSubmitErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    return error.message;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return "Choice form submission failed.";
}
