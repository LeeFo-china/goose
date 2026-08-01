import type {
  PaymentRequestAction,
  PaymentRequestActionContext,
  PaymentRequestPermissions,
} from "./payment-request-types";

export function paymentRequestActions(
  context: PaymentRequestActionContext,
  permissions: PaymentRequestPermissions,
): PaymentRequestAction[] {
  if (context.status === "draft") {
    return permissions.canManage ? ["edit", "submit", "cancel"] : [];
  }
  if (context.status === "pending_approval") {
    const actions: PaymentRequestAction[] = [];
    if (permissions.canApprove) actions.push("approve", "reject");
    if (permissions.canManage) actions.push("cancel");
    return actions;
  }
  if (context.status === "approved") {
    const actions: PaymentRequestAction[] = [];
    if (permissions.canPay && context.invoiceBlocked === false) actions.push("pay");
    if (permissions.canManage) actions.push("cancel");
    return actions;
  }
  if (context.status === "partially_paid") {
    const actions: PaymentRequestAction[] = [];
    if (permissions.canPay && context.invoiceBlocked === false) actions.push("pay");
    if (permissions.canManage) actions.push("close");
    return actions;
  }
  return [];
}
