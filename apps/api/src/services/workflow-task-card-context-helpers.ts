import type {
  WorkflowTaskProjectAcceptanceSummary,
  WorkflowTaskProjectSummary,
  WorkflowTaskReceivableSummary,
} from "@/repositories/workflow-task-card-context";
import type {
  ReceivableContext,
  WorkflowTaskCardContextItem,
  WorkflowTaskCardContextTask,
} from "@/services/workflow-task-card-context-types";

export function isProjectPaymentTask(item: WorkflowTaskCardContextItem) {
  return item.actions.some((action) =>
    action.business_domain === "payment_collection" ||
    action.output_fields?.some((field) =>
      field.type === "payment_collection" || field.type === "receivable_summary"
    )
  ) || readSnapshotKind(item.task) === "payment_collection";
}

export function isProjectAcceptanceTask(item: WorkflowTaskCardContextItem) {
  const snapshotKind = readSnapshotKind(item.task);
  return snapshotKind === "final_acceptance" ||
    item.task.node_key === "final_acceptance" ||
    item.actions.some((action) =>
      readString((action as Record<string, unknown>).business_domain) ===
        "project_acceptance"
    );
}

export function resolveReceivableContext(
  item: WorkflowTaskCardContextItem,
): ReceivableContext | null {
  for (const action of item.actions) {
    for (const field of action.output_fields ?? []) {
      const record = asRecord(field);
      if (record?.type !== "receivable_summary") continue;
      const receivablePlanId = readString(record.receivable_plan_id);
      const title = readString(record.receivable_title);
      const amount = readNumber(record.receivable_amount);
      const paidAmount = readNumber(record.receivable_paid_amount);
      const remainingAmount = readNumber(record.receivable_remaining_amount);
      const dueDate = readString(record.receivable_due_date);
      const status = readString(record.receivable_status);
      if (!receivablePlanId || !title || amount === null || paidAmount === null) {
        continue;
      }
      if (remainingAmount === null || !dueDate || !status) continue;

      return {
        receivable_plan_id: receivablePlanId,
        receivable_title: title,
        receivable_amount: amount,
        receivable_paid_amount: paidAmount,
        receivable_remaining_amount: remainingAmount,
        receivable_due_date: dueDate,
        receivable_status: status,
        receivable_overdue_days: readNumber(record.receivable_overdue_days) ??
          undefined,
      };
    }
  }

  return null;
}

export function normalizeReceivableSummary(
  receivable: WorkflowTaskReceivableSummary | null,
): ReceivableContext | null {
  if (!receivable) return null;
  return {
    receivable_plan_id: receivable.id,
    receivable_title: receivable.title,
    receivable_amount: receivable.amount,
    receivable_paid_amount: receivable.paid_amount,
    receivable_remaining_amount: Math.max(
      receivable.amount - receivable.paid_amount,
      0,
    ),
    receivable_due_date: receivable.due_date,
    receivable_status: receivable.status,
  };
}

export function buildReceivableAmountText(receivable: ReceivableContext | null) {
  if (!receivable) return null;
  return [
    `应收 ${formatMoney(receivable.receivable_amount)}`,
    `已收 ${formatMoney(receivable.receivable_paid_amount)}`,
    `剩余 ${formatMoney(receivable.receivable_remaining_amount)}`,
  ].join(" · ");
}

export function buildProjectPeopleText(project: WorkflowTaskProjectSummary | null) {
  if (!project) return null;
  const designer = findProjectMemberName(project, "designer");
  const construction = findProjectMemberName(project, "construction_manager") ||
    findProjectMemberName(project, "supervisor");

  return joinText([
    designer ? `设计 ${designer}` : null,
    construction ? `施工 ${construction}` : null,
  ], " · ");
}

export function buildProjectPayload(project: WorkflowTaskProjectSummary | null) {
  if (!project) return null;
  return {
    id: project.id,
    name: project.name || "项目",
    property_label: project.property_label,
    address: project.address,
    status_label: project.status,
  };
}

export function buildAssigneePayload(
  assignee: WorkflowTaskCardContextItem["assignee"],
) {
  return {
    id: assignee.assignee_employee_id ?? null,
    name: assignee.assignee_employee_name ?? assignee.assignee_display_name ?? null,
    label: assignee.current_handler_label ?? null,
  };
}

export function baseBusiness(item: WorkflowTaskCardContextItem) {
  return {
    workflow_task_id: item.task.id,
    workflow_instance_id: item.task.instance_id,
    workflow_node_key: item.task.node_key,
    workflow_node_type: item.task.node_type ?? null,
  };
}

export function selectAcceptanceForTask(
  item: WorkflowTaskCardContextItem,
  acceptances: WorkflowTaskProjectAcceptanceSummary[],
) {
  const snapshotConfig = asRecord(
    asRecord(item.task.instance?.current_node_snapshot)?.config,
  );
  const stageCode = readString(snapshotConfig?.stage_code) ||
    readString(snapshotConfig?.stage_key);
  if (stageCode) {
    const exact = acceptances.find((acceptance) =>
      acceptance.stage_code === stageCode
    );
    if (exact) return exact;
  }

  return acceptances[0] ?? null;
}

export function taskTitle(task: WorkflowTaskCardContextTask, fallback: string) {
  const snapshot = asRecord(task.instance?.current_node_snapshot);
  return readString(snapshot?.title) || readString(task.title) || fallback;
}

export function actionLabel(item: WorkflowTaskCardContextItem) {
  for (const action of item.actions) {
    const label = readString(action.label);
    if (label) return label;
  }
  return null;
}

export function projectNameOrFallback(project: WorkflowTaskProjectSummary | null) {
  return project?.name?.trim() || "项目";
}

export function taskReceivableKey(input: {
  instanceId?: string | null;
  nodeKey?: string | null;
}) {
  return `${input.instanceId ?? ""}:${input.nodeKey ?? ""}`;
}

export function formatMoney(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return `¥${value.toLocaleString("zh-CN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function formatDateText(value: string | null | undefined) {
  return value ? value.slice(0, 10) : null;
}

export function joinText(
  values: Array<string | null | undefined>,
  separator: string,
) {
  const parts = values.filter((value): value is string => Boolean(value?.trim()));
  return parts.length > 0 ? parts.join(separator) : null;
}

export function readString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readSnapshotKind(task: WorkflowTaskCardContextTask) {
  return readString(asRecord(task.instance?.current_node_snapshot)?.business_kind);
}

function readNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function findProjectMemberName(
  project: WorkflowTaskProjectSummary,
  roleCode: string,
) {
  return project.members.find((member) => member.role_code === roleCode)
    ?.employee_name?.trim() ?? null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}
