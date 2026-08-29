import { createHash, randomBytes } from "node:crypto";
import type { TrueForgeClient, TrueForgeSession } from "@forgeroom/trueforge";
import {
  assertAgentSpecPolicyHealthy,
  hashAgentSpec,
  verifyCompiledAgentSpecPolicy,
} from "@forgeroom/trueforge";
import {
  compileSessionRevision,
  type CompiledSessionRevision,
  type SessionRevisionSnapshotInput,
} from "./session-revision";
import { buildUiComponentsMcpConnectorName } from "@forgeroom/ui-components-mcp";

export type ProvisionChannelCoworkerSessionInput = SessionRevisionSnapshotInput & {
  channelAgentSessionId: string;
  generation: number;
  generationId?: string;
  providerReconciliation?: {
    operationId: string;
    startedAt: string;
    reconcile: boolean;
  };
  agentVersionId?: string | null;
};

export type ProvisionedChannelCoworkerSession = {
  revision: CompiledSessionRevision;
  trueforgeSession: TrueForgeSession;
  generation: {
    id: string;
    channelAgentSessionId: string;
    generation: number;
    agentVersionId: string | null;
    sessionRevisionId: string;
    trueforgeSessionId: string;
    effectiveSpecHash: string;
    approvalPolicyHash: string;
    state: "ready";
    createdAt: string;
    retiredAt: null;
  };
};

function opaqueId(prefix: string): string {
  return `${prefix}_${randomBytes(10).toString("hex")}`;
}

export function createSessionGenerationId(seed?: string): string {
  if (seed) {
    return `casg_${createHash("sha256").update(seed, "utf8").digest("hex").slice(0, 20)}`;
  }
  return opaqueId("casg");
}

function inlineAgentSpec(session: TrueForgeSession): unknown {
  const agent = session.agent;
  if (!agent || typeof agent !== "object") {
    return null;
  }
  const row = agent as Record<string, unknown>;
  return row.type === "inline" && row.spec && typeof row.spec === "object" ? row.spec : null;
}

async function reconcileProviderSession(
  client: TrueForgeClient,
  input: {
    operationId: string;
    startedAt: string;
    expectedSpecHash: string;
  },
): Promise<TrueForgeSession | null> {
  const startedMs = Date.parse(input.startedAt);
  if (!Number.isFinite(startedMs)) {
    throw new Error(`invalid provider reconciliation timestamp for ${input.operationId}`);
  }
  const startTimestamp = new Date(startedMs - 30_000).toISOString();
  const endMs = startedMs + 5 * 60_000;
  const endTimestamp = new Date(endMs).toISOString();
  const matches: TrueForgeSession[] = [];
  let pageToken: string | undefined;
  for (let page = 0; page < 20; page += 1) {
    const listed = await client.listSessions({
      limit: 25,
      order: "asc",
      startTimestamp,
      endTimestamp,
      ...(pageToken ? { pageToken } : {}),
    });
    for (const session of listed.sessions) {
      const spec = inlineAgentSpec(session);
      const createdMs = Date.parse(session.created_at);
      if (
        spec &&
        Number.isFinite(createdMs) &&
        createdMs >= startedMs - 30_000 &&
        createdMs <= endMs &&
        hashAgentSpec(spec as Parameters<typeof hashAgentSpec>[0]) === input.expectedSpecHash
      ) {
        matches.push(session);
      }
    }
    if (!listed.nextPageToken) {
      break;
    }
    pageToken = listed.nextPageToken;
    if (page === 19) {
      throw new Error(
        `provider reconciliation exceeded session scan limit for ${input.operationId}`,
      );
    }
  }
  if (matches.length > 1) {
    throw new Error(`provider reconciliation is ambiguous for ${input.operationId}`);
  }
  return matches[0] ?? null;
}

/**
 * Compile SessionRevision, create a TrueForge session, and return the immutable
 * generation payload (persistence is owned by the API store).
 */
export async function provisionChannelCoworkerSession(
  client: TrueForgeClient,
  input: ProvisionChannelCoworkerSessionInput,
): Promise<ProvisionedChannelCoworkerSession> {
  const createdAt = new Date().toISOString();
  const generationId = input.generationId ?? createSessionGenerationId();
  const componentToolNames = input.componentToolNames ?? [];
  const applicationToolNames = input.applicationToolNames ?? [];
  const revision = compileSessionRevision(
    {
      ...input,
      providerSessionCorrelationId: generationId,
      ...(componentToolNames.length + applicationToolNames.length > 0
        ? { uiComponentsMcpConnectorName: buildUiComponentsMcpConnectorName(generationId) }
        : {}),
    },
    createdAt,
  );
  const reconciled =
    input.providerReconciliation?.reconcile === true
      ? await reconcileProviderSession(client, {
          operationId: input.providerReconciliation.operationId,
          startedAt: input.providerReconciliation.startedAt,
          expectedSpecHash: revision.effectiveSpecHash,
        })
      : null;
  const trueforgeSession = reconciled ?? (await client.createSession({ spec: revision.agentSpec }));
  const fetched = await client.getSession(trueforgeSession.id);
  if (fetched.id !== trueforgeSession.id) {
    throw new Error("TrueForge session create/get mismatch");
  }

  for (const connector of input.connectors ?? []) {
    const findings = verifyCompiledAgentSpecPolicy(revision.agentSpec, {
      connectorName: connector.name,
      enabledTools: connector.enabledTools,
      approvalRequiredTools: connector.approvalRequiredTools,
      approvalPolicyHash: revision.approvalPolicyHash,
    });
    assertAgentSpecPolicyHealthy(findings);
  }

  return {
    revision,
    trueforgeSession: fetched,
    generation: {
      id: generationId,
      channelAgentSessionId: input.channelAgentSessionId,
      generation: input.generation,
      agentVersionId: input.agentVersionId ?? null,
      sessionRevisionId: revision.id,
      trueforgeSessionId: fetched.id,
      effectiveSpecHash: revision.effectiveSpecHash,
      approvalPolicyHash: revision.approvalPolicyHash,
      state: "ready",
      createdAt,
      retiredAt: null,
    },
  };
}
