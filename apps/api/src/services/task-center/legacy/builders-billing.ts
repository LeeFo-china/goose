import {
  billingSubscriptionRepository,
  type TenantSubscriptionOpenInvoiceRecord,
} from "@/repositories/billing-subscriptions";
import {
  accessPolicyService,
  getPriorityLabel,
  type AuthContext,
  type TaskCenterTodoItem,
} from "./shared";

type RepositoryPort = {
  findOpenInvoiceByTenantId: (
    tenantId: string,
  ) => Promise<TenantSubscriptionOpenInvoiceRecord | null>;
};

const RECHARGE_CREATE_PERMISSION = "billing.recharge.create";

export async function buildBillingPaymentTodos(
  authContext: AuthContext,
  repository: RepositoryPort = billingSubscriptionRepository,
) {
  if (
    !authContext.employeeId ||
    !accessPolicyService.hasPermission(authContext, RECHARGE_CREATE_PERMISSION)
  ) {
    return [] as TaskCenterTodoItem[];
  }

  const tenantId = accessPolicyService.assertTenantContext(authContext);
  const invoice = await repository.findOpenInvoiceByTenantId(tenantId);
  if (!invoice) {
    return [] as TaskCenterTodoItem[];
  }

  return [{
    id: `billing_invoice:${invoice.id}`,
    type: "billing_payment_due" as const,
    title: invoice.status === "past_due" ? "系统使用费已到期" : "系统使用费待充值",
    subtitle: `需充值至少 ${invoice.amount_credits.toLocaleString("zh-CN")} 积分`,
    status: "pending" as const,
    status_label: "待处理" as const,
    priority: "high" as const,
    priority_label: getPriorityLabel("high"),
    due_at: invoice.due_at,
    created_at: invoice.due_at,
    action_label: "去充值",
    target_url: "/billing",
    target_type: "billing" as const,
    target_id: invoice.id,
    metadata: {
      invoice_id: invoice.id,
      amount_credits: invoice.amount_credits,
      invoice_status: invoice.status,
    },
  }] satisfies TaskCenterTodoItem[];
}
