export type ForgeRoomEventMetadataV1 = {
  schemaVersion: 1;
  channelId: string;
  coworkerId: string;
  actorKind: "coworker";
  logicalThreadId?: string;
  aguiRunId?: string;
  applicationRunId?: string;
  runStepId?: string;
  agentTurnId?: string;
};

export function buildForgeRoomEventMetadata(input: {
  channelId: string;
  coworkerId: string;
  logicalThreadId: string;
  aguiRunId: string;
  applicationRunId?: string;
  runStepId?: string;
  agentTurnId?: string;
}): { forgeroom: ForgeRoomEventMetadataV1 } {
  return {
    forgeroom: {
      schemaVersion: 1,
      channelId: input.channelId,
      coworkerId: input.coworkerId,
      actorKind: "coworker",
      logicalThreadId: input.logicalThreadId,
      aguiRunId: input.aguiRunId,
      ...(input.applicationRunId ? { applicationRunId: input.applicationRunId } : {}),
      ...(input.runStepId ? { runStepId: input.runStepId } : {}),
      ...(input.agentTurnId ? { agentTurnId: input.agentTurnId } : {}),
    },
  };
}
