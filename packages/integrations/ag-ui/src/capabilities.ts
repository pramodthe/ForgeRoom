import { AG_UI_PACKAGE_PROFILE, SELECTED_AG_UI_VERSIONS } from "./profile";

export type AgUiCoworkerCapabilities = {
  schemaVersion: 1;
  profile: typeof AG_UI_PACKAGE_PROFILE;
  packages: typeof SELECTED_AG_UI_VERSIONS;
  threadId: string;
  channelId: string;
  coworkerId: string;
  resume: { enabled: false; reason: "owned_by_P0-308" };
  reasoning: { supported: false };
  nativeSubagents: { supported: false };
  openGeneratedUi: { supported: false };
  copilotKitGateway: { enabled: false };
  controlledComponents: { supported: true; grantRequired: true };
  interrupts: { supported: true; usesMetadata: true };
  sharedState: { supported: true; kinds: ["thread"] };
  activities: { supported: true; namespaces: ["forgeroom.coworker_work.v1"] };
};

export function buildAgUiCoworkerCapabilities(input: {
  channelId: string;
  coworkerId: string;
  logicalThreadId: string;
}): AgUiCoworkerCapabilities {
  return {
    schemaVersion: 1,
    profile: AG_UI_PACKAGE_PROFILE,
    packages: SELECTED_AG_UI_VERSIONS,
    threadId: input.logicalThreadId,
    channelId: input.channelId,
    coworkerId: input.coworkerId,
    resume: { enabled: false, reason: "owned_by_P0-308" },
    reasoning: { supported: false },
    nativeSubagents: { supported: false },
    openGeneratedUi: { supported: false },
    copilotKitGateway: { enabled: false },
    controlledComponents: { supported: true, grantRequired: true },
    interrupts: { supported: true, usesMetadata: true },
    sharedState: { supported: true, kinds: ["thread"] },
    activities: { supported: true, namespaces: ["forgeroom.coworker_work.v1"] },
  };
}
