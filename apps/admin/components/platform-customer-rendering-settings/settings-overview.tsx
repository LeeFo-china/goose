import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { fenToYuan } from "./settings-form-data";
import type { TenantRenderingDailyUsage, TenantRenderingSettings } from "./settings-types";

function amount(fen: number | null) {
  return fen === null ? "未设置" : `¥${fenToYuan(fen)}`;
}

export function TenantRenderingSettingsOverview({ settings, usage }: {
  settings: TenantRenderingSettings;
  usage: TenantRenderingDailyUsage | null;
}) {
  const date = usage?.budget_date ?? "今日";
  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle>当前试点状态</CardTitle>
            <Badge variant={settings.enabled ? "success" : "secondary"}>
              {settings.enabled ? "已开启" : "未开启"}
            </Badge>
          </div>
          <CardDescription>
            客户生图任务按北京时间自然日计算额度。版本 {settings.version} · 最近修改：
            {settings.updated_at ? new Date(settings.updated_at).toLocaleString("zh-CN") : "尚未配置"}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-md border bg-muted/30 p-3">
            <div className="text-xs text-muted-foreground">每日任务上限</div>
            <div className="mt-1 text-lg font-semibold">{settings.daily_task_limit ?? "未设置"}</div>
          </div>
          <div className="rounded-md border bg-muted/30 p-3">
            <div className="text-xs text-muted-foreground">日预算</div>
            <div className="mt-1 text-lg font-semibold">{amount(settings.daily_budget_fen)}</div>
          </div>
          <div className="rounded-md border bg-muted/30 p-3">
            <div className="text-xs text-muted-foreground">单任务预占</div>
            <div className="mt-1 text-lg font-semibold">{amount(settings.per_job_reserve_fen)}</div>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>{date} 用量</CardTitle>
          <CardDescription>进行中任务按预占计入；完成后按实际费用计入。</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-md border bg-muted/30 p-3">
            <div className="text-xs text-muted-foreground">任务数</div>
            <div className="mt-1 text-lg font-semibold">
              {usage ? `${usage.task_count} / ${settings.daily_task_limit ?? "未设置"}` : "暂不可用"}
            </div>
          </div>
          <div className="rounded-md border bg-muted/30 p-3">
            <div className="text-xs text-muted-foreground">预算占用</div>
            <div className="mt-1 text-lg font-semibold">
              {usage ? `${amount(usage.budget_used_fen)} / ${amount(settings.daily_budget_fen)}` : "暂不可用"}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
