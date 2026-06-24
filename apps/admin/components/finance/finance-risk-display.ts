import type {
  FinanceProjectRiskLevel,
  FinanceProjectRiskReason,
} from "@/components/finance/finance-requests";

export function financeRiskLabel(level: FinanceProjectRiskLevel): string {
  if (level === "danger") return "高风险";
  if (level === "warning") return "预警";
  if (level === "info") return "待处理";
  return "正常";
}

export function financeRiskVariant(
  level: FinanceProjectRiskLevel,
): "success" | "secondary" | "warning" | "danger" {
  if (level === "danger") return "danger";
  if (level === "warning") return "warning";
  if (level === "info") return "secondary";
  return "success";
}

export function summarizeFinanceRiskReasons(
  reasons: Array<Pick<FinanceProjectRiskReason, "code" | "title">>,
): string {
  const titles = reasons
    .map((reason) => reason.title)
    .filter(Boolean);
  if (titles.length <= 2) return titles.join("、");
  return `${titles.slice(0, 2).join("、")} +${titles.length - 2}`;
}

export function financeRiskActionHref(action: {
  key: string;
  label?: string;
  target: string;
} | null | undefined): string | null {
  if (!action) return null;
  if (
    action.key === "open_cost_budget" ||
    action.key === "open_unallocated_ledger" ||
    action.key === "open_receivables" ||
    action.key === "open_project_finance"
  ) {
    return action.target;
  }
  return null;
}
