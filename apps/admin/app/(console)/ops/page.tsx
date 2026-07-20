import { StatusAlert } from "@/components/admin/status-alert";
import { OpsRunsPagination } from "@/components/ops/ops-list-actions";
import { OpsRunsTable } from "@/components/ops/ops-runs-table";
import { OpsScriptsPanel } from "@/components/ops/ops-scripts-panel";
import { OpsTabsList, OpsTabsTrigger } from "@/components/ops/ops-tabs";
import { LocationMetricsPanel } from "@/components/ops/location-metrics-panel";
import { ReleaseDeploymentsPanel } from "@/components/ops/release-deployments-panel";
import { ServiceHealthPanel } from "@/components/ops/service-health-panel";
import { SystemMetricsPanel } from "@/components/ops/system-metrics-panel";
import Link from "next/link";
import type {
  OpsScript,
  OpsScriptRun,
  LocationMetricsData,
  Pagination,
  ReleaseOptionsData,
  ReleaseRuntimeVersionData,
  ReleaseRun,
  ReleaseRunListData,
  ReleaseSuccessfulRef,
  ReleaseSuccessfulRefListData,
} from "@/components/ops/ops-types";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { getAdminSession, getAdminToken } from "@/lib/auth";
import { buildBackendUrl, parseBackendJson } from "@/lib/backend";
import { isPlatformOnlySession } from "@/lib/session-mode";

type ScriptListData = {
  list: OpsScript[];
};

type RunListData = {
  list: OpsScriptRun[];
  pagination: Pagination;
};

type OpsPageSearchParams = {
  page?: string;
  tab?: string;
};

const OPS_RUNS_PAGE_SIZE = 10;
const OPS_TABS = ["health", "scripts", "runs", "releases"] as const;
const OPS_PAGE_SHELL_CLASS = "flex h-full min-h-0 flex-col gap-5 overflow-y-auto pb-6 pr-1 [scrollbar-gutter:stable]";

type OpsTab = typeof OPS_TABS[number];

function normalizePage(value: string | undefined) {
  const page = Number(value || 1);
  return Number.isFinite(page) && page > 0 ? Math.floor(page) : 1;
}

function normalizeTab(value: string | undefined): OpsTab {
  return OPS_TABS.includes(value as OpsTab) ? value as OpsTab : "health";
}

function buildOpsTabHref(tab: OpsTab, page?: number) {
  const params = new URLSearchParams();
  params.set("tab", tab);
  if (tab === "runs" && page && page > 1) {
    params.set("page", String(page));
  }
  return `/ops?${params.toString()}`;
}

async function fetchBackendData<T>(token: string, path: string) {
  const response = await fetch(buildBackendUrl(path), {
    headers: {
      authorization: `Bearer ${token}`,
    },
    cache: "no-store",
  });
  const payload = await parseBackendJson<T>(response);
  return payload.data as T;
}

async function fetchOptionalBackendData<T>(token: string, path: string, fallbackMessage: string) {
  try {
    return {
      data: await fetchBackendData<T>(token, path),
      error: null as string | null,
    };
  } catch (error) {
    return {
      data: null as T | null,
      error: error instanceof Error ? error.message : fallbackMessage,
    };
  }
}

function emptyPagination(page: number, pageSize: number): Pagination {
  return { page, pageSize, total: 0, totalPages: 0 };
}

function emptyOpsData(page: number, errorMessage?: string) {
  return {
    scripts: [] as OpsScript[],
    runs: [] as OpsScriptRun[],
    releaseOptions: null as ReleaseOptionsData | null,
    releaseRuns: [] as ReleaseRun[],
    releaseRunsPagination: emptyPagination(1, 5),
    releaseSuccessfulRefs: [] as ReleaseSuccessfulRef[],
    releaseSuccessfulRefsPagination: emptyPagination(1, 5),
    releaseRuntimeVersions: null as ReleaseRuntimeVersionData | null,
    locationMetrics: null as LocationMetricsData | null,
    pagination: emptyPagination(page, OPS_RUNS_PAGE_SIZE),
    error: errorMessage || null,
    releaseError: errorMessage || null,
    releaseRuntimeError: errorMessage || null,
    locationMetricsError: errorMessage || null,
  };
}

