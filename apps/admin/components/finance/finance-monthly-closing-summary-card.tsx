import Link from "next/link";
import { FileSearch, History } from "lucide-react";
import { FinanceClosingActions } from "@/components/finance/finance-closing-actions";
import {
  buildFinanceMonthlyDifferenceSourcesSearchParams,
} from "@/components/finance/finance-difference-sources-utils";
import {
  financeClosingStatusLabel,
  financeClosingStatusVariant,
  financeSnapshotDifferenceLabel,
  financeSnapshotDifferenceVariant,
} from "@/components/finance/finance-operating-report-utils";
import {
  buildFinanceCorrectionAuditSearchParams,
} from "@/components/finance/finance-correction-audit-utils";
import {
  formatFinanceDateTime,
  formatFinanceMoney,
  formatFinancePercent,
} from "@/components/finance/finance-ledger-utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type {
  FinanceClosingPeriodRecord,
  FinanceMonthlyOverviewClosing,
  FinanceMonthlyOverviewSummary,
} from "./finance-operating-report-requests";

export function FinanceMonthlyClosingSummaryCard({
  month,
  closing,
  currentSummary,
  latestClosingPeriod,
}: {
  month: string;
  closing: FinanceMonthlyOverviewClosing;
  currentSummary: FinanceMonthlyOverviewSummary;
  latestClosingPeriod: FinanceClosingPeriodRecord | undefined;
}) {
  const snapshotSummary = closing.snapshot_summary;
  const realtimeSummary = closing.current_summary || currentSummary;
  const differenceSummary = closing.difference_summary;

  return (
    <Card className="shrink-0">
      <CardContent className="grid gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          <div>
            <div className="text-xs font-medium text-muted-foreground">结账状态</div>
            <div className="mt-1 flex items-center gap-2">
              <Badge variant={financeClosingStatusVariant(closing.status)}>
                {financeClosingStatusLabel(closing.status)}
              </Badge>
              <span className="text-sm text-muted-foreground">
                {closing.closed_at
                  ? `结账 ${formatFinanceDateTime(closing.closed_at)}`
                  : "尚未确认结账"}
              </span>
            </div>
          </div>
          <div>
            <div className="text-xs font-medium text-muted-foreground">快照毛利</div>
            <div className="mt-1 text-sm font-medium tabular-nums">
              {snapshotSummary?.gross_profit_amount !== undefined
                ? formatFinanceMoney(snapshotSummary.gross_profit_amount)
                : "-"}
            </div>
          </div>
          <div>
            <div className="text-xs font-medium text-muted-foreground">实时毛利</div>
            <div className="mt-1 text-sm font-medium tabular-nums">
              {formatFinanceMoney(realtimeSummary.gross_profit_amount)}
            </div>
            <div className="mt-1 text-xs text-muted-foreground tabular-nums">
              {formatFinancePercent(realtimeSummary.gross_profit_rate)}
            </div>
          </div>
          <div>
            <div className="text-xs font-medium text-muted-foreground">快照差异</div>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <Badge
                variant={financeSnapshotDifferenceVariant(
                  closing.has_snapshot_difference,
                )}
              >
                {financeSnapshotDifferenceLabel(closing.has_snapshot_difference)}
              </Badge>
              <span className="text-sm font-medium tabular-nums">
                {formatDifferenceMoney(differenceSummary?.gross_profit_amount)}
              </span>
            </div>
            <div className="mt-1 text-xs text-muted-foreground tabular-nums">
              收入 {formatDifferenceMoney(differenceSummary?.income_amount)}
              {" · "}
              支出 {formatDifferenceMoney(differenceSummary?.expense_amount)}
            </div>
          </div>
          <div>
            <div className="text-xs font-medium text-muted-foreground">最近记录</div>
            <div className="mt-1 text-sm text-muted-foreground">
              {latestClosingPeriod
                ? `${financeClosingStatusLabel(latestClosingPeriod.status)} · ${
                  formatFinanceDateTime(latestClosingPeriod.updated_at)
                }`
                : "暂无结账记录"}
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 lg:justify-end">
          <Button asChild variant="outline" size="sm">
            <Link
              href={month
                ? differenceSourcesHref(month)
                : "/finance/reports/difference-sources"}
              aria-disabled={!month}
            >
              <FileSearch data-icon="inline-start" />
              查看差异来源
            </Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link
              href={month ? correctionAuditHref(month) : "/finance/audits"}
              aria-disabled={!month}
            >
              <History data-icon="inline-start" />
              查看修正审计
            </Link>
          </Button>
          <FinanceClosingActions
            month={month}
            periodId={closing.id}
            status={closing.status}
          />
        </div>
      </CardContent>
    </Card>
  );
}

function differenceSourcesHref(month: string) {
  const params = buildFinanceMonthlyDifferenceSourcesSearchParams({
    page: 1,
    pageSize: 20,
    month,
  });
  return `/finance/reports/difference-sources?${params}`;
}

function correctionAuditHref(month: string) {
  const params = buildFinanceCorrectionAuditSearchParams({
    page: 1,
    pageSize: 20,
    month,
  });
  return `/finance/audits?${params}`;
}

function formatDifferenceMoney(value: number | null | undefined) {
  if (value === null || value === undefined) return "-";
  return value > 0 ? `+${formatFinanceMoney(value)}` : formatFinanceMoney(value);
}
