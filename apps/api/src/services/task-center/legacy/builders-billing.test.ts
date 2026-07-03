import { describe, expect, mock, test } from "bun:test";
import type { AuthContext } from "@/services/authorization";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

const authContext = {
  authUserId: "auth-1",
  employeeId: "employee-1",
  tenantId: "tenant-1",
  tenantName: null,
  tenantSlug: null,
  tenantStatus: "active",
  isPlatformAdmin: false,
  employeeName: "管理员",
  employeeStatus: "active",
  departmentId: null,
  tenantDepartmentId: null,
  departmentCode: null,
  departmentName: null,
  postId: null,
  postName: null,
  avatar: null,
  roleCodes: [],
  roles: [],
  permissions: [{ code: "billing.recharge.create", scope: "all" }],
} satisfies AuthContext;

describe("buildBillingPaymentTodos", () => {
  test("returns a high priority billing todo for recharge admins", async () => {
    const { buildBillingPaymentTodos } = await import("./builders-billing");
    const repository = {
      findOpenInvoiceByTenantId: mock(async () => ({
        id: "invoice-1",
        tenant_id: "tenant-1",
        amount_credits: 1000,
        due_at: "2026-07-10T00:00:00.000Z",
        status: "reminded" as const,
      })),
    };

    const list = await buildBillingPaymentTodos(authContext, repository);

    expect(repository.findOpenInvoiceByTenantId).toHaveBeenCalledWith("tenant-1");
    expect(list).toEqual([
      expect.objectContaining({
        id: "billing_invoice:invoice-1",
        type: "billing_payment_due",
        priority: "high",
        action_label: "去充值",
        target_url: "/billing",
        target_type: "billing",
        target_id: "invoice-1",
        metadata: {
          invoice_id: "invoice-1",
          amount_credits: 1000,
          invoice_status: "reminded",
        },
      }),
    ]);
  });

  test("does not query invoices without recharge permission", async () => {
    const { buildBillingPaymentTodos } = await import("./builders-billing");
    const repository = {
      findOpenInvoiceByTenantId: mock(async () => null),
    };

    const list = await buildBillingPaymentTodos({
      ...authContext,
      permissions: [],
    }, repository);

    expect(list).toEqual([]);
    expect(repository.findOpenInvoiceByTenantId).not.toHaveBeenCalled();
  });
});