async function getOpsData(params: OpsPageSearchParams, activeTab: OpsTab) {
  const page = normalizePage(params.page);
  const token = await getAdminToken();
  if (!token) {
    return emptyOpsData(page, "缺少登录凭证");
  }

  try {
    const query = new URLSearchParams({
      page: String(page),
      pageSize: String(OPS_RUNS_PAGE_SIZE),
    });
    const baseData = emptyOpsData(page);

    if (activeTab === "health") {
      const locationMetricsResult = await fetchOptionalBackendData<LocationMetricsData>(
        token,
        "/admin/ops/location-metrics",
        "定位匹配统计加载失败",
      );

      return {
        ...baseData,
        locationMetrics: locationMetricsResult.data,
        locationMetricsError: locationMetricsResult.error,
      };
    }

    if (activeTab === "scripts") {
      const scriptData = await fetchBackendData<ScriptListData>(token, "/admin/ops/scripts");
      const runData = await fetchBackendData<RunListData>(token, `/admin/ops/script-runs?${query}`);

      return {
        ...baseData,
        scripts: scriptData?.list || [],
        runs: runData?.list || [],
        pagination: runData?.pagination || emptyPagination(page, OPS_RUNS_PAGE_SIZE),
        error: null,
      };
    }

    if (activeTab === "runs") {
      const runData = await fetchBackendData<RunListData>(token, `/admin/ops/script-runs?${query}`);

      return {
        ...baseData,
        runs: runData?.list || [],
        pagination: runData?.pagination || emptyPagination(page, OPS_RUNS_PAGE_SIZE),
        error: null,
      };
    }

    if (activeTab === "releases") {
      const releaseOptionsResult = await fetchOptionalBackendData<ReleaseOptionsData>(
        token,
        "/admin/ops/releases/options",
        "发布配置加载失败",
      );
      const releaseRunsResult = await fetchOptionalBackendData<ReleaseRunListData>(
        token,
        "/admin/ops/releases/runs?page=1&pageSize=5",
        "发布记录加载失败",
      );
      const releaseSuccessfulRefsResult = await fetchOptionalBackendData<ReleaseSuccessfulRefListData>(
        token,
        "/admin/ops/releases/successful-refs?pageSize=5",
        "成功版本加载失败",
      );
      const releaseRuntimeVersionsResult = await fetchOptionalBackendData<ReleaseRuntimeVersionData>(
        token,
        "/admin/ops/releases/runtime-versions",
        "运行版本加载失败",
      );

      return {
        ...baseData,
        releaseOptions: releaseOptionsResult.data,
        releaseRuns: releaseRunsResult.data?.list || [],
        releaseRunsPagination: releaseRunsResult.data?.pagination || emptyPagination(1, 5),
        releaseSuccessfulRefs: releaseSuccessfulRefsResult.data?.list || [],
        releaseSuccessfulRefsPagination: releaseSuccessfulRefsResult.data?.pagination || emptyPagination(1, 5),
        releaseRuntimeVersions: releaseRuntimeVersionsResult.data,
        releaseError: releaseOptionsResult.error || releaseRunsResult.error || releaseSuccessfulRefsResult.error,
        releaseRuntimeError: releaseRuntimeVersionsResult.error,
      };
    }

    return baseData;
  } catch (error) {
    return emptyOpsData(page, error instanceof Error ? error.message : "运维脚本加载失败");
  }
}

