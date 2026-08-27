import { createHash } from "node:crypto";
import {
  P0_DAYTONA_API_BASE,
  P0_SANDBOX_CREDENTIAL_CANARY_ENV_KEYS,
  P0_SANDBOX_EGRESS_PROBE_URL,
  P0_SANDBOX_FIXTURE_DEMO_LINES,
  P0_SANDBOX_FIXTURE_DEMO_LINES_SHA256,
  P0_SANDBOX_FIXTURE_REMOTE_PATH,
  P0_SANDBOX_FORBIDDEN_SENSITIVE_READ_TOOLS,
  P0_SANDBOX_COMMAND_TOOL_NAME_PATTERNS,
  P0_TRUEFORGE_SANDBOX_CREATED_WIRE_TYPE,
} from "./sandbox-p0-contract";

export type SandboxApplicationEventType =
  | "sandbox.created"
  | "sandbox.command_started"
  | "sandbox.command_completed"
  | "sandbox.failed";

export type SandboxCommandState = "creating" | "running" | "completed" | "failed";

export type MappedSandboxLifecycleEvent = {
  applicationType: SandboxApplicationEventType;
  sandboxId: string;
  commandState: SandboxCommandState;
  trueforgeEventId: string;
  toolCallId?: string;
  toolName?: string;
  payloadRedacted: Record<string, unknown>;
};

export type SandboxProfilePolicyResult =
  | { ok: true; sandboxEnabled: true }
  | { ok: false; sandboxEnabled: true; forbiddenTools: string[] }
  | { ok: true; sandboxEnabled: false };

export type CredentialCanaryProbeResult = {
  presentKeys: string[];
  absent: boolean;
};

export type EgressProbeResult = {
  probeUrl: string;
  httpCode: string | null;
  openEgress: boolean;
  sensitiveDataReadiness: "pass" | "fail";
};

export type RedactedSandboxEvidence = {
  schemaVersion: 1;
  sandboxIdSuffix: string;
  lifecycleEventTypes: SandboxApplicationEventType[];
  commandStates: SandboxCommandState[];
  credentialCanaryAbsent: boolean;
  credentialKeysPresent: string[];
  egress: {
    probeUrl: string;
    httpCode: string | null;
    openEgress: boolean;
    sensitiveDataReadiness: "pass" | "fail";
  };
  fixture: {
    remotePath: string;
    contentSha256: string | null;
    expectedSha256: typeof P0_SANDBOX_FIXTURE_DEMO_LINES_SHA256;
    match: boolean;
  };
};

function readString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function redactSandboxId(id: string): string {
  return id.length >= 4 ? id.slice(-4) : "****";
}

export function sha256Utf8(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export function isSandboxCommandToolName(toolName: string): boolean {
  const normalized = toolName.trim();
  if (!normalized) {
    return false;
  }
  return P0_SANDBOX_COMMAND_TOOL_NAME_PATTERNS.some((pattern) => pattern.test(normalized));
}

export function extractToolCallsFromModelMessage(
  raw: Record<string, unknown>,
): Array<{ id: string; name: string; isSandboxCommand: boolean }> {
  const toolCalls = Array.isArray(raw.tool_calls) ? raw.tool_calls : [];
  const out: Array<{ id: string; name: string; isSandboxCommand: boolean }> = [];
  for (const item of toolCalls) {
    if (!item || typeof item !== "object") {
      continue;
    }
    const row = item as Record<string, unknown>;
    const id = readString(row.id);
    if (!id) {
      continue;
    }
    const fn =
      row.function && typeof row.function === "object"
        ? (row.function as Record<string, unknown>)
        : null;
    const toolInfo =
      row.tool_info && typeof row.tool_info === "object"
        ? (row.tool_info as Record<string, unknown>)
        : null;
    const name =
      readString(fn?.name) ??
      readString(toolInfo?.name) ??
      readString(row.name) ??
      "unknown_tool";
    const toolInfoType = readString(toolInfo?.type);
    const isMcp = toolInfoType === "mcp";
    const isSandboxCommand = !isMcp && isSandboxCommandToolName(name);
    out.push({ id, name, isSandboxCommand });
  }
  return out;
}

function buildLifecyclePayload(
  applicationType: SandboxApplicationEventType,
  sandboxId: string,
  commandState: SandboxCommandState,
  extra: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    type: applicationType,
    sandbox_id: sandboxId,
    command_state: commandState,
    ...extra,
  };
}

