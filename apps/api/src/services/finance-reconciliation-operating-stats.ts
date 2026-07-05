import type {
  FinanceReconciliationAction,
  FinanceReconciliationExceptionCode,
  FinanceReconciliationLevel,
  FinanceReconciliationStatus,
} from "@/schema/finance-reconciliation";
import type {
  FinanceReconciliationException,
} from "@/services/finance-reconciliation-exceptions";

const STALE_OPEN_DAYS = [3, 7] as const;
const DAY_MS = 86_400_000;

export type FinanceReconciliationOperatingStats = {
  scope: {
    date_from: string;
    date_to: string;
    stale_days: typeof STALE_OPEN_DAYS;
  };
  summary: {
    total: number;
    danger: number;
    warning: number;
    info: number;
    open: number;
    acknowledged: number;
    ignored: number;
    resolved: number;
    total_amount: number;
    stale_open_over_3_days: number;
    stale_open_over_7_days: number;
    latest_exception_at: string | null;
    latest_action_at: string | null;
  };
  by_exception_code: Array<{
    key: FinanceReconciliationExceptionCode;
    label: string;
    count: number;
    amount: number;
  }>;
  by_status: Array<{
    key: FinanceReconciliationStatus;
    label: string;
    count: number;
  }>;
  by_level: Array<{
    key: FinanceReconciliationLevel;
    label: string;
    count: number;
  }>;
  recent_actions: Array<{
    exception_fingerprint: string;
    exception_code: FinanceReconciliationExceptionCode;
    title: string;
    project_id: string | null;
    project_name: string | null;
    status: FinanceReconciliationStatus;
    action: FinanceReconciliationAction | null;
    actor_employee_id: string | null;
    actor_employee_name: string | null;
    acted_at: string | null;
    remark: string | null;
  }>;
};

export function buildFinanceReconciliationOperatingStats(
  exceptions: FinanceReconciliationException[],
  range: { dateFrom: string; dateTo: string },
): FinanceReconciliationOperatingStats {
  const summary = summarize(exceptions);
  const statusCounts = countByStatus(exceptions);
  const latestAction = latestActionFromExceptions(exceptions);

  return {
    scope: {
      date_from: range.dateFrom,
      date_to: range.dateTo,
      stale_days: STALE_OPEN_DAYS,
    },
    summary: {
      ...summary,
      ...statusCounts,
      total_amount: roundStatsAmount(
        exceptions.reduce((total, item) => total + item.amount, 0),
      ),
      stale_open_over_3_days: countStaleOpenExceptions(
        exceptions,
        range.dateTo,
        3,
      ),
      stale_open_over_7_days: countStaleOpenExceptions(
        exceptions,
        range.dateTo,
        7,
      ),
      latest_exception_at: exceptions[0]?.occurred_at ?? null,
      latest_action_at: latestAction?.last_action_at ?? null,
    },
    by_exception_code: countByExceptionCode(exceptions),
    by_status: [
      {
        key: "open",
        label: reconciliationStatusLabel("open"),
        count: statusCounts.open,
      },
      {
        key: "acknowledged",
        label: reconciliationStatusLabel("acknowledged"),
        count: statusCounts.acknowledged,
      },
      {
        key: "ignored",
        label: reconciliationStatusLabel("ignored"),
        count: statusCounts.ignored,
      },
      {
        key: "resolved",
        label: reconciliationStatusLabel("resolved"),
        count: statusCounts.resolved,
      },
    ],
    by_level: [
      {
        key: "danger",
        label: reconciliationLevelLabel("danger"),
        count: summary.danger,
      },
      {
        key: "warning",
        label: reconciliationLevelLabel("warning"),
        count: summary.warning,
      },
      { key: "info", label: reconciliationLevelLabel("info"), count: summary.info },
    ],
    recent_actions: buildRecentActions(exceptions),
  };
}

function summarize(exceptions: FinanceReconciliationException[]) {
  return exceptions.reduce(
    (summary, item) => {
      summary.total += 1;
      summary[item.level] += 1;
      return summary;
    },
    { total: 0, danger: 0, warning: 0, info: 0 },
  );
}

