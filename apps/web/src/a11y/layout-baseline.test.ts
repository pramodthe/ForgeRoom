import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { listP0RequiredStateKeys } from "./p0-required-states";

const webRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

describe("P0 layout and state coverage baseline", () => {
  it("keeps the channel workroom fluid while preserving the three-pane desktop layout", () => {
    const source = readFileSync(join(webRoot, "shell/channel-workroom.tsx"), "utf8");
    expect(source).toContain("min-w-0");
    expect(source).not.toContain("min-w-[1440px]");
    expect(source).toContain("ChannelListPane");
    expect(source).toContain("WorkPanelPane");
  });

  it("documents skip-link and trusted HITL stacking in global styles", () => {
    const source = readFileSync(join(webRoot, "styles.css"), "utf8");
    expect(source).toContain(".skip-link");
    expect(source).toContain(".trusted-hitl-strip");
    expect(source).toContain("prefers-reduced-motion");
  });

  it("scopes the dark conversation theme to authenticated workspace pages", () => {
    const layout = readFileSync(join(webRoot, "shell/workspace-layout.tsx"), "utf8");
    const header = readFileSync(join(webRoot, "shell/app-header.tsx"), "utf8");
    const styles = readFileSync(join(webRoot, "styles.css"), "utf8");

    expect(layout).toContain("forgeroom-shell");
    expect(header).toContain('aria-label="Primary"');
    expect(header).toContain('label: "Channels"');
    expect(styles).toContain(".forgeroom-shell");
    expect(styles).toContain("color-scheme: dark");
  });

  it("tracks every P0 required ux.md state surface in the registry", () => {
    const keys = listP0RequiredStateKeys();
    expect(keys.length).toBeGreaterThanOrEqual(18);
    expect(keys).toContain("reconnecting-stream");
    expect(keys).toContain("ag-ui-resync");
  });
});
