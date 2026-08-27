export function formatAgUiSseEvent(event: Record<string, unknown>): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}

export function formatAgUiSseBody(events: ReadonlyArray<Record<string, unknown>>): string {
  return events.map((event) => formatAgUiSseEvent(event)).join("");
}
