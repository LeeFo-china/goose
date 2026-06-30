import { Clock3, ListChecks, Tags } from "lucide-react";
import type {
  FinanceReconciliationOperatingStatsData,
} from "@/components/finance/finance-reconciliation-requests";
import {
  financeReconciliationActionLabel,
  financeReconciliationStatusMeta,
} from "@/components/finance/finance-reconciliation-utils";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  formatFinanceDateTime,
  formatFinanceMoney,
} from "./finance-ledger-utils";

export function FinanceReconciliationOperatingStatsPanel({
  stats,
}: {
  stats: FinanceReconciliationOperatingStatsData;
}) {
  return (
    <div className="grid shrink-0 gap-3 xl:grid-cols-3">
      <Card className="shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between gap-3 p-3 pb-1.5">
          <CardTitle className="text-sm">状态分布</CardTitle>
          <ListChecks aria-hidden="true" className="size-4 text-muted-foreground" />
        </CardHeader>
        <CardContent className="space-y-2 p-3 pt-1.5">
          {stats.by_status.map((item) => {
            const meta = financeReconciliationStatusMeta(item.key);
            return (
              <div key={item.key} className="flex items-center justify-between gap-3">
                <Badge variant={meta.variant}>{item.label}</Badge>
                <span className="text-sm font-medium tabular-nums">
                  {item.count} 条
                </span>
              </div>
            );
          })}
          <div className="border-t pt-2 text-xs text-muted-foreground">
            最近异常 {formatFinanceDateTime(stats.summary.latest_exception_at)}
          </div>
        </CardContent>
      </Card>

      <Card className="shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between gap-3 p-3 pb-1.5">
          <CardTitle className="text-sm">异常类型</CardTitle>
          <Tags aria-hidden="true" className="size-4 text-muted-foreground" />
        </CardHeader>
        <CardContent className="space-y-2 p-3 pt-1.5">
          {stats.by_exception_code.length ? (
            stats.by_exception_code.slice(0, 5).map((item) => (
              <div key={item.key} className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium">{item.label}</div>
                  <div className="text-xs text-muted-foreground">
                    {formatFinanceMoney(item.amount)}
                  </div>
                </div>
                <Badge variant="outline" className="shrink-0 tabular-nums">
                  {item.count} 条
                </Badge>
              </div>
            ))
          ) : (
            <div className="text-sm text-muted-foreground">暂无异常类型</div>
          )}
        </CardContent>
      </Card>

      <Card className="shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between gap-3 p-3 pb-1.5">
          <CardTitle className="text-sm">最近处理</CardTitle>
          <Clock3 aria-hidden="true" className="size-4 text-muted-foreground" />
        </CardHeader>
        <CardContent className="space-y-2 p-3 pt-1.5">
          {stats.recent_actions.length ? (
            stats.recent_actions.map((item) => {
              const statusMeta = financeReconciliationStatusMeta(item.status);
              return (
                <div
                  key={item.exception_fingerprint}
                  className="border-b pb-2 last:border-0 last:pb-0"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0 truncate text-sm font-medium">
                      {item.project_name || item.project_id || item.title}
                    </div>
                    <Badge variant={statusMeta.variant} className="shrink-0">
                      {statusMeta.label}
                    </Badge>
                  </div>
                  <div className="mt-1 truncate text-xs text-muted-foreground">
                    {[
                      item.actor_employee_name,
                      financeReconciliationActionLabel(item.action),
                      formatFinanceDateTime(item.acted_at),
                    ].filter(Boolean).join(" · ")}
                  </div>
                  {item.remark ? (
                    <div className="mt-1 truncate text-xs text-muted-foreground">
                      {item.remark}
                    </div>
                  ) : null}
                </div>
              );
            })
          ) : (
            <div className="text-sm text-muted-foreground">暂无处理记录</div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
