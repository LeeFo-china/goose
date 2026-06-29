"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { BadgeCheck, RefreshCw } from "lucide-react";
import { StatusAlert } from "@/components/admin/status-alert";
import {
  formatFinanceDateTime,
  formatFinanceMoney,
} from "@/components/finance/finance-ledger-utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { requestProject } from "@/components/projects/project-mutation-utils";
import {
  buildProjectReconciliationExceptionHref,
  buildProjectReconciliationChecks,
  projectReconciliationStatusLabel,
  projectReconciliationStatusVariant,
  type ProjectFinanceReconciliationSummary,
  type ProjectReconciliationCheckItem,
} from "./project-finance-reconciliation-summary-utils";

function emptySummary(projectId: string): ProjectFinanceReconciliationSummary {
  return {
    project_id: projectId,
    receivable_amount: 0,
    received_amount: 0,
    allocated_amount: 0,
    ledger_income_amount: 0,
    expense_paid_amount: 0,
    ledger_expense_amount: 0,
    exception_count: 0,
    danger_count: 0,
    warning_count: 0,
    open_exception_count: 0,
    acknowledged_exception_count: 0,
    ignored_exception_count: 0,
    resolved_exception_count: 0,
    latest_exception_at: null,
    latest_action_at: null,
    latest_action_remark: null,
    latest_actor_employee_name: null,
  };
}

export function ProjectFinanceReconciliationSummaryPanel({
  projectId,
  refreshVersion = 0,
}: {
  projectId: string;
  refreshVersion?: number;
}) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [data, setData] = useState<ProjectFinanceReconciliationSummary | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    requestProject<ProjectFinanceReconciliationSummary>({
      path: `/finance/reconciliation/project/${projectId}`,
      signal: controller.signal,
    })
      .then((payload) => {
        setData(payload);
      })
      .catch((err) => {
        if (controller.signal.aborted) return;
        setError(err instanceof Error ? err.message : "项目对账摘要加载失败");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [projectId, refreshVersion]);

  const summary = data || emptySummary(projectId);
  const checks = buildProjectReconciliationChecks(summary);
  const worstStatus = checks.some((item) => item.status === "danger")
    ? "danger"
    : checks.some((item) => item.status === "warning")
      ? "warning"
      : "success";

  return (
    <section className="rounded-md border bg-card px-4 py-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <BadgeCheck className="size-4 text-muted-foreground" />
          <h3 className="text-base font-semibold">对账摘要</h3>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={projectReconciliationStatusVariant(worstStatus)}>
            {loading ? "加载中" : projectReconciliationStatusLabel(worstStatus)}
          </Badge>
          <Button asChild type="button" variant="outline" size="sm">
            <Link href={buildProjectReconciliationExceptionHref(projectId)}>
              查看异常
            </Link>
          </Button>
        </div>
      </div>

      {error ? (
        <div className="mt-3">
          <StatusAlert>{error}</StatusAlert>
        </div>
      ) : null}

      <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {checks.map((item) => (
          <ReconciliationCheckCard
            key={item.key}
            item={item}
            loading={loading}
          />
        ))}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <RefreshCw className="size-3.5" />
        <span>
          最近异常：{formatFinanceDateTime(summary.latest_exception_at)}
        </span>
        <span>应收总额：{formatFinanceMoney(summary.receivable_amount)}</span>
        <span>
          最近处理：{summary.latest_action_at
            ? `${formatFinanceDateTime(summary.latest_action_at)} · ${
              summary.latest_actor_employee_name || "未知处理人"
            }`
            : "-"}
        </span>
        {summary.latest_action_remark ? (
          <span className="truncate">
            备注：{summary.latest_action_remark}
          </span>
        ) : null}
      </div>
    </section>
  );
}

function ReconciliationCheckCard({
  item,
  loading,
}: {
  item: ProjectReconciliationCheckItem;
  loading: boolean;
}) {
  return (
    <div className="min-w-0 rounded-md border bg-background px-3 py-2">
      <div className="flex items-center justify-between gap-2">
        <div className="truncate text-xs font-medium text-muted-foreground">
          {item.label}
        </div>
        <Badge variant={projectReconciliationStatusVariant(item.status)}>
          {loading ? "..." : projectReconciliationStatusLabel(item.status)}
        </Badge>
      </div>
      <div className="mt-2 truncate text-sm font-semibold tabular-nums">
        {item.key === "exceptions"
          ? `${item.primary} 条`
          : formatFinanceMoney(item.primary)}
      </div>
      <div className="mt-1 truncate text-xs text-muted-foreground">
        {item.key === "exceptions"
          ? item.helper
          : `${item.helper} / 对账 ${formatFinanceMoney(item.secondary)}`}
      </div>
    </div>
  );
}
