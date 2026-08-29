import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ChannelPin } from "@forgeroom/contracts";
import { createChannelPin, listChannelPins } from "../api/workspace-api";
import { ApiError } from "../api/http-client";
import { useSession } from "../auth/session-context";

export type PinSourceTarget =
  | { kind: "message"; messageId: string; label: string }
  | { kind: "artifact"; artifactId: string; label: string };

export function useChannelPinActions(channelId: string) {
  const { session } = useSession();
  const queryClient = useQueryClient();
  const pinsQuery = useQuery({
    queryKey: ["channel-pins", channelId],
    queryFn: () => listChannelPins(channelId),
    enabled: Boolean(session),
  });

  const pinMutation = useMutation({
    mutationFn: async (target: PinSourceTarget) => {
      if (!session) {
        throw new Error("Session required.");
      }
      return createChannelPin({
        channelId,
        csrfToken: session.csrf_token,
        label: target.label,
        sourceMessageId: target.kind === "message" ? target.messageId : null,
        sourceArtifactId: target.kind === "artifact" ? target.artifactId : null,
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["channel-pins", channelId] });
    },
  });

  const pins = pinsQuery.data ?? [];
  const isPinned = (target: PinSourceTarget): ChannelPin | undefined =>
    pins.find((pin) =>
      target.kind === "message"
        ? pin.source_message_id === target.messageId
        : pin.source_artifact_id === target.artifactId,
    );

  const pinError =
    pinMutation.error instanceof ApiError
      ? pinMutation.error.message
      : pinMutation.error instanceof Error
        ? pinMutation.error.message
        : null;

  return {
    session,
    pinsQuery,
    pinMutation,
    isPinned,
    pinError,
    canPin: Boolean(session),
  };
}
