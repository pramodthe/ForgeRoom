import type { DataGrant } from "@forgeroom/contracts";
import { resolveRetainedDataGrantRead } from "./retained-data-grants";

export type UiDataFunctionHandlerInput = {
  snapshot: unknown;
  dataGrant: DataGrant;
  arguments: Record<string, unknown>;
  startedAtMs: number;
};

type UiDataFunctionHandler = (input: UiDataFunctionHandlerInput) => unknown;

function readRetainedSnapshot(input: UiDataFunctionHandlerInput): unknown {
  void input.arguments;
  return resolveRetainedDataGrantRead({
    snapshot: input.snapshot,
    dataGrant: input.dataGrant,
    allowedSelectionPaths: [],
    startedAtMs: input.startedAtMs,
  });
}

const handlers: Record<string, UiDataFunctionHandler> = {
  rows: readRetainedSnapshot,
  series: readRetainedSnapshot,
  task: readRetainedSnapshot,
  artifact: readRetainedSnapshot,
};

export function executeUiDataFunctionHandler(
  functionName: string,
  input: UiDataFunctionHandlerInput,
): unknown | null {
  const handler = handlers[functionName];
  if (!handler) {
    return null;
  }
  return handler(input);
}
