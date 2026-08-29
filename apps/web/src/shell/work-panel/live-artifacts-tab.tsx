import { useQuery } from "@tanstack/react-query";
import { getRunReceipt, getArtifact } from "../../api/channel-resources-api";
import { artifactSchema } from "@forgeroom/contracts";
import { apiUrl } from "../../api/http-client";

export function LiveArtifactsTab(props: { channelId: string; runId?: string | null }) {
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
      <section className="rounded-xl border border-zinc-200 bg-white p-3 shadow-sm">
        <div className="flex h-28 items-center justify-center rounded-lg bg-violet-100 text-2xl font-semibold text-violet-700">
          {label}
        </div>
        <h3 className="mt-3 font-medium text-zinc-900">{artifact.name}</h3>
        <p className="mt-0.5 text-[11px] text-zinc-500">
          {artifact.mime_type} · rev {artifact.revision}
        </p>
        <div className="mt-3 flex items-center justify-between text-xs">
          <span className="text-zinc-500">Run-linked artifact</span>
          <a
            href={apiUrl(`/api/artifacts/${encodeURIComponent(artifact.id)}/download`)}
            className="font-medium text-violet-700"
          >
            Download
          </a>
        </div>
      </section>
    </div>
  );
}

function PanelMessage({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="rounded-xl border border-dashed border-zinc-300 bg-white px-4 py-8 text-center">
      <p className="font-medium text-zinc-800">{title}</p>
      <p className="mt-1 text-xs text-zinc-500">{detail}</p>
    </div>
  );
}
