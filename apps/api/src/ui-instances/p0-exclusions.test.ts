import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROUTES_DIR = join(import.meta.dirname);
const FORBIDDEN_ROUTE_SEGMENTS = [
  "/render-capabilities",
  "/confirm",
  "request_agent_turn",
  "open_existing_hitl",
] as const;

describe("P0 UI instance routes", () => {
  it("does not register P1-only interaction or render-capability endpoints", () => {
    const routesSource = readFileSync(join(ROUTES_DIR, "routes.ts"), "utf8");
    for (const segment of FORBIDDEN_ROUTE_SEGMENTS) {
      expect(routesSource).not.toContain(segment);
    }
    expect(routesSource).toContain("/api/ui-instances/:instanceId/data/:functionName");
  });
});
