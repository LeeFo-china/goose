import { readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";

function readDashboardSections() {
  return readFileSync(new URL("./dashboard-sections.tsx", import.meta.url), "utf8");
}

function readTenantOverviewCharts() {
  return readFileSync(new URL("../../../components/dashboard/tenant-overview-charts.tsx", import.meta.url), "utf8");
}

describe("Dashboard layout", () => {
  test("keeps dashboard content contained inside the admin workspace", () => {
    const sections = readDashboardSections();

    expect(sections).toContain("DASHBOARD_SHELL_CLASS");
    expect(sections).toContain("h-full min-h-0 flex-col gap-4 overflow-hidden");
    expect(sections).not.toContain("overflow-y-auto");
    expect(sections.match(/className=\{DASHBOARD_SHELL_CLASS\}/g)?.length).toBe(2);
  });

  test("lets the four tenant trend cards shrink to the available content height", () => {
    const charts = readTenantOverviewCharts();

    expect(charts).toContain("grid min-h-0 flex-1 gap-4 xl:grid-cols-2 xl:grid-rows-2");
    expect(charts.match(/Card className="flex min-h-0 flex-col overflow-hidden"/g)?.length).toBe(4);
    expect(charts.match(/CardContent className="min-h-0 flex-1 p-4 pt-0"/g)?.length).toBe(4);
    expect(charts).not.toContain("h-[260px]");
  });
});
