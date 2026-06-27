import { readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";

function readOpsSources() {
  return {
    page: readFileSync(
      new URL("../../app/(console)/ops/page.tsx", import.meta.url),
      "utf8",
    ),
    actions: readFileSync(new URL("./ops-actions.tsx", import.meta.url), "utf8"),
    opsTabs: readFileSync(new URL("./ops-tabs.tsx", import.meta.url), "utf8"),
    releaseDeployments: readFileSync(
      new URL("./release-deployments-panel.tsx", import.meta.url),
      "utf8",
    ),
    releaseDispatch: readFileSync(
      new URL("./release-deployments-dispatch-card.tsx", import.meta.url),
      "utf8",
    ),
    serviceHealth: readFileSync(
      new URL("./service-health-panel.tsx", import.meta.url),
      "utf8",
    ),
    loading: readFileSync(
      new URL("../../app/(console)/ops/loading.tsx", import.meta.url),
      "utf8",
    ),
    locationMetrics: readFileSync(
      new URL("./location-metrics-panel.tsx", import.meta.url),
      "utf8",
    ),
  };
}

describe("Ops page hardening", () => {
  test("guards the ops route with a platform-only access message before data loading", () => {
    const { page } = readOpsSources();

    expect(page).toContain("getAdminSession");
    expect(page).toContain("isPlatformOnlySession");
    expect(page).toContain("hasPlatformAccess");
    expect(page).toContain("当前账号不是平台超管，无法访问运维脚本");
    expect(page).toContain("if (!hasPlatformAccess)");
  });

  test("loads only the active ops tab data on the server", () => {
    const { page } = readOpsSources();

    expect(page).toContain("getOpsData(params, activeTab)");
    expect(page).toContain('if (activeTab === "health")');
    expect(page).toContain('if (activeTab === "scripts")');
    expect(page).toContain('if (activeTab === "runs")');
    expect(page).toContain('if (activeTab === "releases")');
    expect(page).not.toContain("Promise.all([");
  });

  test("requires explicit confirmation and an execution reason before running scripts", () => {
    const { actions } = readOpsSources();

    expect(actions).toContain("reason.trim()");
    expect(actions).toContain("确认运行脚本");
    expect(actions).toContain("执行原因");
    expect(actions).toContain("disabled={!canRun}");
    expect(actions).toContain("{ reason: trimmedReason }");
  });

  test("gives repeated run buttons and log outputs stable accessible names", () => {
    const { actions } = readOpsSources();

    expect(actions).toContain("aria-label={`运行脚本 ${script.label}`}");
    expect(actions).toContain("htmlFor={stdoutId}");
    expect(actions).toContain("htmlFor={stderrId}");
    expect(actions).toContain("id={stdoutId}");
    expect(actions).toContain("id={stderrId}");
  });

  test("keeps the loading header skeleton inside narrow viewports", () => {
    const { loading } = readOpsSources();

    expect(loading).toContain("w-full max-w-96");
    expect(loading).not.toContain("h-4 w-96");
  });

  test("keeps the ops page scrollable inside the admin shell main region", () => {
    const { page, loading } = readOpsSources();

    expect(page).toContain("OPS_PAGE_SHELL_CLASS");
    expect(page).toContain("h-full min-h-0");
    expect(page).toContain("overflow-y-auto");
    expect(loading).toContain("h-full min-h-0");
    expect(loading).toContain("overflow-y-auto");
  });

  test("uses the shadcn-backed ops tab container for every ops tabs list", () => {
    const { page, opsTabs, releaseDeployments, serviceHealth } = readOpsSources();
    const tabSources = [page, releaseDeployments, serviceHealth];

    expect(opsTabs).toContain('from "@/components/ui/tabs"');
    expect(opsTabs).toContain("TabsList");
    for (const source of tabSources) {
      expect(source).toContain("OpsTabsList");
      expect(source).not.toContain("<TabsList");
      expect(source).not.toContain("<TabsList className=");
    }
  });

  test("renders location governance as a shadcn card with lightweight data components", () => {
    const { locationMetrics } = readOpsSources();

    expect(locationMetrics).toContain('from "@/components/ui/card"');
    expect(locationMetrics).toContain("CardHeader");
    expect(locationMetrics).toContain("CardContent");
    expect(locationMetrics).toContain('from "@/components/ui/table"');
    expect(locationMetrics).toContain("TableHeader");
    expect(locationMetrics).toContain("TableBody");
    expect(locationMetrics).toContain('from "@/components/ui/collapsible"');
    expect(locationMetrics).toContain("CollapsibleContent");
    expect(locationMetrics).not.toContain("MetricBlock");
    expect(locationMetrics).not.toContain("WindowSummary");
  });

  test("merges release operation tabs into the primary shadcn card header", () => {
    const { releaseDeployments, releaseDispatch } = readOpsSources();

    expect(releaseDeployments).toContain('from "@/components/ui/card"');
    expect(releaseDeployments).toContain("CardHeader");
    expect(releaseDeployments).toContain("CardContent");
    expect(releaseDeployments).toContain("<OpsTabsList");
    expect(releaseDeployments).toContain('value={releaseMode}');
    expect(releaseDeployments).toContain('releaseMode === "database-migration"');
    expect(releaseDispatch).not.toContain('from "@/components/ui/card"');
    expect(releaseDispatch).not.toContain("<Card>");
    expect(releaseDispatch).not.toContain("<CardHeader");
    expect(releaseDispatch).not.toContain("<CardContent");
  });
});
