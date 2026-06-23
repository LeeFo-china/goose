"use client";

import { useEffect, useState } from "react";
import { CalendarClock } from "lucide-react";
import { StatusAlert } from "@/components/admin/status-alert";
import type {
  FinanceReceivableListData,
  FinanceReceivableRecord,
  FinanceReceivableSummary,
} from "@/components/finance/finance-requests";
import {
  formatFinanceDate,
  formatFinanceMoney,
} from "@/components/finance/finance-ledger-utils";
import { Badge } from "@/components/ui/badge";
import { requestProject } from "@/components/projects/project-mutation-utils";

const emptySummary: FinanceReceivableSummary = {
  contract_amount: 0,
  receivable_amount: 0,
  paid_amount: 0,
  remaining_amount: 0,
  overdue_amount: 0,
  overdue_count: 0,
};

function statusLabel(row: FinanceReceivableRecord) {
  if (row.status === "paid") return "已收";
  if (row.status === "overdue") return "逾期";
  if (row.status === "partially_paid") return "部分收款";
  if (row.status === "canceled") return "已取消";
  return "待收";
}

function statusVariant(row: FinanceReceivableRecord) {
  if (row.status === "paid") return "success" as const;
  if (row.status === "overdue") return "danger" as const;
  if (row.status === "partially_paid") return "warning" as const;
  if (row.status === "canceled") return "outline" as const;
  return "secondary" as const;
}

export function ProjectFinanceReceivableSummaryPanel({
  projectId,
}: {
  projectId: string;
}) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [data, setData] = useState<FinanceReceivableListData>({
    list: [],
    pagination: { page: 1, pageSize: 5, total: 0, totalPages: 0 },
    summary: emptySummary,
  });
  const summary = data.summary || emptySummary;

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    requestProject<FinanceReceivableListData>({
      path: `/projects/${projectId}/receivables?page=1&pageSize=5`,
      signal: controller.signal,
    })
      .then((payload) => {
        setData({
          list: payload.list || [],
          pagination: payload.pagination || {
            page: 1,
            pageSize: 5,
            total: 0,
            totalPages: 0,
          },
          summary: payload.summary || emptySummary,
        });
      })
      .catch((err) => {
        if (controller.signal.aborted) return;
        setError(err instanceof Error ? err.message : "项目应收摘要加载失败");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [projectId]);

  return (
    <section className="rounded-lg border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <CalendarClock className="size-4 text-muted-foreground" />
          <h3 className="text-base font-semibold">应收摘要</h3>
        </div>
        <Badge variant="outline" className="tabular-nums">
          共 {data.pagination.total} 条
        </Badge>
      </div>

      {error ? <div className="mt-3"><StatusAlert>{error}</StatusAlert></div> : null}

      <dl className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <Metric label="合同金额" value={formatFinanceMoney(summary.contract_amount)} />
        <Metric label="应收金额" value={formatFinanceMoney(summary.receivable_amount)} />
        <Metric label="已收金额" value={formatFinanceMoney(summary.paid_amount)} />
        <Metric label="未收金额" value={formatFinanceMoney(summary.remaining_amount)} />
        <Metric
          label="逾期"
          value={`${formatFinanceMoney(summary.overdue_amount)} / ${summary.overdue_count} 笔`}
        />
      </dl>

      <div className="mt-4 overflow-x-auto rounded-md border">
        <div className="min-w-[560px]">
        <div className="grid grid-cols-[minmax(0,1fr)_7rem_7rem_6rem] gap-3 border-b bg-muted/60 px-3 py-2 text-xs font-medium text-muted-foreground">
          <span>应收事项</span>
          <span className="text-right">未收</span>
          <span>应收日期</span>
          <span>状态</span>
        </div>
        {loading ? (
          <div className="px-3 py-5 text-sm text-muted-foreground">正在加载应收计划...</div>
        ) : data.list.length ? (
          data.list.map((row) => (
            <div
              key={row.id}
              className="grid grid-cols-[minmax(0,1fr)_7rem_7rem_6rem] gap-3 border-b px-3 py-2 text-sm last:border-b-0"
            >
              <span className="truncate font-medium">{row.title}</span>
              <span className="text-right tabular-nums">
                {formatFinanceMoney(row.remaining_amount)}
              </span>
              <span className="text-muted-foreground tabular-nums">
                {formatFinanceDate(row.due_date)}
              </span>
              <span>
                <Badge variant={statusVariant(row)}>{statusLabel(row)}</Badge>
              </span>
            </div>
          ))
        ) : (
          <div className="px-3 py-5 text-sm text-muted-foreground">
            暂无应收计划。
          </div>
        )}
        </div>
      </div>
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
