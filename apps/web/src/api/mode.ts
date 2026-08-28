/**
 * Deliberate frontend-only mode. It never contacts the API, so visual and interaction work can
 * proceed before the matching backend capability is connected.
 */
export function fixtureModeFor(mode: string): boolean {
  return mode === "test" || mode === "prototype";
}

export const isFixtureMode = fixtureModeFor(import.meta.env.MODE);
