export {
  PACKAGE_BOUNDARY,
  agentChannelEnvelopeSchema,
  auditReceiptSchema,
  channelMessageCommandSchema,
  channelUIStateV1Schema,
  coworkerDraftConfirmCommandSchema,
  coworkerDraftSchema,
  errorEnvelopeSchema,
  interpretP0Capability,
  interpretUiRail,
  parsePackageBoundary,
  parseUpstreamAgUiEvent,
  parseUpstreamRunAgentInput,
  runActivityCountersSchema,
  runLifecycleSchema,
  runSchema,
  skillBindingSchema,
  skillDraftSchema,
  skillVersionSchema,
  taskGrantSchema,
  taskRecordV1Schema,
  taskRevisionSchema,
  threadUIStateV1Schema,
  uiInstanceSchema,
} from "@forgeroom/contracts";

export type {
  AgentChannelEnvelope,
  ChannelUIStateV1,
  CoworkerDraft,
  PackageBoundary,
  Run,
  SkillVersion,
  TaskRecordV1,
  ThreadUIStateV1,
} from "@forgeroom/contracts";

export { assertFoundationBoundary, DOMAIN_RELEASE } from "./boundary";
export {
  canTransitionCoworkerDraft,
  canTransitionRunLifecycle,
  canTransitionRunStep,
  canTransitionTask,
  COWORKER_DRAFT_TRANSITIONS,
  RUN_LIFECYCLE_TRANSITIONS,
  RUN_STEP_TRANSITIONS,
  TASK_TRANSITIONS,
} from "./transitions";
export { isOwnerRole, isRecentAuthentication, OWNER_ROLE, type WorkspaceRole } from "./auth";
export { canonicalizeJson } from "./components/jcs";
export {
  assertDescriptorMatches,
  buildComponentDescriptorPreimage,
  componentDefinitionFromPreimage,
  hashComponentDescriptor,
  type ComponentDefinition,
  type ComponentDefinitionInput,
  type ComponentDescriptorPreimageV1,
  type ComponentExposure,
  type ComponentKind,
  type ConfirmationPolicy,
} from "./components/descriptor";
export {
  buildGrantScopePreimage,
  canOfferToCoworker,
  hashGrantScope,
  intersectComponentAvailability,
  isComponentEffectivelyGranted,
  recomputeDescriptorHash,
  type ComponentAvailabilityReason,
  type ComponentAvailabilityResult,
  type GrantScopePreimageV1,
} from "./components/grants";
export {
  getRegistryDefinition,
  listAgentToolDefinitions,
  listServerOnlyDefinitions,
  P0_CONTROLLED_REGISTRY,
} from "./components/registry";
export {
  buildApprovalCard,
  evaluateApprovalDecisionGate,
  hashActingIdentity,
  type ProposalDecisionGateResult,
  type ProposalDecisionSnapshot,
} from "./approvals/decision";
