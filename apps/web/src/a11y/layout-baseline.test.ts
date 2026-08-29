import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { listP0RequiredStateKeys } from "./p0-required-states";

const webRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

describe("P0 layout and state coverage baseline", () => {
  it("keeps 1440px channel workroom minimum width", () => {
    const source = readFileSync(join(webRoot, "shell/channel-workroom.tsx"), "utf8");
    expect(source).toContain("min-w-[1440px]");
  });

  it("documents skip-link and trusted HITL stacking in global styles", () => {
    const source = readFileSync(join(webRoot, "styles.css"), "utf8");
    expect(source).toContain(".skip-link");
    expect(source).toContain(".trusted-hitl-strip");
    expect(source).toContain("prefers-reduced-motion");
  });

  it("tracks every P0 required ux.md state surface in the registry", () => {
    const keys = listP0RequiredStateKeys();
    expect(keys.length).toBeGreaterThanOrEqual(18);
    expect(keys).toContain("reconnecting-stream");
    expect(keys).toContain("ag-ui-resync");
  });
});
