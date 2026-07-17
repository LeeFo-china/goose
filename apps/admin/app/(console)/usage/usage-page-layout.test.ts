import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

function readSource(path: string) {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

describe("Tenant usage page layout", () => {
  test("keeps usage tabs inside a project-style fixed workspace", () => {
    const page = readSource("./page.tsx");

    expect(page).toContain("h-[calc(100vh-6.5625rem)]");
    expect(page).toContain("min-h-0 flex-col gap-5 overflow-hidden");
    expect(page).toContain("Card className=\"flex min-h-0 flex-1 flex-col overflow-hidden shadow-none\"");
    expect(page).toContain("CardHeader className=\"shrink-0 flex flex-col gap-3 border-b bg-card px-4 py-0\"");
    expect(page).toContain("CardContent className=\"relative flex min-h-0 flex-1 flex-col bg-card p-0\"");
    expect(page).toContain("data-testid=\"tenant-usage-list-table-viewport\"");
    expect(page).toContain("UsageOverviewPanel");
    expect(page).toContain("UsageTabsNav");
    expect(page).toContain("tabsListClassName=\"h-auto min-w-max justify-start gap-5 overflow-x-auto overflow-y-hidden rounded-none border-0 bg-transparent p-0\"");
    expect(page).toContain("tabsTriggerClassName=\"rounded-none border-0 border-b-2 border-transparent bg-transparent px-0 py-2 text-sm text-muted-foreground data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-foreground\"");
    expect(page).not.toContain("<CardTitle>本租户用量</CardTitle>");
    expect(page).not.toContain("租户只能查看本公司的 AI、短信和短视频转写用量");
    expect(page).not.toContain("<UsageSummaryCards data={summaryResult.data} />");
    expect(page).not.toContain("grid gap-3 p-4 md:grid-cols-3");
    expect(page).not.toContain("TabsTrigger value=\"ai\" asChild");
  });

  test("renders the usage overview as a flat panel, not nested cards", () => {
    const overview = readSource("../../../components/usage/usage-overview-panel.tsx");

    expect(overview).not.toContain("@/components/ui/card");
    expect(overview).not.toContain("<Card");
    expect(overview).toContain("grid gap-3");
    expect(overview).toContain("成功率");
    expect(overview).toContain("缺失");
  });

  test("keeps usage filters compact without blank grid columns", () => {
    const actions = readSource("../../../components/usage/usage-list-actions.tsx");
    const switchTabStart = actions.indexOf("function switchTab");
    const filtersStart = actions.indexOf("export function UsageFilters");
    const tabNavSource = actions.slice(switchTabStart, filtersStart);

    expect(actions).toContain("flex flex-wrap items-center gap-3");
    expect(actions).toContain("<Tabs value={tab} onValueChange={switchTab}>");
    expect(actions).toContain("TabsList className={tabsListClassName}");
    expect(tabNavSource).not.toContain("router.refresh()");
    expect(actions).not.toContain("lg:grid-cols-[160px_160px_1fr_180px_160px_80px]");
    expect(actions).not.toContain("<div />");
  });
});