function toolResponseFailed(content: string): boolean {
  const lower = content.toLowerCase();
  return (
    lower.includes("error") ||
    lower.includes("failed") ||
    lower.includes("exception") ||
    lower.startsWith("traceback")
  );
}

/**
 * Map TrueForge turn wire events to application sandbox lifecycle events.
 * Wire: sandbox.created, model.message (sandbox tool_calls), tool.response.
 */
export function mapTrueForgeWireEventsToSandboxLifecycle(
  rawEvents: Array<Record<string, unknown>>,
): MappedSandboxLifecycleEvent[] {
  const mapped: MappedSandboxLifecycleEvent[] = [];
  let activeSandboxId: string | null = null;
  const toolCallIndex = new Map<string, { name: string; isSandboxCommand: boolean }>();

  for (const raw of rawEvents) {
    const type = readString(raw.type) ?? "unknown";
    const trueforgeEventId = readString(raw.id) ?? `missing_${mapped.length}`;

    if (type === P0_TRUEFORGE_SANDBOX_CREATED_WIRE_TYPE) {
      const sandboxId = readString(raw.sandbox_id) ?? readString(raw.sandboxId);
      if (!sandboxId) {
        continue;
      }
      activeSandboxId = sandboxId;
      mapped.push({
        applicationType: "sandbox.created",
        sandboxId,
        commandState: "creating",
        trueforgeEventId,
        payloadRedacted: buildLifecyclePayload("sandbox.created", sandboxId, "creating"),
      });
      continue;
    }

    if (type === "model.message") {
      for (const toolCall of extractToolCallsFromModelMessage(raw)) {
        toolCallIndex.set(toolCall.id, {
          name: toolCall.name,
          isSandboxCommand: toolCall.isSandboxCommand,
        });
        if (!toolCall.isSandboxCommand || !activeSandboxId) {
          continue;
        }
        mapped.push({
          applicationType: "sandbox.command_started",
          sandboxId: activeSandboxId,
          commandState: "running",
          trueforgeEventId: `${trueforgeEventId}:${toolCall.id}:start`,
          toolCallId: toolCall.id,
          toolName: toolCall.name,
          payloadRedacted: buildLifecyclePayload(
            "sandbox.command_started",
            activeSandboxId,
            "running",
            {
              tool_call_id: toolCall.id,
              tool_name: toolCall.name,
            },
          ),
        });
      }
      continue;
    }

    if (type === "tool.response") {
      const toolCallId = readString(raw.tool_call_id) ?? readString(raw.toolCallId);
      if (!toolCallId || !activeSandboxId) {
        continue;
      }
      const indexed = toolCallIndex.get(toolCallId);
      if (!indexed?.isSandboxCommand) {
        continue;
      }
      const content = readString(raw.content) ?? "";
      const failed = toolResponseFailed(content);
      mapped.push({
        applicationType: failed ? "sandbox.failed" : "sandbox.command_completed",
        sandboxId: activeSandboxId,
        commandState: failed ? "failed" : "completed",
        trueforgeEventId,
        toolCallId,
        toolName: indexed.name,
        payloadRedacted: buildLifecyclePayload(
          failed ? "sandbox.failed" : "sandbox.command_completed",
          activeSandboxId,
          failed ? "failed" : "completed",
          {
            tool_call_id: toolCallId,
            tool_name: indexed.name,
            result_summary: failed ? "sandbox command failed" : "sandbox command completed",
          },
        ),
      });
    }
  }

  return mapped;
}

/** Sandbox-enabled profiles must not expose sensitive external-read tools (ADR-005). */
export function verifySandboxEnabledToolPolicy(input: {
  sandboxEnabled: boolean;
  enabledTools: readonly string[];
}): SandboxProfilePolicyResult {
  if (!input.sandboxEnabled) {
    return { ok: true, sandboxEnabled: false };
  }
  const forbidden = P0_SANDBOX_FORBIDDEN_SENSITIVE_READ_TOOLS.filter((tool) =>
    input.enabledTools.includes(tool),
  );
  if (forbidden.length > 0) {
    return { ok: false, sandboxEnabled: true, forbiddenTools: [...forbidden] };
  }
  return { ok: true, sandboxEnabled: true };
}

