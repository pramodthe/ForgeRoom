import { render } from "@testing-library/react";
import { describe, it } from "vitest";
import { axe } from "vitest-axe";
import { AXE_JSDOM_OPTIONS, expectNoAxeViolations } from "./axe-helpers";
import { EmptyState, ForbiddenState, LoadingState, RouteErrorState } from "../shell-states";

const P0_VIEWPORT_WIDTH_PX = 1440;

describe("shell state accessibility", () => {
  it("LoadingState passes axe", async () => {
    const { container } = render(
      <div style={{ width: P0_VIEWPORT_WIDTH_PX }}>
        <LoadingState title="Loading workspace…" description="Please wait." />
      </div>,
    );
    expectNoAxeViolations(await axe(container, AXE_JSDOM_OPTIONS));
  });

  it("EmptyState passes axe", async () => {
    const { container } = render(
      <div style={{ width: P0_VIEWPORT_WIDTH_PX }}>
        <EmptyState title="No channels yet" description="Create a channel to begin." />
      </div>,
    );
    expectNoAxeViolations(await axe(container, AXE_JSDOM_OPTIONS));
  });

  it("ForbiddenState passes axe", async () => {
    const { container } = render(
      <div style={{ width: P0_VIEWPORT_WIDTH_PX }}>
        <ForbiddenState title="Permission denied" description="You cannot view this resource." />
      </div>,
    );
    expectNoAxeViolations(await axe(container, AXE_JSDOM_OPTIONS));
  });

  it("RouteErrorState passes axe", async () => {
    const { container } = render(
      <div style={{ width: P0_VIEWPORT_WIDTH_PX }}>
        <RouteErrorState title="Unable to load" description="Try again later." />
      </div>,
    );
    expectNoAxeViolations(await axe(container, AXE_JSDOM_OPTIONS));
  });
});
