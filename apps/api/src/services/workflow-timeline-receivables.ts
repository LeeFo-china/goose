import type {
  WorkflowTimelineNodeAction,
  WorkflowTimelineNodeAttributes,
} from "@/services/project-workflow-timeline-contract";

export function buildReceivableTimelineAttributes(
  actions: WorkflowTimelineNodeAction[],
): Partial<WorkflowTimelineNodeAttributes> {
  for (const action of actions) {
    const fields = Array.isArray(action.output_fields) ? action.output_fields : [];
    for (const field of fields) {
      if (!isRecord(field) || field.name !== "receivable_context") continue;
      const planId = readString(field.receivable_plan_id);
      if (!planId) continue;

      return {
        receivable_plan_id: planId,
        receivable_title: readString(field.receivable_title),
        receivable_amount: readNonNegativeNumber(field.receivable_amount),
        receivable_paid_amount: readNonNegativeNumber(field.receivable_paid_amount),
        receivable_remaining_amount: readNonNegativeNumber(
          field.receivable_remaining_amount,
        ),
        receivable_due_date: readString(field.receivable_due_date),
        receivable_status: readString(field.receivable_status),
        receivable_overdue_days: readNonNegativeNumber(
          field.receivable_overdue_days,
        ),
      };
    }
  }

  return {};
}

function readString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readNonNegativeNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