export function assertSandboxEnabledToolPolicy(input: {
  sandboxEnabled: boolean;
  enabledTools: readonly string[];
}): void {
  const result = verifySandboxEnabledToolPolicy(input);
  if (!result.ok) {
    throw new Error(
      `sandbox-enabled profile exposes sensitive read tools: ${result.forbiddenTools.join(", ")}`,
    );
  }
}

export function evaluateCredentialCanary(envKeyListing: readonly string[]): CredentialCanaryProbeResult {
  const presentKeys = P0_SANDBOX_CREDENTIAL_CANARY_ENV_KEYS.filter((key) =>
    envKeyListing.includes(key),
  );
  return { presentKeys: [...presentKeys], absent: presentKeys.length === 0 };
}

export function evaluateEgressProbe(httpCode: string | null): EgressProbeResult {
  const normalized = httpCode?.trim() ?? "";
  const openEgress =
    normalized.startsWith("2") || normalized === "301" || normalized === "302";
  return {
    probeUrl: P0_SANDBOX_EGRESS_PROBE_URL,
    httpCode: normalized.length > 0 ? normalized : null,
    openEgress,
    sensitiveDataReadiness: openEgress ? "fail" : "pass",
  };
}

export function toRedactedSandboxEvidence(input: {
  sandboxId: string;
  lifecycle: MappedSandboxLifecycleEvent[];
  credentialCanary: CredentialCanaryProbeResult;
  egress: EgressProbeResult;
  fixtureContentSha256?: string | null;
}): RedactedSandboxEvidence {
  const lifecycleEventTypes = input.lifecycle.map((event) => event.applicationType);
  const commandStates = input.lifecycle.map((event) => event.commandState);
  const contentSha256 = input.fixtureContentSha256 ?? null;
  return {
    schemaVersion: 1,
    sandboxIdSuffix: redactSandboxId(input.sandboxId),
    lifecycleEventTypes,
    commandStates,
    credentialCanaryAbsent: input.credentialCanary.absent,
    credentialKeysPresent: input.credentialCanary.presentKeys,
    egress: {
      probeUrl: input.egress.probeUrl,
      httpCode: input.egress.httpCode,
      openEgress: input.egress.openEgress,
      sensitiveDataReadiness: input.egress.sensitiveDataReadiness,
    },
    fixture: {
      remotePath: P0_SANDBOX_FIXTURE_REMOTE_PATH,
      contentSha256,
      expectedSha256: P0_SANDBOX_FIXTURE_DEMO_LINES_SHA256,
      match: contentSha256 === P0_SANDBOX_FIXTURE_DEMO_LINES_SHA256,
    },
  };
}

export type DaytonaProbeClientOptions = {
  apiKey: string;
  fetchImpl?: typeof fetch;
  apiBase?: string;
};

type DaytonaSandboxRecord = {
  id: string;
  toolboxProxyUrl: string;
};

/** Minimal Daytona REST client for P0 credential/egress/file fixture probes. */
export class DaytonaProbeClient {
  private readonly apiKey: string;
  private readonly fetchImpl: typeof fetch;
  private readonly apiBase: string;

  constructor(options: DaytonaProbeClientOptions) {
    if (!options.apiKey.trim()) {
      throw new Error("DAYTONA_API_KEY is required");
    }
    this.apiKey = options.apiKey.trim();
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.apiBase = (options.apiBase ?? P0_DAYTONA_API_BASE).replace(/\/+$/, "");
  }

  async createProbeSandbox(): Promise<DaytonaSandboxRecord> {
    const payload = await this.requestJson<Record<string, unknown>>("POST", "/sandbox", {});
    const id = readString(payload.id);
    const toolboxProxyUrl =
      readString(payload.toolboxProxyUrl) ?? readString(payload.toolbox_proxy_url);
    if (!id || !toolboxProxyUrl) {
      throw new Error("Daytona sandbox response missing id or toolboxProxyUrl");
    }
    return { id, toolboxProxyUrl };
  }

