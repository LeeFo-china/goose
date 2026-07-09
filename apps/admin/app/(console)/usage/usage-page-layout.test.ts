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
    expect(page).toContain("CardHeader className=\"shrink-0 flex flex-col gap-3 border-b bg-muted/20 p-3\"");
    expect(page).toContain("CardContent className=\"relative flex min-h-0 flex-1 flex-col bg-card p-0\"");
    expect(page).toContain("data-testid=\"tenant-usage-list-table-viewport\"");
    expect(page).toContain("UsageOverviewPanel");
    expect(page).toContain("UsageTabsNav");
    expect(page).toContain("tabsListClassName=\"w-full shrink-0 justify-start overflow-x-auto overflow-y-hidden md:w-auto\"");
    expect(page).toContain("tabsTriggerClassName=\"px-2 sm:px-3\"");
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
