import {
  financeReconciliationActionsRepository,
  type FinanceReconciliationActionRecord,
} from "@/repositories/finance-reconciliation-actions";
import type {
  FinanceReconciliationAction,
  FinanceReconciliationLevel,
} from "@/schema/finance-reconciliation";
import type {
  FinanceReconciliationException,
} from "@/services/finance-reconciliation-exceptions";

export async function withFinanceReconciliationActionState(input: {
  tenantId: string;
  exceptions: FinanceReconciliationException[];
  actionsRepository: Pick<
    typeof financeReconciliationActionsRepository,
    "listLatestActions"
  >;
}) {
  const actionMap = await input.actionsRepository.listLatestActions({
    tenantId: input.tenantId,
    fingerprints: input.exceptions.map((item) => item.exception_fingerprint),
  });

  return input.exceptions.map((item) =>
    applyActionState(item, actionMap.get(item.exception_fingerprint) ?? null)
  );
}

export function latestActionFromExceptions(
  exceptions: FinanceReconciliationException[],
) {
  return exceptions
    .filter((item) => item.last_action_at)
    .sort((left, right) =>
      Date.parse(right.last_action_at || "") -
      Date.parse(left.last_action_at || "")
    )[0] ?? null;
}

export function highestLevelFromExceptions(
  exceptions: FinanceReconciliationException[],
): FinanceReconciliationLevel | null {
  if (exceptions.some((item) => item.level === "danger")) return "danger";
  if (exceptions.some((item) => item.level === "warning")) return "warning";
  if (exceptions.some((item) => item.level === "info")) return "info";
  return null;
}

function applyActionState(
  item: FinanceReconciliationException,
  action: FinanceReconciliationActionRecord | null,
): FinanceReconciliationException {
  if (!action) return item;
  return {
    ...item,
    status: statusFromAction(action.action),
    last_action: action.action,
    last_action_at: action.created_at,
    last_action_remark: action.remark,
    last_actor_employee_id: action.actor_employee_id,
    last_actor_employee_name: action.actor_employee_name,
  };
}

function statusFromAction(action: FinanceReconciliationAction) {
  if (action === "acknowledge") return "acknowledged" as const;
  if (action === "ignore") return "ignored" as const;
  if (action === "resolve") return "resolved" as const;
  if (action === "generate_expense_ledger") return "resolved" as const;
  if (action === "update_expense_ledger_category") return "resolved" as const;
  if (action === "record_expense_amount_mismatch_review") {
    return "acknowledged" as const;
  }
  return "open" as const;
}
