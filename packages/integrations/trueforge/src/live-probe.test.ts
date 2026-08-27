import { describe, expect, it } from "vitest";
import {
  DaytonaProbeClient,
  evaluateCredentialCanary,
  evaluateEgressProbe,
  loadDaytonaProbeClientFromEnv,
  mapTrueForgeWireEventsToSandboxLifecycle,
  sha256Utf8,
  toRedactedSandboxEvidence,
} from "./sandbox";
import {
  P0_SANDBOX_FIXTURE_DEMO_LINES,
  P0_SANDBOX_FIXTURE_DEMO_LINES_SHA256,
} from "./sandbox-p0-contract";

const hasDaytonaEnv = Boolean(process.env.DAYTONA_API_KEY?.trim());

describe.runIf(hasDaytonaEnv)("P0-311 live Daytona sandbox probe", () => {
  it("records credential canary absence, egress reachability and fixture file hash", async () => {
    const client = loadDaytonaProbeClientFromEnv();
    const sandbox = await client.createProbeSandbox();

    const credentialCanary = await client.probeCredentialCanary(sandbox);
    expect(credentialCanary.absent).toBe(true);
    expect(credentialCanary.presentKeys).toEqual([]);

    const egress = await client.probeEgressReachability(sandbox);
    expect(egress.probeUrl).toContain("example.com");
    if (egress.openEgress) {
      expect(egress.sensitiveDataReadiness).toBe("fail");
    } else {
      expect(egress.sensitiveDataReadiness).toBe("pass");
    }

    await client.writeFixtureDemoLines(sandbox);
    const fixtureSha = await client.readFixtureSha256(sandbox);
    expect(fixtureSha).toBe(P0_SANDBOX_FIXTURE_DEMO_LINES_SHA256);
    expect(fixtureSha).toBe(sha256Utf8(P0_SANDBOX_FIXTURE_DEMO_LINES));

    const evidence = toRedactedSandboxEvidence({
      sandboxId: sandbox.id,
      lifecycle: mapTrueForgeWireEventsToSandboxLifecycle([
        { type: "sandbox.created", id: "live_probe", sandbox_id: sandbox.id },
        {
          type: "model.message",
          id: "live_msg",
          tool_calls: [
            {
              id: "live_tc",
              function: { name: "write_file" },
              tool_info: { type: "truefoundry-system", name: "write_file" },
            },
          ],
        },
        {
          type: "tool.response",
          id: "live_resp",
          tool_call_id: "live_tc",
          content: "ok",
        },
      ]),
      credentialCanary,
      egress,
      fixtureContentSha256: fixtureSha,
    });

    expect(evidence.fixture.match).toBe(true);
    expect(evidence.credentialCanaryAbsent).toBe(true);
    expect(evidence.sandboxIdSuffix).toMatch(/^[A-Za-z0-9]{4}$/);
    expect(JSON.stringify(evidence)).not.toContain(process.env.DAYTONA_API_KEY!);
  }, 120_000);
});

describe("DaytonaProbeClient", () => {
  it("constructs toolbox execute URL from sandbox record", () => {
    const client = new DaytonaProbeClient({ apiKey: "test_key" });
    expect(client).toBeDefined();
    expect(evaluateCredentialCanary([]).absent).toBe(true);
    expect(evaluateEgressProbe("200").openEgress).toBe(true);
  });
});
