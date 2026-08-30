import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  SupportBriefArtifactCard,
  SupportInsightsCard,
  supportBriefPdf,
  supportEvidenceCsv,
} from "./demo-rich-response";

describe("demo rich-response actions", () => {
  it("exports the complete evidence table as CSV", () => {
    const csv = supportEvidenceCsv();

    expect(csv).toContain("Theme,Conversations,Escalation,7d trend");
    expect(csv).toContain("Billing confusion,163,12.8%,+2.1%");
    expect(csv.split("\n")).toHaveLength(5);
  });

  it("builds a valid single-page PDF fixture", () => {
    const pdf = new TextDecoder().decode(supportBriefPdf());

    expect(pdf.startsWith("%PDF-1.4")).toBe(true);
    expect(pdf).toContain("xref");
    expect(pdf).toContain("/Type /Catalog");
    expect(pdf.trimEnd().endsWith("%%EOF")).toBe(true);
  });

  it("renders source, preview, download, and task controls as actionable elements", () => {
    const html = renderToStaticMarkup(
      <>
        <SupportInsightsCard />
        <SupportBriefArtifactCard />
      </>,
    );
    const source = readFileSync(
      fileURLToPath(new URL("./demo-rich-response.tsx", import.meta.url)),
      "utf8",
    );

    expect(html).toContain('aria-controls="support-insights-source"');
    expect(html).toContain('aria-controls="support-brief-preview"');
    expect(source).toContain('workspaceTaskDetailPath(workspaceId, "task_billing_003")');
  });
});
