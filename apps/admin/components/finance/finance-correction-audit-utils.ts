import type { BadgeProps } from "@/components/ui/badge";

export type FinanceCorrectionAuditOperation =
  | "manual_allocation"
  | "adjust_allocation"
  | "reverse_allocation"
  | "generate_payment_ledger"
  | "link_ledger_payment"
  | "mark_legacy_ledger";

export type FinanceCorrectionAuditDomain = "receivable" | "ledger";

type BadgeVariant = NonNullable<BadgeProps["variant"]>;

const OPERATION_LABELS: Record<FinanceCorrectionAuditOperation, string> = {
  manual_allocation: "人工核销",
  adjust_allocation: "调整核销",
  reverse_allocation: "撤销核销",
  generate_payment_ledger: "补生成收款台账",
  link_ledger_payment: "关联收款",
  mark_legacy_ledger: "标记历史流水",
};

export function financeCorrectionAuditOperationLabel(
  operation: FinanceCorrectionAuditOperation | string,
) {
  return OPERATION_LABELS[operation as FinanceCorrectionAuditOperation] ||
    "未知修正";
}

export function financeCorrectionAuditDomainMeta(
  domain: FinanceCorrectionAuditDomain,
): { label: string; variant: BadgeVariant } {
  if (domain === "receivable") {
    return { label: "应收核销", variant: "secondary" };
  }
  return { label: "台账修正", variant: "outline" };
}

export function buildFinanceCorrectionAuditSearchParams(query: {
  page?: number;
  pageSize?: number;
  date_from?: string;
  date_to?: string;
  project_id?: string;
  operation?: string;
  actor_employee_id?: string;
}) {
  const params = new URLSearchParams();
  params.set("page", String(query.page || 1));
  params.set("pageSize", String(query.pageSize || 20));
  appendIfPresent(params, "date_from", query.date_from);
  appendIfPresent(params, "date_to", query.date_to);
  appendIfPresent(params, "project_id", query.project_id);
  appendIfPresent(params, "operation", query.operation);
  appendIfPresent(params, "actor_employee_id", query.actor_employee_id);
  return params;
}

export function safeFinanceCorrectionAuditHref(
  href: string | null | undefined,
) {
  if (!href || !href.startsWith("/finance/")) return "/finance/audits";
  return href;
}

function appendIfPresent(
  params: URLSearchParams,
  key: string,
  value: string | undefined,
) {
  const normalized = value?.trim();
  if (normalized) params.set(key, normalized);
}