export default async function OpsPage({
  searchParams,
}: {
  searchParams: Promise<OpsPageSearchParams>;
}) {
  const params = await searchParams;
  const activeTab = normalizeTab(params.tab);
  const session = await getAdminSession();
  const hasPlatformAccess = isPlatformOnlySession(session);

  if (!hasPlatformAccess) {
    return (
      <div className={OPS_PAGE_SHELL_CLASS}>
        <div>
          <h1 className="text-2xl font-semibold tracking-normal">运维脚本</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            聚合资源状态、微服务健康、白名单脚本和执行记录，平台运维动作保持可审计。
          </p>
        </div>
        <StatusAlert title="无法访问运维脚本">
          当前账号不是平台超管，无法访问运维脚本。请切换到平台管理账号后再试。
        </StatusAlert>
      </div>
    );
  }

  const {
    scripts,
    runs,
    releaseOptions,
    releaseRuns,
    releaseRunsPagination,
    releaseSuccessfulRefs,
    releaseSuccessfulRefsPagination,
    releaseRuntimeVersions,
    locationMetrics,
    pagination,
    error,
    releaseError,
    releaseRuntimeError,
    locationMetricsError,
  } = await getOpsData(params, activeTab);
  const successCount = runs.filter((item) => item.status === "success").length;
  const failedCount = runs.filter((item) => item.status === "failed" || item.status === "timeout").length;
  const opsTabs = [
    {
      value: "health" as const,
      label: "健康监控",
      href: buildOpsTabHref("health"),
      count: "",
      content: (
        <div className="flex flex-col gap-3">
          <SystemMetricsPanel />
          <LocationMetricsPanel metrics={locationMetrics} error={locationMetricsError} />
          <ServiceHealthPanel />
        </div>
      ),
    },
    {
      value: "scripts" as const,
      label: "脚本执行",
      href: buildOpsTabHref("scripts"),
      count: activeTab === "scripts" ? String(scripts.length) : "",
      content: (
        <div className="flex flex-col gap-3">
          <OpsScriptsPanel scripts={scripts} recentRuns={runs} error={error} />
        </div>
      ),
    },
    {
      value: "runs" as const,
      label: "执行记录",
      href: buildOpsTabHref("runs", pagination.page),
      count: activeTab === "runs" ? `${successCount}/${failedCount}` : "",
      content: (
        <div className="flex flex-col gap-3">
          {error ? <StatusAlert>{error}</StatusAlert> : null}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-3 pb-3">
              <CardTitle>最近执行记录</CardTitle>
              <Badge variant="outline">
                第 {pagination.page} / {Math.max(pagination.totalPages, 1)} 页
              </Badge>
            </CardHeader>
            <CardContent className="p-0">
              <OpsRunsTable runs={runs} />
            </CardContent>
          </Card>

          <div className="flex items-center justify-between gap-3">
            <div className="text-sm text-muted-foreground">
              每页 {pagination.pageSize} 条，共 {pagination.total} 条
            </div>
            <OpsRunsPagination pagination={pagination} />
          </div>
        </div>
      ),
    },
    {
      value: "releases" as const,
      label: "版本发布",
      href: buildOpsTabHref("releases"),
      count: activeTab === "releases" ? String(releaseRuns.length) : "",
      content: (
        <ReleaseDeploymentsPanel
          options={releaseOptions}
          runs={releaseRuns}
          runsPagination={releaseRunsPagination}
          successfulRefs={releaseSuccessfulRefs}
          successfulRefsPagination={releaseSuccessfulRefsPagination}
          runtimeVersions={releaseRuntimeVersions}
          runtimeError={releaseRuntimeError}
          error={releaseError}
        />
      ),
    },
  ];

  return (
    <div className={OPS_PAGE_SHELL_CLASS}>
      <div>
        <h1 className="text-2xl font-semibold tracking-normal">运维脚本</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          聚合资源状态、微服务健康、白名单脚本和执行记录，平台运维动作保持可审计。
        </p>
      </div>

      <Tabs defaultValue={activeTab} className="flex flex-col gap-3">
        <OpsTabsList>
          {opsTabs.map((item) => (
            <OpsTabsTrigger key={item.value} value={item.value} asChild>
              <Link href={item.href}>
                {item.label}
                {item.count ? <span className="ml-2 text-xs text-muted-foreground">{item.count}</span> : null}
              </Link>
            </OpsTabsTrigger>
          ))}
        </OpsTabsList>

        {opsTabs.map((item) => (
          <TabsContent key={item.value} value={item.value} className="mt-0">
            {item.content}
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
