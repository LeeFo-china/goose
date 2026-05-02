import { Activity, ShieldCheck, TerminalSquare } from "lucide-react";
import { StatusAlert } from "@/components/admin/status-alert";
import { OpsRunsPagination } from "@/components/ops/ops-list-actions";
import { RunOpsScriptButton } from "@/components/ops/ops-actions";
import { OpsRunsTable } from "@/components/ops/ops-runs-table";
import { SystemMetricsPanel } from "@/components/ops/system-metrics-panel";
import type {
  OpsScript,
  OpsScriptRun,
  Pagination,
} from "@/components/ops/ops-types";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
      pagination: { page, pageSize: OPS_RUNS_PAGE_SIZE, total: 0, totalPages: 0 },
      error: "缺少登录凭证",
    };
  }

  try {
    const query = new URLSearchParams({
      page: String(page),
      pageSize: String(OPS_RUNS_PAGE_SIZE),
    });
    const [scriptData, runData] = await Promise.all([
      fetchBackendData<ScriptListData>(token, "/admin/ops/scripts"),
      fetchBackendData<RunListData>(token, `/admin/ops/script-runs?${query}`),
    ]);

    return {
      scripts: scriptData?.list || [],
      runs: runData?.list || [],
      pagination: runData?.pagination || { page, pageSize: OPS_RUNS_PAGE_SIZE, total: 0, totalPages: 0 },
      error: null,
    };
  } catch (error) {
    return {
      scripts: [] as OpsScript[],
      runs: [] as OpsScriptRun[],
      pagination: { page, pageSize: OPS_RUNS_PAGE_SIZE, total: 0, totalPages: 0 },
      error: error instanceof Error ? error.message : "运维脚本加载失败",
    };
  }
}

export default async function OpsPage({
  searchParams,
}: {
  searchParams: Promise<OpsPageSearchParams>;
}) {
  const params = await searchParams;
  const { scripts, runs, pagination, error } = await getOpsData(params);
  const successCount = runs.filter((item) => item.status === "success").length;
  const failedCount = runs.filter((item) => item.status === "failed" || item.status === "timeout").length;

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-normal">运维脚本</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          仅允许执行后端白名单脚本，用于健康检查、PM2 状态、部署 trace 和通知测试。
        </p>
      </div>

      <SystemMetricsPanel />

      <div className="grid gap-3 md:grid-cols-3">
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex size-10 items-center justify-center rounded-md bg-accent text-accent-foreground">
              <TerminalSquare className="size-5" />
            </div>
            <div>
              <div className="text-sm text-muted-foreground">白名单脚本</div>
              <div className="text-xl font-semibold">{scripts.length}</div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex size-10 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <ShieldCheck className="size-5" />
            </div>
            <div>
              <div className="text-sm text-muted-foreground">最近成功</div>
              <div className="text-xl font-semibold">{successCount}</div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="flex size-10 items-center justify-center rounded-md bg-warning text-warning-foreground">
              <Activity className="size-5" />
            </div>
            <div>
              <div className="text-sm text-muted-foreground">最近异常</div>
              <div className="text-xl font-semibold">{failedCount}</div>
            </div>
          </CardContent>
        </Card>
      </div>

      {error ? <StatusAlert>{error}</StatusAlert> : null}

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

      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground">
          每页 {pagination.pageSize} 条，共 {pagination.total} 条
        </div>
        <OpsRunsPagination pagination={pagination} />
      </div>
    </div>
  );
}
