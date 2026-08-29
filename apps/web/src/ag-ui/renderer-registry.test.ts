import { describe, expect, it } from "vitest";
import { isRegisteredAgentToolComponent, resolveBackendToolRenderer } from "./renderer-registry";

describe("resolveBackendToolRenderer", () => {
  it("uses named renderers for reviewed P0 agent tool components", () => {
    const resolved = resolveBackendToolRenderer({ toolName: "DataTable", status: "running" });
    expect(resolved.kind).toBe("named");
    expect(resolved.presentation.eyebrow).toBe("Reviewed component");
    expect(resolved.presentation.inert).toBeUndefined();
  });

  it("keeps iframe_v1 and open-generated tools inert", () => {
    expect(resolveBackendToolRenderer({ toolName: "iframe_v1", status: "complete" }).kind).toBe(
      "inert",
    );
    expect(
      resolveBackendToolRenderer({ toolName: "generate_open_ui", status: "running" }).kind,
    ).toBe("inert");
    expect(
      resolveBackendToolRenderer({ toolName: "iframe_v1", status: "complete" }).presentation.inert,
    ).toBe(true);
  });

  it("falls back to inert default for unknown tools", () => {
    const resolved = resolveBackendToolRenderer({
      toolName: "MysteriousExternalTool",
      status: "complete",
    });
    expect(resolved.kind).toBe("inert");
    expect(resolved.presentation.inert).toBe(true);
  });

  it("exposes the stable agent-tool name set", () => {
    expect(isRegisteredAgentToolComponent("ChoiceForm")).toBe(true);
    expect(isRegisteredAgentToolComponent("iframe_v1")).toBe(false);
  });
});
