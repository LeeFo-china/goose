import type {
  ProjectOperationalRiskSeverity,
  ProjectOperationalRiskType,
} from "@gooes/domain";

type BadgeVariant = "default" | "secondary" | "destructive" | "outline";

type SeverityIconSemantic = "alert-triangle" | "circle-alert";

export type ProjectRiskSeverityMeta = {
  label: string;
  badgeVariant: BadgeVariant;
  icon: SeverityIconSemantic;
};

const RISK_TYPE_LABELS: Record<ProjectOperationalRiskType, string> = {
  workflow_task_overdue: "流程任务逾期",
  procedure_overdue: "施工阶段逾期",
  missing_project_log: "项目日志缺失",
  acceptance_rework: "验收返工",
  service_ticket: "客服问题",
};

const SEVERITY_META: Record<
  ProjectOperationalRiskSeverity,
  ProjectRiskSeverityMeta
> = {
  danger: {
    label: "高风险",
    badgeVariant: "destructive",
    icon: "alert-triangle",
  },
  warning: {
    label: "需关注",
    badgeVariant: "secondary",
    icon: "circle-alert",
  },
};

export function getProjectOperationalRiskTypeLabel(
  riskType: ProjectOperationalRiskType,
): string {
  return RISK_TYPE_LABELS[riskType];
}

export function getProjectOperationalRiskSeverityMeta(
  severity: ProjectOperationalRiskSeverity,
): ProjectRiskSeverityMeta {
  return SEVERITY_META[severity];
}

export function formatProjectRiskDateTime(value: string | null): string {
  if (!value) return "-";

  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(value));
}

export function formatOverdueDays(days: number | null): string {
  if (days === null) return "未计算";
  if (days === 0) return "今天到期";
  return `逾期 ${days} 天`;
}

export function formatProjectRiskEvidence(
  evidence: Record<string, string | number | boolean | null>,
): string[] {
  const entries = Object.entries(evidence);
  const visibleItems = entries
    .slice(0, 2)
    .map(([key, value]) => `${key}：${value ?? "-"}`);

  const hiddenCount = entries.length - visibleItems.length;
  if (hiddenCount > 0) visibleItems.push(`+${hiddenCount}`);

  return visibleItems;
}
