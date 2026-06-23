"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { LineChart } from "lucide-react";
import { StatusAlert } from "@/components/admin/status-alert";
import type { FinanceProjectOperatingSummary } from "@/components/finance/finance-requests";
import {
  formatFinanceMoney,
  formatFinancePercent,
} from "@/components/finance/finance-ledger-utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { requestProject } from "@/components/projects/project-mutation-utils";

export function ProjectFinanceOperatingSummaryPanel({
  projectId,
  refreshVersion = 0,
}: {
  projectId: string;
  refreshVersion?: number;
}) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [data, setData] = useState<FinanceProjectOperatingSummary | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    requestProject<FinanceProjectOperatingSummary>({
      path: `/projects/${projectId}/finance-summary`,
      signal: controller.signal,
    })
      .then((payload) => {
        setData(payload);
      })
      .catch((err) => {
        if (controller.signal.aborted) return;
        setError(err instanceof Error ? err.message : "经营财务摘要加载失败");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [projectId, refreshVersion]);

  const summary = data || emptySummary(projectId);
  const overdueText = summary.overdue_count > 0
    ? `${formatFinanceMoney(summary.overdue_amount)} / ${summary.overdue_count} 笔`
    : "无逾期";

  return (
    <section className="rounded-lg border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <LineChart className="size-4 text-muted-foreground" />
          <h3 className="text-base font-semibold">经营财务摘要</h3>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" className="tabular-nums">
            {summary.ledger_entry_count} 条流水
          </Badge>
          <Button asChild type="button" variant="outline" size="sm">
            <Link href={`/finance/receivables?project_id=${projectId}`}>
              查看应收
            </Link>
          </Button>
        </div>
      </div>

      {error ? (
        <div className="mt-3">
          <StatusAlert>{error}</StatusAlert>
        </div>
      ) : null}

      <dl className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric
          label="合同金额"
          value={loading ? "加载中..." : formatFinanceMoney(summary.contract_amount)}
        />
        <Metric
          label="已收金额"
          value={loading ? "加载中..." : formatFinanceMoney(summary.received_amount)}
        />
        <Metric
          label="待收金额"
          value={loading
            ? "加载中..."
            : formatFinanceMoney(summary.receivable_remaining_amount)}
        />
        <Metric
          label="已付支出"
          value={loading ? "加载中..." : formatFinanceMoney(summary.expense_paid_amount)}
        />
        <Metric
          label="实际利润"
          value={loading ? "加载中..." : formatFinanceMoney(summary.actual_profit_amount)}
        />
        <Metric
          label="实际毛利率"
          value={loading ? "加载中..." : formatFinancePercent(summary.actual_gross_margin)}
        />
        <Metric
          label="预测利润"
          value={loading ? "加载中..." : formatFinanceMoney(summary.projected_profit_amount)}
        />
        <Metric label="逾期应收" value={loading ? "加载中..." : overdueText} />
      </dl>
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border bg-background px-3 py-2">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-1 truncate text-sm font-semibold tabular-nums">{value}</dd>
    </div>
  );
}

function emptySummary(projectId: string): FinanceProjectOperatingSummary {
  return {
    project_id: projectId,
    project_name: null,
    project_status: null,
    contract_amount: 0,
    receivable_amount: 0,
    received_amount: 0,
    receivable_remaining_amount: 0,
    overdue_amount: 0,
    overdue_count: 0,
    expense_paid_amount: 0,
    actual_profit_amount: 0,
    projected_profit_amount: 0,
    net_cash_flow_amount: 0,
    actual_gross_margin: null,
    projected_gross_margin: null,
    ledger_entry_count: 0,
  };
}
