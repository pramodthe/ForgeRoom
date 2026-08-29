import type { UiInstanceReplayResponse } from "@forgeroom/contracts";
import { P0_AGENT_TOOL_COMPONENT_NAMES } from "../index";

type P0AgentToolComponentName = (typeof P0_AGENT_TOOL_COMPONENT_NAMES)[number];
import { ComponentHostBoundary } from "../component-host";
import {
  ControlledArtifactCard,
  ControlledBarOrLineChart,
  ControlledChoiceForm,
  ControlledDataTable,
  ControlledTaskCard,
} from "./renderers";
import {
  ControlledStatusFallback,
  DegradedControlledState,
  InertControlledState,
  PreparingControlledState,
} from "./instance-states";
import { validateControlledProps } from "./validate-props";
import { safeArtifactDownloadPath } from "./artifact-download";

export type ControlledInstanceData = {
  rows?: Array<Record<string, string | number>>;
  points?: Array<Record<string, string | number>>;
  task?: Record<string, unknown>;
  artifact?: Record<string, unknown>;
  artifactId?: string;
};

export type ControlledInstanceProps = {
  instanceId: string;
  componentName: P0AgentToolComponentName;
  status: UiInstanceReplayResponse["status"];
  textAlternative: string;
  validatedProps: Record<string, unknown> | null;
  data?: ControlledInstanceData;
  interactionEnabled?: boolean;
  onSubmitChoice?: (values: Record<string, unknown>) => void;
  choiceFormError?: string | null;
  choiceFormSubmitting?: boolean;
};

function readRows(data?: ControlledInstanceData): Array<Record<string, string | number>> {
  return Array.isArray(data?.rows)
    ? data.rows.filter(
        (row): row is Record<string, string | number> => typeof row === "object" && row !== null,
      )
    : [];
}

function readPoints(data?: ControlledInstanceData): Array<Record<string, string | number>> {
  return Array.isArray(data?.points)
    ? data.points.filter(
        (point): point is Record<string, string | number> =>
          typeof point === "object" && point !== null,
      )
    : [];
}

function renderValidatedComponent(
  componentName: P0AgentToolComponentName,
  props: Record<string, unknown>,
  data: ControlledInstanceData | undefined,
  onSubmitChoice?: (values: Record<string, unknown>) => void,
  choiceFormError?: string | null,
  choiceFormSubmitting?: boolean,
) {
  switch (componentName) {
    case "DataTable":
      return (
        <ControlledDataTable
          caption={String(props.caption)}
          description={props.description as string | null | undefined}
          empty_text={String(props.empty_text)}
          columns={
            Array.isArray(props.columns)
              ? (props.columns as Array<{ key: string; label: string; align?: string }>)
              : []
          }
          rows={readRows(data)}
        />
      );
    case "BarOrLineChart":
      return (
        <ControlledBarOrLineChart
          title={String(props.title)}
          description={props.description as string | null | undefined}
          chart_type={props.chart_type === "line" ? "line" : "bar"}
          x_axis_label={String(props.x_axis_label)}
          y_axis_label={String(props.y_axis_label)}
          series={
            Array.isArray(props.series)
              ? (props.series as Array<{ key: string; label: string }>)
              : []
          }
          accessible_table_caption={String(props.accessible_table_caption)}
          points={readPoints(data)}
        />
      );
    case "TaskCard":
      return (
        <ControlledTaskCard
          heading={String(props.heading)}
          show_description={Boolean(props.show_description)}
          show_assignee={Boolean(props.show_assignee)}
          show_due_date={Boolean(props.show_due_date)}
          show_history={Boolean(props.show_history)}
          task={
            data?.task as
              | {
                  title?: string;
                  description?: string | null;
                  status?: string;
                  assignee_name?: string | null;
                  due_at?: string | null;
                  revision?: number;
                }
              | undefined
          }
        />
      );
    case "ArtifactCard":
      return (
        <ControlledArtifactCard
          heading={String(props.heading)}
          show_preview={Boolean(props.show_preview)}
          show_source={Boolean(props.show_source)}
          download_label={String(props.download_label)}
          downloadHref={safeArtifactDownloadPath(data?.artifactId)}
          artifact={
            data?.artifact as
              | {
                  name?: string;
                  mime_type?: string;
                  revision?: number;
                  preview_label?: string;
                  creator_name?: string;
                }
              | undefined
          }
        />
      );
    case "ChoiceForm":
      return (
        <ControlledChoiceForm
          title={String(props.title)}
          description={props.description as string | null | undefined}
          submit_label={String(props.submit_label)}
          cancel_label={String(props.cancel_label)}
          fields={
            Array.isArray(props.fields)
              ? (props.fields as Parameters<typeof ControlledChoiceForm>[0]["fields"])
              : []
          }
          onSubmit={onSubmitChoice}
          formError={choiceFormError}
          submitting={choiceFormSubmitting}
        />
      );
    default:
      return null;
  }
}

export function ControlledInstance({
  instanceId,
  componentName,
  status,
  textAlternative,
  validatedProps,
  data,
  interactionEnabled = false,
  onSubmitChoice,
  choiceFormError,
  choiceFormSubmitting,
}: ControlledInstanceProps) {
  if (status === "building" || validatedProps === null) {
    return <PreparingControlledState textAlternative={textAlternative} />;
  }
  if (status === "revoked" || status === "failed" || status === "closed") {
    return <ControlledStatusFallback status={status} textAlternative={textAlternative} />;
  }

  const validation = validateControlledProps(componentName, validatedProps);
  if (!validation.ok) {
    return <InertControlledState reason={validation.reason} textAlternative={textAlternative} />;
  }

  const rendered = renderValidatedComponent(
    componentName,
    validation.value,
    data,
    interactionEnabled ? onSubmitChoice : undefined,
    choiceFormError,
    choiceFormSubmitting,
  );
  if (!rendered) {
    return (
      <InertControlledState
        reason="No renderer is registered for this component."
        textAlternative={textAlternative}
      />
    );
  }

  const content = (
    <ComponentHostBoundary slotKind="controlled-component" slotId={instanceId}>
      {rendered}
    </ComponentHostBoundary>
  );

  if (status === "degraded") {
    return (
      <DegradedControlledState textAlternative={textAlternative}>{content}</DegradedControlledState>
    );
  }

  return content;
}
