import { useQuery } from "@tanstack/react-query";
import type { ForgeRoomActivityContent } from "@forgeroom/contracts";
import {
  ControlledComponentSlot,
  ControlledInstance,
  type ControlledInstanceData,
} from "@forgeroom/ui-components";
import { getUiInstanceReplay, postUiInstanceDataFunction } from "../api/channel-resources-api";
import { ApiError } from "../api/http-client";
import { useSession } from "../auth/session-context";
import {
  choiceSubmitErrorMessage,
  useControlledChoiceSubmit,
} from "./use-controlled-choice-submit";

type ControlledUiActivityProps = {
  content: Extract<ForgeRoomActivityContent, { activityType: "forgeroom.controlled_ui.v1" }>;
};

const COMPONENT_DATA_REFS: Record<string, string> = {
  DataTable: "rows",
  BarOrLineChart: "series",
  TaskCard: "task",
  ArtifactCard: "artifact",
};

function mapDataFunctionResult(
  dataRef: string,
  data: unknown,
  artifactId?: string,
): ControlledInstanceData | undefined {
  if (!data || typeof data !== "object") {
    return undefined;
  }
  const record = data as Record<string, unknown>;
  if (dataRef === "rows" && Array.isArray(record.rows)) {
    return { rows: record.rows as ControlledInstanceData["rows"] };
  }
  if (dataRef === "series" && Array.isArray(record.series)) {
    return { points: record.series as ControlledInstanceData["points"] };
  }
  if (dataRef === "task" && record.task && typeof record.task === "object") {
    return { task: record.task as Record<string, unknown> };
  }
  if (dataRef === "artifact" && record.artifact && typeof record.artifact === "object") {
    return {
      artifact: record.artifact as Record<string, unknown>,
      artifactId,
    };
  }
  return undefined;
}

function resolveArtifactId(
  dataGrant: { dataRef: string; source: { kind: string; artifactId?: string } } | undefined,
): string | undefined {
  if (!dataGrant || dataGrant.dataRef !== "artifact") {
    return undefined;
  }
  return dataGrant.source.kind === "artifactRevision" ? dataGrant.source.artifactId : undefined;
}

export function ControlledUiActivity({ content }: ControlledUiActivityProps) {
  const { session } = useSession();
  const choiceSubmit = useControlledChoiceSubmit(content.surfaceId);
  const replayQuery = useQuery({
    queryKey: ["ui-instance-replay", content.surfaceId],
    queryFn: () => getUiInstanceReplay(content.surfaceId),
    enabled: content.status === "ready" || content.status === "degraded",
  });
  const replay = replayQuery.data;
  const dataRef = COMPONENT_DATA_REFS[content.componentName];
  const dataGrant =
    replay && dataRef
      ? replay.dataGrants.find((grant) => grant.dataRef === dataRef && !grant.revoked)
      : undefined;
  const artifactId = resolveArtifactId(dataGrant);
  const dataQuery = useQuery({
    queryKey: [
      "ui-instance-data",
      content.surfaceId,
      dataGrant?.id,
      replay?.renderRevision,
      replay?.renderManifestHash,
    ],
    queryFn: async () => {
      if (!session || !replay || !dataGrant || replay.renderRevision === null) {
        throw new Error("Controlled UI data prerequisites are missing.");
      }
      if (!replay.renderManifestHash) {
        throw new Error("Controlled UI manifest hash is missing.");
      }
      return postUiInstanceDataFunction({
        instanceId: replay.instanceId,
        functionName: dataGrant.dataRef,
        csrfToken: session.csrf_token,
        command: {
          schemaVersion: 1,
          renderRevision: replay.renderRevision,
          dataGrantId: dataGrant.id,
          expectedManifestHash: replay.renderManifestHash,
          arguments: {},
        },
      });
    },
    enabled: Boolean(session && replay && dataGrant && replay.renderRevision !== null),
  });

  if (content.status === "building") {
    return (
      <ControlledComponentSlot slotId={content.surfaceId}>
        <ControlledInstance
          instanceId={content.surfaceId}
          componentName={content.componentName}
          status={content.status}
          textAlternative={content.textAlternative}
          validatedProps={null}
        />
      </ControlledComponentSlot>
    );
  }

  if (replayQuery.isLoading || (dataGrant && dataQuery.isLoading)) {
    return (
      <ControlledComponentSlot slotId={content.surfaceId}>
        <ControlledInstance
          instanceId={content.surfaceId}
          componentName={content.componentName}
          status="building"
          textAlternative={content.textAlternative}
          validatedProps={null}
        />
      </ControlledComponentSlot>
    );
  }

  if (replayQuery.error || !replay) {
    const reason =
      replayQuery.error instanceof ApiError ? replayQuery.error.message : "Replay is unavailable.";
    return (
      <ControlledComponentSlot slotId={content.surfaceId}>
        <ControlledInstance
          instanceId={content.surfaceId}
          componentName={content.componentName}
          status="failed"
          textAlternative={`${content.textAlternative} (${reason})`}
          validatedProps={null}
        />
      </ControlledComponentSlot>
    );
  }

  if (dataGrant && dataQuery.error) {
    const reason =
      dataQuery.error instanceof ApiError
        ? dataQuery.error.message
        : "Controlled data could not be loaded.";
    return (
      <ControlledComponentSlot slotId={content.surfaceId}>
        <ControlledInstance
          instanceId={replay.instanceId}
          componentName={replay.componentName}
          status="failed"
          textAlternative={`${replay.textAlternative} (${reason})`}
          validatedProps={replay.validatedProps}
        />
      </ControlledComponentSlot>
    );
  }

  const instanceData =
    dataGrant && dataQuery.data
      ? mapDataFunctionResult(dataGrant.dataRef, dataQuery.data, artifactId)
      : undefined;

  const submitGrantAvailable = replay.actionGrants.some(
    (grant) =>
      !grant.revoked &&
      grant.mode === "complete_component_interrupt" &&
      grant.actionRef === "submit",
  );
  const interactionEnabled =
    replay.interactionEnabled && (replay.componentName !== "ChoiceForm" || submitGrantAvailable);

  return (
    <ControlledComponentSlot slotId={content.surfaceId}>
      <ControlledInstance
        instanceId={replay.instanceId}
        componentName={replay.componentName}
        status={replay.status}
        textAlternative={replay.textAlternative}
        validatedProps={replay.validatedProps}
        data={instanceData}
        interactionEnabled={interactionEnabled}
        onSubmitChoice={
          replay.componentName === "ChoiceForm" && interactionEnabled
            ? (values) => {
                choiceSubmit.mutate({ replay, values });
              }
            : undefined
        }
        choiceFormError={choiceSubmit.error ? choiceSubmitErrorMessage(choiceSubmit.error) : null}
        choiceFormSubmitting={choiceSubmit.isPending}
      />
    </ControlledComponentSlot>
  );
}
