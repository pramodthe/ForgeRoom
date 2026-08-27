import { describe, expect, it } from "vitest";
import {
  buildGrantScopePreimage,
  canOfferToCoworker,
  hashGrantScope,
  intersectComponentAvailability,
  isComponentEffectivelyGranted,
} from "./grants";
import { getRegistryDefinition } from "./registry";

describe("component grant policy", () => {
  const dataTable = getRegistryDefinition("DataTable");
  if (!dataTable) {
    throw new Error("expected DataTable registry entry");
  }

  it("defaults to deny without publication and grant", () => {
    expect(
      isComponentEffectivelyGranted({
        exposure: "agent_tool",
        hasActiveGrant: false,
        published: false,
      }),
    ).toBe(false);
    expect(
      intersectComponentAvailability({
        definition: dataTable,
        published: false,
        activeGrant: false,
      }),
    ).toEqual({ available: false, reason: "not_published" });
  });

  it("never offers server_only components to coworkers", () => {
    const approvalCard = getRegistryDefinition("ApprovalCard");
    if (!approvalCard) {
      throw new Error("expected ApprovalCard registry entry");
    }
    expect(canOfferToCoworker(approvalCard)).toBe(false);
    expect(
      intersectComponentAvailability({
        definition: approvalCard,
        published: true,
        activeGrant: true,
      }),
    ).toEqual({ available: false, reason: "server_only" });
    expect(
      isComponentEffectivelyGranted({
        exposure: "server_only",
        hasActiveGrant: true,
        published: true,
      }),
    ).toBe(false);
  });

  it("requires a positive grant for agent tools", () => {
    expect(canOfferToCoworker(dataTable)).toBe(true);
    expect(
      intersectComponentAvailability({
        definition: dataTable,
        published: true,
        activeGrant: false,
      }),
    ).toEqual({ available: false, reason: "not_granted" });
    expect(
      intersectComponentAvailability({
        definition: dataTable,
        published: true,
        activeGrant: true,
      }),
    ).toEqual({ available: true });
    expect(
      isComponentEffectivelyGranted({
        exposure: "agent_tool",
        hasActiveGrant: true,
        published: true,
      }),
    ).toBe(true);
  });

  it("rejects stale grant descriptor hashes", () => {
    expect(
      intersectComponentAvailability({
        definition: dataTable,
        published: true,
        activeGrant: true,
        expectedDescriptorHash:
          "sha256:0000000000000000000000000000000000000000000000000000000000000000",
      }),
    ).toEqual({
      available: false,
      reason: "descriptor_mismatch",
      expectedDescriptorHash:
        "sha256:0000000000000000000000000000000000000000000000000000000000000000",
      actualDescriptorHash: dataTable.descriptorHash,
    });
  });

  it("hashes grant scope preimages for audit", () => {
    const preimage = buildGrantScopePreimage({
      workspaceId: "ws_1",
      channelId: "ch_1",
      agentProfileId: "cw_1",
      componentVersionId: "componentv_table",
    });
    expect(hashGrantScope(preimage)).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(hashGrantScope(preimage)).toBe(hashGrantScope(preimage));
  });
});
