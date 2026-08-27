/**
 * Deliberate frontend-only mode. It never contacts the API, so visual and interaction work can
 * proceed before the matching backend capability is connected.
 */
export const isFixtureMode =
  import.meta.env.MODE === "test" ||
  import.meta.env.MODE === "prototype" ||
  import.meta.env.VITE_USE_FIXTURES === "true";
