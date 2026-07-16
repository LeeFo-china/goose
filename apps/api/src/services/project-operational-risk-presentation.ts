import type {
  ProjectOperationalRiskDisplayItem,
  ProjectOperationalRiskFact,
} from "@gooes/domain";

import { Errors } from "@/errors/error-factory";

type Evidence = ProjectOperationalRiskFact["evidence"];

function textEvidence(
  evidence: Evidence,
  key: string,
  fallback: string,
): string {
  const value = evidence[key];
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value === "boolean") return value ? "是" : "否";
  return fallback;
}

function formatDate(value: string | null | undefined, fallback = "未记录"): string {
  if (!value) return fallback;
  return value.slice(0, 10) || fallback;
}

function formatOverdueDays(value: number | null | undefined): string {
  if (typeof value !== "number") return "逾期天数未计算";
  if (value === 0) return "今天到期";
  return `逾期 ${value} 天`;
}

function projectHref(projectId: string, tab: string): string {
  return `/projects/${encodeURIComponent(projectId)}?tab=${encodeURIComponent(tab)}`;
}

function appendParam(href: string, key: string, value: string): string {
  return `${href}&${encodeURIComponent(key)}=${encodeURIComponent(value)}`;
}

function assertNever(riskType: never): never {
  throw Errors.business(
    500,
    "未知项目运营风险类型",
    "PROJECT_OPERATIONAL_RISK_UNKNOWN_TYPE",
    { riskType },
  );
}

function pickEvidence(evidence: Evidence, keys: readonly string[]): Evidence {
  return Object.fromEntries(
    keys
      .filter((key) => Object.prototype.hasOwnProperty.call(evidence, key))
      .map((key) => [key, evidence[key] ?? null]),
  );
}

export function presentProjectOperationalRisk(
  fact: ProjectOperationalRiskFact,
): ProjectOperationalRiskDisplayItem {
  const baseAction = {
    label: "去处理",
    href: projectHref(fact.project_id, "overview"),
  };

  switch (fact.risk_type) {
    case "workflow_task_overdue": {
      const taskTitle = textEvidence(fact.evidence, "task_title", "未命名任务");
      return {
        ...fact,
        evidence: pickEvidence(fact.evidence, ["task_title"]),
        title: "工作流任务逾期",
        description: `${taskTitle}，${formatOverdueDays(fact.overdue_days)}，到期时间 ${formatDate(fact.due_at)}。`,
        action: baseAction,
      };
    }
    case "procedure_overdue": {
      const procedureName = textEvidence(
        fact.evidence,
        "procedure_name",
        textEvidence(fact.evidence, "stage_name", "未命名工序"),
      );
      const plannedEndDate = textEvidence(
        fact.evidence,
        "planned_end_date",
        formatDate(fact.due_at),
      );
      return {
        ...fact,
        evidence: pickEvidence(fact.evidence, [
          "procedure_name",
          "stage_name",
          "planned_end_date",
        ]),
        title: "施工工序延期",
        description: `${procedureName}，${formatOverdueDays(fact.overdue_days)}，计划结束 ${plannedEndDate}。`,
        action: baseAction,
      };
    }
    case "missing_project_log": {
      const businessDate = textEvidence(
        fact.evidence,
        "business_date",
        formatDate(fact.occurred_at),
      );
      const lastLogAt = textEvidence(fact.evidence, "last_log_at", "暂无最近日志");
      const currentStage = textEvidence(fact.evidence, "current_stage", "阶段未记录");
      return {
        ...fact,
        evidence: pickEvidence(fact.evidence, [
          "business_date",
          "last_log_at",
          "current_stage",
        ]),
        title: "施工日志缺失",
        description: `${businessDate} 当日缺失施工日志，最近日志 ${lastLogAt}，当前阶段 ${currentStage}。`,
        action: {
          label: "去处理",
          href: projectHref(fact.project_id, "logs"),
        },
      };
    }
    case "acceptance_rework": {
      const acceptanceTitle = textEvidence(
        fact.evidence,
        "acceptance_title",
        "未命名验收",
      );
      const acceptanceType = textEvidence(fact.evidence, "acceptance_type", "验收");
      const rejectSource = textEvidence(fact.evidence, "reject_source", "未记录来源");
      return {
        ...fact,
        evidence: pickEvidence(fact.evidence, [
          "acceptance_title",
          "acceptance_type",
          "reject_source",
        ]),
        title: "验收需要整改",
        description: `${acceptanceTitle}（${acceptanceType}）被${rejectSource}驳回，驳回时间 ${formatDate(fact.occurred_at)}。`,
        action: {
          label: "去处理",
          href: appendParam(
            projectHref(fact.project_id, "acceptances"),
            "acceptanceId",
            fact.source_id,
          ),
        },
      };
    }
    case "service_ticket": {
      const ticketNo = textEvidence(fact.evidence, "ticket_no", fact.source_id);
      const priority = textEvidence(fact.evidence, "priority", "未标记优先级");
      const unresolvedHours = textEvidence(
        fact.evidence,
        "unresolved_hours",
        "未计算",
      );
      return {
        ...fact,
        evidence: pickEvidence(fact.evidence, [
          "ticket_no",
          "priority",
          "unresolved_hours",
        ]),
        title: "高优先级客服工单",
        description: `工单 ${ticketNo}，优先级 ${priority}，未处理 ${unresolvedHours} 小时。`,
        action: {
          label: "去处理",
          href: `/customer-service?ticketId=${encodeURIComponent(fact.source_id)}`,
        },
      };
    }
    default:
      return assertNever(fact.risk_type satisfies never);
  }
}
