import { Link, useParams } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { EmptyState, LoadingState, RouteErrorState } from "@forgeroom/ui-components";
import {
  getSkillDraft,
  getSkillVersion,
  listSkillDrafts,
  listSkillVersions,
} from "../api/workspace-api";
import { workspaceSkillDetailPath, workspaceSkillsPath } from "../routes/paths";

export function SkillsPage() {
  const { workspaceId } = useParams({ from: "/w/$workspaceId/skills" });
  const draftsQuery = useQuery({
    queryKey: ["skill-drafts", workspaceId],
    queryFn: () => listSkillDrafts(workspaceId),
  });
  const versionsQuery = useQuery({
    queryKey: ["skill-versions", workspaceId],
    queryFn: () => listSkillVersions(workspaceId),
  });

  if (draftsQuery.isLoading || versionsQuery.isLoading) {
    return <LoadingState title="Loading skills…" />;
  }

  const drafts = draftsQuery.data ?? [];
  const versions = versionsQuery.data ?? [];
  if (drafts.length === 0 && versions.length === 0) {
    return <EmptyState title="No skills yet" />;
  }

  return (
    <section className="mx-auto max-w-3xl p-6">
      <h1 className="text-xl font-semibold text-zinc-900">Skills</h1>
      <h2 className="mt-4 text-sm font-medium text-zinc-700">Drafts</h2>
      <ul className="mt-2 space-y-2">
        {drafts.map((skill) => (
          <li key={skill.id}>
            <Link
              to={workspaceSkillDetailPath(workspaceId, skill.id)}
              className="block rounded border border-zinc-200 bg-white px-3 py-2 hover:bg-zinc-50"
            >
              {skill.when_to_use}
            </Link>
          </li>
        ))}
      </ul>
      <h2 className="mt-6 text-sm font-medium text-zinc-700">Published</h2>
      <ul className="mt-2 space-y-2">
        {versions.map((skill) => (
          <li key={skill.id}>
            <Link
              to={workspaceSkillDetailPath(workspaceId, skill.skill_id)}
              className="block rounded border border-zinc-200 bg-white px-3 py-2 hover:bg-zinc-50"
            >
              {skill.skill_id} v{skill.version}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function SkillDetailPage() {
  const { workspaceId, skillId } = useParams({ from: "/w/$workspaceId/skills/$skillId" });
  const draftQuery = useQuery({
    queryKey: ["skill-draft", workspaceId, skillId],
    queryFn: () => getSkillDraft(workspaceId, skillId),
  });
  const versionQuery = useQuery({
    queryKey: ["skill-version", workspaceId, skillId],
    queryFn: () => getSkillVersion(workspaceId, skillId),
  });

  if (draftQuery.isLoading || versionQuery.isLoading) {
    return <LoadingState title="Loading skill…" />;
  }

  const draft = draftQuery.data;
  const version = versionQuery.data;
  if (!draft && !version) {
    return (
      <RouteErrorState
        title="Skill not found"
        action={
          <Link to={workspaceSkillsPath(workspaceId)} className="text-sm text-zinc-700 underline">
            Back to skills
          </Link>
        }
      />
    );
  }

  return (
    <section className="mx-auto max-w-3xl p-6">
      <Link to={workspaceSkillsPath(workspaceId)} className="text-sm text-zinc-600 underline">
        Skills
      </Link>
      {draft ? (
        <>
          <h1 className="mt-2 text-xl font-semibold text-zinc-900">Skill draft</h1>
          <p className="mt-2 text-sm text-zinc-600">{draft.when_to_use}</p>
          <p className="mt-2 text-sm text-zinc-600">Method: {draft.method.join(" → ")}</p>
        </>
      ) : null}
      {version ? (
        <>
          <h1 className="mt-2 text-xl font-semibold text-zinc-900">
            {version.skill_id} v{version.version}
          </h1>
          <p className="mt-2 text-sm text-zinc-600">Published {version.published_at}</p>
        </>
      ) : null}
    </section>
  );
}