function countByStatus(exceptions: FinanceReconciliationException[]) {
  return exceptions.reduce(
    (summary, item) => {
      summary[item.status] += 1;
      return summary;
    },
    {
      open: 0,
      acknowledged: 0,
      ignored: 0,
      resolved: 0,
    } satisfies Record<FinanceReconciliationStatus, number>,
  );
}

function countByExceptionCode(exceptions: FinanceReconciliationException[]) {
  const counts = new Map<
    FinanceReconciliationExceptionCode,
    { count: number; amount: number }
  >();
  for (const item of exceptions) {
    const previous = counts.get(item.exception_code) ?? { count: 0, amount: 0 };
    counts.set(item.exception_code, {
      count: previous.count + 1,
      amount: previous.amount + item.amount,
    });
  }

  return Array.from(counts.entries())
    .map(([key, value]) => ({
      key,
      label: reconciliationExceptionLabel(key),
      count: value.count,
      amount: roundStatsAmount(value.amount),
    }))
    .sort((left, right) =>
      right.count - left.count ||
      right.amount - left.amount ||
      left.label.localeCompare(right.label, "zh-CN")
    );
}

function buildRecentActions(exceptions: FinanceReconciliationException[]) {
  return exceptions
    .filter((item) => item.last_action_at)
    .sort((left, right) =>
      Date.parse(right.last_action_at || "") -
      Date.parse(left.last_action_at || "")
    )
    .slice(0, 5)
    .map((item) => ({
      exception_fingerprint: item.exception_fingerprint,
      exception_code: item.exception_code,
      title: item.title,
      project_id: item.project_id,
      project_name: item.project_name,
      status: item.status,
      action: item.last_action,
      actor_employee_id: item.last_actor_employee_id,
      actor_employee_name: item.last_actor_employee_name,
      acted_at: item.last_action_at,
      remark: item.last_action_remark,
    }));
}

function countStaleOpenExceptions(
  exceptions: FinanceReconciliationException[],
  dateTo: string,
  days: number,
) {
  return exceptions.filter((item) =>
    item.status === "open" &&
    ageInDays(item.occurred_at, dateTo) >= days
  ).length;
}

function ageInDays(occurredAt: string, dateTo: string) {
  const occurredAtDay = occurredAt.slice(0, 10);
  const occurredAtTime = Date.parse(`${occurredAtDay}T00:00:00.000Z`);
  const dateToTime = Date.parse(`${dateTo}T00:00:00.000Z`);
  if (!Number.isFinite(occurredAtTime) || !Number.isFinite(dateToTime)) return 0;
  return Math.max(0, Math.floor((dateToTime - occurredAtTime) / DAY_MS));
}

function latestActionFromExceptions(exceptions: FinanceReconciliationException[]) {
  return exceptions
    .filter((item) => item.last_action_at)
    .sort((left, right) =>
      Date.parse(right.last_action_at || "") -
      Date.parse(left.last_action_at || "")
    )[0] ?? null;
}

function reconciliationExceptionLabel(code: FinanceReconciliationExceptionCode) {
  if (code === "receivable_overdue") return "应收逾期";
  if (code === "payment_without_ledger") return "收款未入账";
  if (code === "ledger_without_payment") return "流水缺收款关联";
  if (code === "payment_unallocated") return "收款未核销";
  if (code === "allocation_amount_mismatch") return "核销金额不一致";
  return "应收已收不一致";
}

function reconciliationStatusLabel(status: FinanceReconciliationStatus) {
  if (status === "open") return "未处理";
  if (status === "acknowledged") return "已确认";
  if (status === "ignored") return "已忽略";
  return "人工闭环";
}

function reconciliationLevelLabel(level: FinanceReconciliationLevel) {
  if (level === "danger") return "高风险";
  if (level === "warning") return "预警";
  return "提示";
}

function roundStatsAmount(value: number) {
  return Math.round(value * 100) / 100;
}
