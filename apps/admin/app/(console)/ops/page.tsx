import { StatusAlert } from "@/components/admin/status-alert";
import { OpsRunsPagination } from "@/components/ops/ops-list-actions";
import { RunOpsScriptButton } from "@/components/ops/ops-actions";
import { OpsRunsTable } from "@/components/ops/ops-runs-table";
import { ReleaseDeploymentsPanel } from "@/components/ops/release-deployments-panel";
import { ServiceHealthPanel } from "@/components/ops/service-health-panel";
import { SystemMetricsPanel } from "@/components/ops/system-metrics-panel";
import type {
  OpsScript,
  OpsScriptRun,
  Pagination,
  ReleaseOptionsData,
  ReleaseRun,
  ReleaseRunListData,
  ReleaseSuccessfulRef,
  ReleaseSuccessfulRefListData,
} from "@/components/ops/ops-types";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getAdminToken } from "@/lib/auth";
import { buildBackendUrl, parseBackendJson } from "@/lib/backend";

type ScriptListData = {
  list: OpsScript[];
};

type RunListData = {
  list: OpsScriptRun[];
  pagination: Pagination;
};

type OpsPageSearchParams = {
  page?: string;
};

const OPS_RUNS_PAGE_SIZE = 10;

function normalizePage(value: string | undefined) {
  const page = Number(value || 1);
  return Number.isFinite(page) && page > 0 ? Math.floor(page) : 1;
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

async function getOpsData(params: OpsPageSearchParams) {
  const page = normalizePage(params.page);
  const token = await getAdminToken();
  if (!token) {
    return {
      scripts: [] as OpsScript[],
      runs: [] as OpsScriptRun[],
      releaseOptions: null as ReleaseOptionsData | null,
      releaseRuns: [] as ReleaseRun[],
      releaseSuccessfulRefs: [] as ReleaseSuccessfulRef[],
      pagination: { page, pageSize: OPS_RUNS_PAGE_SIZE, total: 0, totalPages: 0 },
      error: "缺少登录凭证",
      releaseError: "缺少登录凭证",
    };
  }

  try {
    const query = new URLSearchParams({
      page: String(page),
      pageSize: String(OPS_RUNS_PAGE_SIZE),
    });
    const [scriptData, runData, releaseOptionsResult, releaseRunsResult, releaseSuccessfulRefsResult] = await Promise.all([
      fetchBackendData<ScriptListData>(token, "/admin/ops/scripts"),
      fetchBackendData<RunListData>(token, `/admin/ops/script-runs?${query}`),
      fetchBackendData<ReleaseOptionsData>(token, "/admin/ops/releases/options")
        .then((data) => ({ data, error: null as string | null }))
        .catch((error) => ({
          data: null as ReleaseOptionsData | null,
          error: error instanceof Error ? error.message : "发布配置加载失败",
        })),
      fetchBackendData<ReleaseRunListData>(token, "/admin/ops/releases/runs?page=1&pageSize=10")
        .then((data) => ({ data, error: null as string | null }))
        .catch((error) => ({
          data: null as ReleaseRunListData | null,
          error: error instanceof Error ? error.message : "发布记录加载失败",
        })),
      fetchBackendData<ReleaseSuccessfulRefListData>(token, "/admin/ops/releases/successful-refs?pageSize=6")
        .then((data) => ({ data, error: null as string | null }))
        .catch((error) => ({
          data: null as ReleaseSuccessfulRefListData | null,
          error: error instanceof Error ? error.message : "成功版本加载失败",
        })),
    ]);

    return {
      scripts: scriptData?.list || [],
      runs: runData?.list || [],
      releaseOptions: releaseOptionsResult.data,
      releaseRuns: releaseRunsResult.data?.list || [],
      releaseSuccessfulRefs: releaseSuccessfulRefsResult.data?.list || [],
      pagination: runData?.pagination || { page, pageSize: OPS_RUNS_PAGE_SIZE, total: 0, totalPages: 0 },
      error: null,
      releaseError: releaseOptionsResult.error || releaseRunsResult.error || releaseSuccessfulRefsResult.error,
    };
  } catch (error) {
    return {
      scripts: [] as OpsScript[],
      runs: [] as OpsScriptRun[],
      releaseOptions: null as ReleaseOptionsData | null,
      releaseRuns: [] as ReleaseRun[],
      releaseSuccessfulRefs: [] as ReleaseSuccessfulRef[],
      pagination: { page, pageSize: OPS_RUNS_PAGE_SIZE, total: 0, totalPages: 0 },
      error: error instanceof Error ? error.message : "运维脚本加载失败",
      releaseError: error instanceof Error ? error.message : "发布信息加载失败",
    };
  }
}

export default async function OpsPage({
  searchParams,
}: {
  searchParams: Promise<OpsPageSearchParams>;
}) {
  const params = await searchParams;
  const { scripts, runs, releaseOptions, releaseRuns, releaseSuccessfulRefs, pagination, error, releaseError } = await getOpsData(params);
  const successCount = runs.filter((item) => item.status === "success").length;
  const failedCount = runs.filter((item) => item.status === "failed" || item.status === "timeout").length;

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-normal">运维脚本</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          聚合资源状态、微服务健康、白名单脚本和执行记录，平台运维动作保持可审计。
        </p>
      </div>

      <Tabs defaultValue="health" className="flex flex-col gap-3">
        <TabsList className="w-full justify-start overflow-x-auto">
          <TabsTrigger value="health">健康监控</TabsTrigger>
          <TabsTrigger value="scripts">
            脚本执行
            <span className="ml-2 text-xs text-muted-foreground">{scripts.length}</span>
          </TabsTrigger>
          <TabsTrigger value="runs">
            执行记录
            <span className="ml-2 text-xs text-muted-foreground">{successCount}/{failedCount}</span>
          </TabsTrigger>
          <TabsTrigger value="releases">
            版本发布
            <span className="ml-2 text-xs text-muted-foreground">{releaseRuns.length}</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="health" className="mt-0 flex flex-col gap-3">
          <SystemMetricsPanel />
          <ServiceHealthPanel />
        </TabsContent>

        <TabsContent value="scripts" className="mt-0 flex flex-col gap-3">
          {error ? <StatusAlert>{error}</StatusAlert> : null}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold">白名单脚本</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                仅保留后端白名单命令，所有执行都会写入审计记录。
              </p>
            </div>
            <Badge variant="outline">{scripts.length} 个脚本</Badge>
          </div>

          <div className="grid gap-3 lg:grid-cols-2">
            {scripts.map((script) => (
              <Card key={script.key}>
                <CardHeader className="flex flex-row items-start justify-between gap-3 pb-2">
                  <div>
                    <CardTitle className="text-base">{script.label}</CardTitle>
                    <p className="mt-1 text-sm text-muted-foreground">{script.description}</p>
                  </div>
                  <Badge variant={script.danger_level === "medium" ? "warning" : "outline"}>
                    {script.danger_level === "medium" ? "会发送通知" : "低风险"}
                  </Badge>
                </CardHeader>
                <CardContent className="flex items-center justify-between gap-3">
                  <div className="text-xs text-muted-foreground">
                    超时限制 {Math.round(script.timeout_ms / 1000)} 秒
                  </div>
                  <RunOpsScriptButton script={script} />
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="runs" className="mt-0 flex flex-col gap-3">
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
        </TabsContent>

        <TabsContent value="releases" className="mt-0">
          <ReleaseDeploymentsPanel
            options={releaseOptions}
            runs={releaseRuns}
            successfulRefs={releaseSuccessfulRefs}
            error={releaseError}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
