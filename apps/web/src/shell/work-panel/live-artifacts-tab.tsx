import { useQuery } from "@tanstack/react-query";
import { getRunReceipt, getArtifact } from "../../api/channel-resources-api";
import { artifactSchema } from "@forgeroom/contracts";
import { apiUrl } from "../../api/http-client";
import { PinSourceButton } from "../pin-source-button";
import { pinLabelFromArtifactName } from "../pin-source-label";

export function LiveArtifactsTab(props: {
  channelId: string;
  runId?: string | null;
  archived?: boolean;
}) {
  const receiptQuery = useQuery({
    queryKey: ["run-receipt-artifacts", props.runId],
    queryFn: () => getRunReceipt(props.runId!),
    enabled: Boolean(props.runId),
  });

  const artifactId = receiptQuery.data?.receipt.artifact_id ?? null;
  const artifactQuery = useQuery({
    queryKey: ["artifact", artifactId],
    queryFn: async () => artifactSchema.parse(await getArtifact(artifactId!)),
    enabled: Boolean(artifactId),
  });

  if (!props.runId) {
    return (
      <PanelMessage
        title="No artifacts yet"
        detail="Artifacts from completed runs will appear here with safe preview and download links."
      />
    );
  }

  if (receiptQuery.isLoading || artifactQuery.isLoading) {
    return <PanelMessage title="Loading artifacts…" detail="Reading the latest run receipt." />;
  }

  if (!artifactId || !artifactQuery.data) {
    return (
      <PanelMessage
        title="No artifacts in this run"
        detail="This channel has no durable artifacts linked to the active receipt yet."
      />
    );
  }

  const artifact = artifactQuery.data;
  const label = artifact.mime_type.split("/")[1]?.toUpperCase() ?? "FILE";

  return (
    <div className="space-y-3">
      <p className="px-1 text-xs text-zinc-500">1 artifact from the latest linked run</p>
      <section className="rounded-xl border border-white/10 bg-[#292929] p-3 shadow-sm">
        <div className="flex h-28 items-center justify-center rounded-lg bg-violet-400/15 text-2xl font-semibold text-violet-300">
          {label}
        </div>
        <h3 className="mt-3 font-medium text-zinc-100">{artifact.name}</h3>
        <p className="mt-0.5 text-[11px] text-zinc-500">
          {artifact.mime_type} · rev {artifact.revision}
        </p>
        <div className="mt-3 flex items-center justify-between gap-2 text-xs">
          <span className="text-zinc-500">Run-linked artifact</span>
          <div className="flex items-center gap-2">
            <PinSourceButton
              channelId={props.channelId}
              archived={props.archived ?? false}
              compact
              target={{
                kind: "artifact",
                artifactId: artifact.id,
                label: pinLabelFromArtifactName(artifact.name),
              }}
            />
            <a
              href={apiUrl(`/api/artifacts/${encodeURIComponent(artifact.id)}/download`)}
              className="font-medium text-violet-300"
            >
              Download
            </a>
          </div>
        </div>
      </section>
    </div>
  );
}

function PanelMessage({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="rounded-xl border border-dashed border-white/15 bg-white/[0.03] px-4 py-8 text-center">
      <p className="font-medium text-zinc-200">{title}</p>
      <p className="mt-1 text-xs text-zinc-500">{detail}</p>
    </div>
  );
}
