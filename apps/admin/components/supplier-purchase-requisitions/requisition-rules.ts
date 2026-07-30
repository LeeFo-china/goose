import type {
  RequisitionAction,
  RequisitionActionContext,
} from "./requisition-types";

export function actionsFor(
  context: RequisitionActionContext,
): RequisitionAction[] {
  if (context.status === "draft") {
    return context.canManage ? ["edit", "submit", "cancel"] : [];
  }

  if (context.status === "pending_approval") {
    const actions: RequisitionAction[] = [];
    const isKnownNonRequester = Boolean(context.currentEmployeeId) &&
      context.currentEmployeeId !== context.requesterEmployeeId;
    if (context.canApprove && isKnownNonRequester) {
      if (
        context.budgetStatus !== "over_budget" ||
        context.canManageBudget
      ) {
        actions.push("approve");
      }
      actions.push("reject");
    }
    if (context.canManage) actions.push("cancel");
    return actions;
  }

  if (context.status === "approved") {
    return context.canManage ? ["convert", "cancel"] : [];
  }

  return [];
}
