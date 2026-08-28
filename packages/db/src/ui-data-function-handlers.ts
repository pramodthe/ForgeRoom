import type { DataGrant } from "@forgeroom/contracts";
import { resolveRetainedDataGrantRead } from "./retained-data-grants";

export type UiDataFunctionHandlerInput = {
  snapshot: unknown;
  dataGrant: DataGrant;
  arguments: Record<string, unknown>;
};

type UiDataFunctionHandler = (input: UiDataFunctionHandlerInput) => unknown;

const handlers: Record<string, UiDataFunctionHandler> = {
  rows(input) {
    void input.arguments;
    return resolveRetainedDataGrantRead({
      snapshot: input.snapshot,
      dataGrant: input.dataGrant,
      allowedSelectionPaths: [],
    });
  },
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
