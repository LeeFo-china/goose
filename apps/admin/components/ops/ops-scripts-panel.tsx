import { Clock3, ShieldAlert, TerminalSquare } from "lucide-react";
import { StatusAlert } from "@/components/admin/status-alert";
import { RunOpsScriptButton } from "@/components/ops/ops-actions";
import type { OpsScript, OpsScriptRun } from "@/components/ops/ops-types";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const statusMeta: Record<OpsScriptRun["status"], {
  label: string;
  variant: "success" | "warning" | "danger";
}> = {
  running: { label: "运行中", variant: "warning" },
  success: { label: "成功", variant: "success" },
  failed: { label: "失败", variant: "danger" },
  timeout: { label: "超时", variant: "danger" },
};

function formatDateTime(value: string | null | undefined) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function durationLabel(value: number) {
  const seconds = Math.round(value / 1000);
  if (seconds < 60) return `${seconds}s`;
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

function runDurationLabel(value: number | null) {
  if (value === null) return "-";
  if (value < 1000) return `${value}ms`;
  return `${(value / 1000).toFixed(1)}s`;
}

function executorName(run: OpsScriptRun) {
  return run.executed_by?.name || run.executed_by?.phone || "-";
}

export function OpsScriptsPanel({
  scripts,
  recentRuns,
  error,
}: {
  scripts: OpsScript[];
  recentRuns: OpsScriptRun[];
  error?: string | null;
}) {
  const latestRuns = recentRuns.slice(0, 5);

  return (
    <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_360px]">
      <Card>
        <CardHeader className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <TerminalSquare data-icon="inline-start" />
              白名单脚本
            </CardTitle>
            <CardDescription>集中执行低频运维动作，保留审计记录。</CardDescription>
          </div>
          <Badge variant="outline">{scripts.length} 个脚本</Badge>
        </CardHeader>
        <CardContent className="p-0">
          {error ? <div className="px-4 pb-4"><StatusAlert>{error}</StatusAlert></div> : null}
          <div className="overflow-x-auto">
            <Table className="min-w-[760px] border-t">
              <TableHeader className="bg-muted/60">
                <TableRow className="hover:bg-transparent">
                  <TableHead>脚本</TableHead>
                  <TableHead className="whitespace-nowrap">风险</TableHead>
                  <TableHead className="whitespace-nowrap">超时</TableHead>
                  <TableHead className="w-[120px] text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {scripts.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="h-32">
                      <Empty className="border-0 p-4">
                        <EmptyHeader>
                          <EmptyTitle>暂无脚本</EmptyTitle>
                          <EmptyDescription>后端白名单脚本为空。</EmptyDescription>
                        </EmptyHeader>
                      </Empty>
                    </TableCell>
                  </TableRow>
                ) : scripts.map((script) => (
                  <TableRow key={script.key}>
                    <TableCell>
                      <div className="min-w-0">
                        <div className="truncate font-medium">{script.label}</div>
                        <div className="mt-1 line-clamp-2 max-w-[560px] text-xs text-muted-foreground">
                          {script.description}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      <Badge variant={script.danger_level === "medium" ? "warning" : "outline"}>
                        {script.danger_level === "medium" ? "会发送通知" : "低风险"}
                      </Badge>
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                      {durationLabel(script.timeout_ms)}
                    </TableCell>
                    <TableCell className="text-right">
                      <RunOpsScriptButton script={script} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Clock3 data-icon="inline-start" />
            最近执行
          </CardTitle>
          <CardDescription>快速判断脚本执行后的结果状态。</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {latestRuns.length === 0 ? (
            <Empty className="rounded-md border border-dashed p-6">
              <EmptyHeader>
                <EmptyTitle>暂无记录</EmptyTitle>
                <EmptyDescription>还没有脚本执行记录。</EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : latestRuns.map((run) => {
            const meta = statusMeta[run.status] || statusMeta.failed;

            return (
              <div key={run.id} className="flex items-start justify-between gap-3 border-b py-2 last:border-b-0">
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium">{run.script_label}</div>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <span>{formatDateTime(run.created_at)}</span>
                    <span>{runDurationLabel(run.duration_ms)}</span>
                    <span>{executorName(run)}</span>
                  </div>
                </div>
                <Badge variant={meta.variant}>{meta.label}</Badge>
              </div>
            );
          })}
          {latestRuns.some((run) => run.status === "failed" || run.status === "timeout") ? (
            <div className="mt-1 flex items-center gap-2 rounded-md border px-3 py-2 text-xs text-muted-foreground">
              <ShieldAlert data-icon="inline-start" />
              最近存在失败或超时记录
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
