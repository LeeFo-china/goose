import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { fenToYuan } from "./settings-form-data";
import type { TenantRenderingAuditPage } from "./settings-types";

type AuditMetadata = { reason?: unknown; previous?: unknown; current?: unknown };

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown> : null;
}

function summarizeSetting(value: unknown): string {
  const setting = asRecord(value);
  if (!setting) return "未配置";
  const enabled = setting.enabled === true ? "开启" : "关闭";
  const tasks = typeof setting.daily_task_limit === "number" ? `${setting.daily_task_limit} 次` : "未设置";
  const budget = typeof setting.daily_budget_fen === "number"
    && Number.isSafeInteger(setting.daily_budget_fen) && setting.daily_budget_fen >= 0
    ? `¥${fenToYuan(setting.daily_budget_fen)}` : "未设置";
  const reserve = typeof setting.per_job_reserve_fen === "number"
    && Number.isSafeInteger(setting.per_job_reserve_fen) && setting.per_job_reserve_fen >= 0
    ? `¥${fenToYuan(setting.per_job_reserve_fen)}` : "未设置";
  return `${enabled} · 每日 ${tasks} · 预算 ${budget} · 单任务预占 ${reserve}`;
}

export function TenantRenderingSettingsAudit({ data }: { data: TenantRenderingAuditPage }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>最近修改</CardTitle>
        <CardDescription>仅显示该租户最近 10 条额度变更；共 {data.pagination.total} 条。</CardDescription>
      </CardHeader>
      <CardContent>
        {data.list.length === 0 ? (
          <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">暂无额度修改记录。</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader><TableRow>
                <TableHead>时间 / 操作人</TableHead><TableHead>操作原因</TableHead>
                <TableHead>变更前</TableHead><TableHead>变更后</TableHead>
              </TableRow></TableHeader>
              <TableBody>{data.list.map((record) => {
                const metadata = asRecord(record.metadata) as AuditMetadata | null;
                const date = new Date(record.created_at);
                const time = Number.isNaN(date.getTime()) ? "-" : date.toLocaleString("zh-CN");
                return <TableRow key={record.id}>
                  <TableCell className="align-top whitespace-nowrap">
                    <div>{time}</div>
                    <div className="text-xs text-muted-foreground">{record.actor_employee?.name || "未知操作人"}</div>
                  </TableCell>
                  <TableCell className="align-top max-w-48 whitespace-normal break-words">
                    {typeof metadata?.reason === "string" ? metadata.reason : "-"}
                  </TableCell>
                  <TableCell className="align-top min-w-52 whitespace-normal">{summarizeSetting(metadata?.previous)}</TableCell>
                  <TableCell className="align-top min-w-52 whitespace-normal">{summarizeSetting(metadata?.current)}</TableCell>
                </TableRow>;
              })}</TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
