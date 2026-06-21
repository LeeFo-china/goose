import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

function readProjectDetailSources() {
  return {
    detail: readFileSync(new URL("./project-acceptance-detail.tsx", import.meta.url), "utf8"),
    page: readFileSync(new URL("./project-detail-page-client.tsx", import.meta.url), "utf8"),
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
});
