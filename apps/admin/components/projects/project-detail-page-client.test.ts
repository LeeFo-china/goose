import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

function readProjectDetailSources() {
  return {
    detail: readFileSync(new URL("./project-acceptance-detail.tsx", import.meta.url), "utf8"),
    overview: readFileSync(new URL("./project-detail-overview-panel.tsx", import.meta.url), "utf8"),
    page: readFileSync(new URL("./project-detail-page-client.tsx", import.meta.url), "utf8"),
    financeSummary: readFileSync(new URL("./project-finance-operating-summary-panel.tsx", import.meta.url), "utf8"),
    financeWidgets: readFileSync(new URL("./project-finance-operating-summary-widgets.tsx", import.meta.url), "utf8"),
    rail: readFileSync(new URL("./project-detail-side-rail.tsx", import.meta.url), "utf8"),
    stageList: readFileSync(new URL("./project-acceptance-stage-list.tsx", import.meta.url), "utf8"),
    workbench: readFileSync(new URL("./project-acceptance-workbench.tsx", import.meta.url), "utf8"),
  };
}

describe("Project detail page layout", () => {
  test("contains page scroll inside fixed-height project workspace", () => {
    const { detail, page, rail, stageList, workbench } = readProjectDetailSources();

    expect(page).toContain('data-testid="project-detail-workspace"');
    expect(page).toContain("h-[calc(100dvh-6.5625rem)]");
    expect(page).toContain("min-h-0 flex-col overflow-hidden");
    expect(page).toContain("overflow-hidden rounded-md border bg-card");
    expect(page).toContain('data-testid="project-detail-content"');
    expect(page).toContain('data-testid="project-detail-scroll-region"');
    expect(page).toContain("overflow-y-auto p-4 [scrollbar-gutter:stable]");
    expect(page).toContain("min-h-0 flex-1 overflow-y-auto p-4 [scrollbar-gutter:stable] lg:overflow-hidden lg:p-5");

    expect(rail).toContain('data-testid="project-detail-side-rail"');
    expect(rail).toContain("lg:h-full");
    expect(rail).toContain("overflow-y-auto p-4 [scrollbar-gutter:stable]");
    expect(rail).not.toContain("lg:sticky");
    expect(rail).not.toContain("lg:self-start");

    expect(workbench).toContain("flex h-full min-h-0 min-w-0 flex-col");
    expect(stageList).toContain("flex h-full min-h-0 min-w-0 flex-col");
    expect(detail).toContain("flex h-full min-h-0 min-w-0 flex-col overflow-hidden");
  });

  test("keeps overview as a lightweight workbench instead of stacked detail panels", () => {
    const { financeSummary, financeWidgets, overview, page, rail } = readProjectDetailSources();

    expect(page).toContain("ProjectDetailOverviewPanel");
    expect(page).not.toContain("<ProjectCostBudgetPanel projectId={currentProject.id} />");
    expect(page).not.toContain("<ProjectFinanceReceivableSummaryPanel projectId={currentProject.id} />");
    expect(overview).toContain('data-testid="project-detail-overview-workbench"');
    expect(overview).toContain('data-testid="project-overview-secondary-actions"');
    expect(overview).toContain("<ProjectConstructionStagesPanel");
    expect(overview).toContain("compact");
    expect(overview).toContain("<ProjectWorkflowRuntimePanel");
    expect(overview).toContain("compact");
    expect(financeSummary).toContain('data-testid="project-finance-flow-analysis"');
    expect(financeSummary).toContain('data-testid="project-finance-status-rail"');
    expect(financeSummary).toContain("lg:grid-cols-[minmax(14rem,0.9fr)_minmax(16rem,1.1fr)]");
    expect(financeSummary).not.toContain("repeat(auto-fit,minmax(min(100%,22rem),1fr))");
    expect(financeWidgets).toContain("moneyFlowAxisLabel");
    expect(financeWidgets).not.toContain("rounded-md border bg-card px-3 py-3");
    expect(rail).not.toContain("rounded-md border bg-background p-3");
  });
});
