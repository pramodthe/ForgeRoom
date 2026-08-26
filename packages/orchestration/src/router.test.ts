import { describe, expect, it } from "vitest";
import {
  resolveMessageRecipients,
  extractMentionTokens,
  type MentionRouterCoworker,
} from "./router";

function coworker(
  partial: Partial<MentionRouterCoworker> & Pick<MentionRouterCoworker, "id" | "handle">,
): MentionRouterCoworker {
  return {
    status: "active",
    isChannelMember: true,
    availableForNewWork: true,
    ...partial,
  };
}

describe("extractMentionTokens", () => {
  it("extracts ordered unique mentions and normalizes @team", () => {
    expect(extractMentionTokens("hi @analyst and @builder then @analyst")).toEqual([
      "analyst",
      "builder",
    ]);
    expect(extractMentionTokens("@Team please")).toEqual(["team"]);
    expect(extractMentionTokens("email me@host.test then @ops")).toEqual(["ops"]);
    expect(extractMentionTokens("contact foo+@analyst.example then @builder")).toEqual(["builder"]);
    expect(extractMentionTokens("please @ops.v2 now")).toEqual(["ops.v2"]);
  });
});

describe("resolveMessageRecipients", () => {
  const analyst = coworker({ id: "c1", handle: "analyst" });
  const builder = coworker({ id: "c2", handle: "builder" });
  const researcher = coworker({ id: "c3", handle: "researcher" });

  const cases: Array<{
    name: string;
    body: string;
    coworkers: MentionRouterCoworker[];
    expect:
      | { ok: true; routing_mode: "direct" | "team"; recipient_handles: string[] }
      | { ok: false; code: string; reason: string };
  }> = [
    {
      name: "one explicit mention → direct",
      body: "@analyst inspect the fixture",
      coworkers: [analyst, builder],
      expect: { ok: true, routing_mode: "direct", recipient_handles: ["analyst"] },
    },
    {
      name: "multiple explicit mentions → direct",
      body: "@analyst inspect and @builder report",
      coworkers: [analyst, builder],
      expect: { ok: true, routing_mode: "direct", recipient_handles: ["analyst", "builder"] },
    },
    {
      name: "duplicate mentions collapse",
      body: "@analyst ping @analyst",
      coworkers: [analyst],
      expect: { ok: true, routing_mode: "direct", recipient_handles: ["analyst"] },
    },
    {
      name: "@team with one enabled coworker",
      body: "@team kick off",
      coworkers: [analyst, coworker({ id: "x", handle: "out", isChannelMember: false })],
      expect: { ok: true, routing_mode: "team", recipient_handles: ["analyst"] },
    },
    {
      name: "@team with two enabled coworkers sorts handles",
      body: "please @team",
      coworkers: [builder, analyst],
      expect: { ok: true, routing_mode: "team", recipient_handles: ["analyst", "builder"] },
    },
    {
      name: "@team with three enabled coworkers rejected",
      body: "@team all",
      coworkers: [analyst, builder, researcher],
      expect: { ok: false, code: "validation_failed", reason: "team_too_large" },
    },
    {
      name: "@team with zero enabled coworkers rejected",
      body: "@team",
      coworkers: [coworker({ id: "d", handle: "gone", status: "disabled" })],
      expect: { ok: false, code: "recipient_required", reason: "team_empty" },
    },
    {
      name: "no mention with one coworker auto-routes",
      body: "look at this",
      coworkers: [analyst],
      expect: { ok: true, routing_mode: "direct", recipient_handles: ["analyst"] },
    },
    {
      name: "no mention with two coworkers requires recipient",
      body: "look at this",
      coworkers: [analyst, builder],
      expect: { ok: false, code: "recipient_required", reason: "recipient_required" },
    },
    {
      name: "no mention with zero coworkers requires recipient",
      body: "hello channel",
      coworkers: [],
      expect: { ok: false, code: "recipient_required", reason: "recipient_required" },
    },
    {
      name: "unknown handle rejected",
      body: "@nobody hi",
      coworkers: [analyst],
      expect: { ok: false, code: "validation_failed", reason: "unknown_handle" },
    },
    {
      name: "disabled target rejected",
      body: "@analyst hi",
      coworkers: [coworker({ id: "c1", handle: "analyst", status: "disabled" })],
      expect: { ok: false, code: "validation_failed", reason: "disabled_coworker" },
    },
    {
      name: "non-member target rejected",
      body: "@analyst hi",
      coworkers: [coworker({ id: "c1", handle: "analyst", isChannelMember: false })],
      expect: { ok: false, code: "validation_failed", reason: "non_member" },
    },
    {
      name: "ambiguous case-insensitive handles rejected",
      body: "@Analyst hi",
      coworkers: [
        coworker({ id: "c1", handle: "analyst" }),
        coworker({ id: "c2", handle: "Analyst" }),
      ],
      expect: { ok: false, code: "validation_failed", reason: "ambiguous_handle" },
    },
    {
      name: "unavailable/rotating target rejected",
      body: "@analyst hi",
      coworkers: [coworker({ id: "c1", handle: "analyst", availableForNewWork: false })],
      expect: { ok: false, code: "recipient_unavailable", reason: "recipient_unavailable" },
    },
    {
      name: "three explicit mentions exceed fan-out cap",
      body: "@analyst @builder @researcher",
      coworkers: [analyst, builder, researcher],
      expect: { ok: false, code: "validation_failed", reason: "fanout_too_large" },
    },
    {
      name: "@team combined with explicit mention rejected",
      body: "@team and @analyst",
      coworkers: [analyst, builder],
      expect: { ok: false, code: "validation_failed", reason: "conflicting_routing" },
    },
    {
      name: "client-looking handles in body alone drive routing",
      body: "@builder only",
      coworkers: [analyst, builder],
      expect: { ok: true, routing_mode: "direct", recipient_handles: ["builder"] },
    },
    {
      name: "disabled members ignored for no-mention single auto-route",
      body: "no mention",
      coworkers: [coworker({ id: "c1", handle: "analyst", status: "disabled" }), builder],
      expect: { ok: true, routing_mode: "direct", recipient_handles: ["builder"] },
    },
    {
      name: "@team excludes unavailable coworkers from the enabled set",
      body: "@team go",
      coworkers: [coworker({ id: "c1", handle: "analyst", availableForNewWork: false }), builder],
      expect: { ok: true, routing_mode: "team", recipient_handles: ["builder"] },
    },
    {
      name: "@team rejects case-insensitive handle collisions",
      body: "@team go",
      coworkers: [
        coworker({ id: "c1", handle: "analyst" }),
        coworker({ id: "c2", handle: "Analyst" }),
      ],
      expect: { ok: false, code: "validation_failed", reason: "ambiguous_handle" },
    },
    {
      name: "dotted handle mention routes exactly",
      body: "@ops.v2 please",
      coworkers: [coworker({ id: "c9", handle: "ops.v2" })],
      expect: { ok: true, routing_mode: "direct", recipient_handles: ["ops.v2"] },
    },
    {
      name: "email local-part does not create a mention",
      body: "ping foo+@analyst.example for details",
      coworkers: [analyst, builder],
      expect: { ok: false, code: "recipient_required", reason: "recipient_required" },
    },
  ];

  it.each(cases)("$name", (row) => {
    const result = resolveMessageRecipients({ body: row.body, coworkers: row.coworkers });
    if (row.expect.ok) {
      expect(result).toEqual({
        ok: true,
        routing_mode: row.expect.routing_mode,
        recipient_handles: row.expect.recipient_handles,
      });
    } else {
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.code).toBe(row.expect.code);
        expect(result.reason).toBe(row.expect.reason);
      }
    }
  });

  it("never returns more than two recipients on success", () => {
    for (const row of cases.filter((entry) => entry.expect.ok)) {
      const result = resolveMessageRecipients({ body: row.body, coworkers: row.coworkers });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.recipient_handles.length).toBeGreaterThan(0);
        expect(result.recipient_handles.length).toBeLessThanOrEqual(2);
      }
    }
  });
});
