import type { UiInstanceReplayResponse } from "@forgeroom/contracts";

export type ControlledPresentationPhase =
  | "preparing"
  | "streaming"
  | "ready"
  | "waiting"
  | "stale"
  | "incompatible"
  | "refused"
  | "failed"
  | "closed";

type ResolvePresentationPhaseInput = {
  status: UiInstanceReplayResponse["status"];
  validatedProps: Record<string, unknown> | null;
  streaming?: boolean;
  waitingForInput?: boolean;
  incompatibleReason?: string | null;
};

export function resolveControlledPresentationPhase(
  input: ResolvePresentationPhaseInput,
): ControlledPresentationPhase {
  if (input.incompatibleReason) {
    return "incompatible";
  }
  if (input.status === "revoked") {
    return "refused";
  }
  if (input.status === "failed") {
    return "failed";
  }
  if (input.status === "closed") {
    return "closed";
  }
  if (input.streaming) {
    return "streaming";
  }
  if (input.status === "building" || input.validatedProps === null) {
    return "preparing";
  }
  if (input.status === "degraded") {
    return "stale";
  }
  if (input.waitingForInput) {
    return "waiting";
  }
  return "ready";
}
