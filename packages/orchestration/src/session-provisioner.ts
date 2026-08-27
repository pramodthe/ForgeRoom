import { randomBytes } from "node:crypto";
import type { TrueForgeClient, TrueForgeSession } from "@forgeroom/trueforge";
import {
  assertAgentSpecPolicyHealthy,
  verifyCompiledAgentSpecPolicy,
} from "@forgeroom/trueforge";
import {
  compileSessionRevision,
  type CompiledSessionRevision,
  type SessionRevisionSnapshotInput,
} from "./session-revision";

export type ProvisionChannelCoworkerSessionInput = SessionRevisionSnapshotInput & {
  channelAgentSessionId: string;
  generation: number;
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

/**
 * Compile SessionRevision, create a TrueForge session, and return the immutable
 * generation payload (persistence is owned by the API store).
 */
export async function provisionChannelCoworkerSession(
  client: TrueForgeClient,
  input: ProvisionChannelCoworkerSessionInput,
): Promise<ProvisionedChannelCoworkerSession> {
  const createdAt = new Date().toISOString();
  const revision = compileSessionRevision(input, createdAt);
  const trueforgeSession = await client.createSession({ spec: revision.agentSpec });
  const fetched = await client.getSession(trueforgeSession.id);
  if (fetched.id !== trueforgeSession.id) {
    throw new Error("TrueForge session create/get mismatch");
  }

  const primaryConnector = input.connectors?.[0];
  if (primaryConnector) {
    const findings = verifyCompiledAgentSpecPolicy(revision.agentSpec, {
      connectorName: primaryConnector.name,
      enabledTools: primaryConnector.enabledTools,
      approvalRequiredTools: primaryConnector.approvalRequiredTools,
      approvalPolicyHash: revision.approvalPolicyHash,
    });
    assertAgentSpecPolicyHealthy(findings);
  }

  return {
    revision,
    trueforgeSession: fetched,
    generation: {
      id: opaqueId("casg"),
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