  async executeCommand(
    sandbox: DaytonaSandboxRecord,
    command: string,
    timeoutSeconds = 30,
  ): Promise<{ result: string; exitCode: number }> {
    const url = `${sandbox.toolboxProxyUrl.replace(/\/+$/, "")}/${sandbox.id}/process/execute`;
    const payload = await this.requestJson<{ result?: string; exitCode?: number }>(
      "POST",
      url,
      { command, timeout: timeoutSeconds },
      true,
    );
    return {
      result: payload.result ?? "",
      exitCode: typeof payload.exitCode === "number" ? payload.exitCode : -1,
    };
  }

  async probeCredentialCanary(sandbox: DaytonaSandboxRecord): Promise<CredentialCanaryProbeResult> {
    const executed = await this.executeCommand(
      sandbox,
      "printenv | cut -d= -f1 | sort",
    );
    const keys = executed.result.split(/\s+/).filter(Boolean);
    return evaluateCredentialCanary(keys);
  }

  async probeEgressReachability(sandbox: DaytonaSandboxRecord): Promise<EgressProbeResult> {
    const executed = await this.executeCommand(
      sandbox,
      `curl -s -o /dev/null -w '%{http_code}' --max-time 15 ${P0_SANDBOX_EGRESS_PROBE_URL} 2>/dev/null || echo 000`,
    );
    const code = executed.result.trim().replace(/\D/g, "").slice(0, 3);
    return evaluateEgressProbe(code.length > 0 ? code : null);
  }

  async writeFixtureDemoLines(sandbox: DaytonaSandboxRecord): Promise<void> {
    const b64 = Buffer.from(P0_SANDBOX_FIXTURE_DEMO_LINES, "utf8").toString("base64");
    const path = `/home/daytona/${P0_SANDBOX_FIXTURE_REMOTE_PATH}`;
    const executed = await this.executeCommand(
      sandbox,
      `echo ${b64} | base64 -d > ${path}`,
    );
    if (executed.exitCode !== 0) {
      throw new Error(`fixture write failed (exit ${executed.exitCode})`);
    }
  }

  async readFixtureSha256(sandbox: DaytonaSandboxRecord): Promise<string> {
    const path = `/home/daytona/${P0_SANDBOX_FIXTURE_REMOTE_PATH}`;
    const executed = await this.executeCommand(
      sandbox,
      `sha256sum ${path} | cut -d' ' -f1`,
    );
    return executed.result.trim();
  }

  private async requestJson<T>(
    method: string,
    pathOrUrl: string,
    body?: unknown,
    absolute = false,
  ): Promise<T> {
    const url = absolute ? pathOrUrl : `${this.apiBase}${pathOrUrl}`;
    const headers: Record<string, string> = {
      Accept: "application/json",
      Authorization: `Bearer ${this.apiKey}`,
    };
    let payload: string | undefined;
    if (body !== undefined) {
      headers["Content-Type"] = "application/json";
      payload = JSON.stringify(body);
    }
    const response = await this.fetchImpl(url, { method, headers, body: payload });
    const text = await response.text();
    let parsed: unknown = null;
    if (text.length > 0) {
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = text;
      }
    }
    if (!response.ok) {
      throw new Error(`Daytona ${method} ${url} failed (${response.status})`);
    }
    return parsed as T;
  }
}

export function loadDaytonaProbeClientFromEnv(
  env: NodeJS.ProcessEnv = process.env,
  fetchImpl?: typeof fetch,
): DaytonaProbeClient {
  const apiKey = env.DAYTONA_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("DAYTONA_API_KEY is required");
  }
  return new DaytonaProbeClient({ apiKey, fetchImpl });
}

export function buildSandboxOnlyAgentSpecInstructions(): string {
  return `Write exactly these two lines to /home/daytona/${P0_SANDBOX_FIXTURE_REMOTE_PATH} using a sandbox shell command. Use only synthetic/public content. Reply OK when done.\n${P0_SANDBOX_FIXTURE_DEMO_LINES}`;
}
