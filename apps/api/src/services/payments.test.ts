import { beforeEach, describe, expect, mock, test } from "bun:test";
import type { AuthContext } from "@/services/authorization";

const createPayment = mock(async (input: Record<string, unknown>) => ({
  id: "payment-1",
  ...input,
}));
const updatePayment = mock(async (id: string, input: Record<string, unknown>) => ({
  id,
  project_id: "550e8400-e29b-41d4-a716-446655440001",
  ...input,
}));
type PaymentFixture = {
  id: string;
  project_id: string | null;
  amount: number | null;
  type: string | null;
  status: string | null;
  created_at: string | null;
  pay_date?: string | null;
  source_type?: string | null;
  source_id?: string | null;
  workflow_task_id?: string | null;
  payment_channel?: string | null;
  project?: {
    id: string;
    tenant_id: string | null;
  } | null;
};

const findById = mock(async (): Promise<PaymentFixture | null> => ({
  id: "payment-1",
  project_id: "550e8400-e29b-41d4-a716-446655440001",
  amount: 100,
  type: "deposit",
  status: "pending",
  created_at: "2026-06-16T00:00:00.000Z",
  pay_date: "2026-06-16T10:00:00.000Z",
  source_type: null,
  source_id: null,
  workflow_task_id: null,
  payment_channel: "manual",
  project: {
    id: "550e8400-e29b-41d4-a716-446655440001",
    tenant_id: "tenant-1",
  },
}));
const findProjectTenant = mock(async () => ({
  id: "550e8400-e29b-41d4-a716-446655440001",
  tenant_id: "tenant-1",
}));
const findProjectPaymentByPaymentId = mock(
  async (): Promise<Record<string, unknown> | null> => null,
);
const createProjectPaymentLedger = mock(async (input: Record<string, unknown>) => ({
  id: "ledger-1",
  ...input,
}));

mock.module("@/repositories/payments", () => ({
  paymentRepository: {
    create: createPayment,
    update: updatePayment,
    findById,
    findProjectTenant,
  },
}));

mock.module("@/repositories/finance-ledger", () => ({
  financeLedgerRepository: {
    findProjectPaymentByPaymentId,
  },
}));

mock.module("@/services/finance-ledger", () => ({
  financeLedgerService: {
    createProjectPaymentLedger,
  },
}));

mock.module("@/services/access-policy", () => ({
  accessPolicyService: {
    assertTenantContext: mock((
      context: { tenantId?: string | null },
    ) => context.tenantId || "tenant-1"),
    hasPermission: mock((
      context: { permissions?: Array<{ code: string }> },
      permissionCode: string,
    ) =>
      Boolean(context.permissions?.some((permission) =>
        permission.code === permissionCode
      ))
    ),
    canAccessProject: mock(async () => true),
    getScope: mock((
      authContext: { permissions?: Array<{ code: string; scope: string }> },
      permissionCode: string,
    ) =>
      authContext.permissions?.find((permission) =>
        permission.code === permissionCode
      )?.scope ?? null
    ),
  },
}));

const authContext = {
  authUserId: "auth-1",
  employeeId: "employee-1",
  tenantId: "tenant-1",
  tenantName: null,
  tenantSlug: null,
  tenantStatus: "active",
  isPlatformAdmin: false,
  employeeName: "财务",
  employeeStatus: "active",
  departmentId: null,
  tenantDepartmentId: null,
  departmentCode: "FINANCE",
  departmentName: "财务部",
  postId: null,
  postName: null,
  avatar: null,
  roleCodes: [],
  roles: [],
  permissions: [],
} satisfies AuthContext;

describe("paymentService", () => {
  beforeEach(() => {
    createPayment.mockClear();
    updatePayment.mockClear();
    findById.mockClear();
    findProjectTenant.mockClear();
    findProjectPaymentByPaymentId.mockClear();
    createProjectPaymentLedger.mockClear();
  });

  test("normalizes paid_at to pay_date before creating a payment", async () => {
    const { paymentService } = await import("./payments");

    await paymentService.createPayment(authContext, {
      project_id: "550e8400-e29b-41d4-a716-446655440001",
      amount: 100,
      type: "deposit",
      status: "confirmed",
      payment_channel: "manual",
      paid_at: "2026-06-16T10:00:00.000Z",
    });

    expect(createPayment).toHaveBeenCalledWith(
      expect.objectContaining({
        pay_date: "2026-06-16T10:00:00.000Z",
      }),
    );
    expect(createPayment.mock.calls[0]?.[0]).not.toHaveProperty("paid_at");
  });

  test("normalizes paid_at to pay_date before updating a payment", async () => {
    const { paymentService } = await import("./payments");

    await paymentService.updatePayment(authContext, "payment-1", {
      paid_at: "2026-06-16T11:00:00.000Z",
    });

    expect(updatePayment).toHaveBeenCalledWith(
      "payment-1",
      expect.objectContaining({
        pay_date: "2026-06-16T11:00:00.000Z",
      }),
    );
    expect(updatePayment.mock.calls[0]?.[1]).not.toHaveProperty("paid_at");
  });

  test("generates a missing project payment ledger for a confirmed payment", async () => {
    findById.mockImplementationOnce(async () => ({
      id: "payment-confirmed",
      project_id: "550e8400-e29b-41d4-a716-446655440001",
      amount: 10000,
      type: "stage_payment",
      status: "confirmed",
      pay_date: "2026-06-16T10:00:00.000Z",
      created_at: "2026-06-16T00:00:00.000Z",
      source_type: "workflow_task",
      source_id: "550e8400-e29b-41d4-a716-446655440099",
      workflow_task_id: "550e8400-e29b-41d4-a716-446655440099",
      payment_channel: "manual",
      project: {
        id: "550e8400-e29b-41d4-a716-446655440001",
        tenant_id: "tenant-1",
      },
    }));

    const { paymentService } = await import("./payments");
    const ledger = await paymentService.generateProjectPaymentLedger(
      {
        ...authContext,
        permissions: [{ code: "finance.payment.confirm", scope: "all" }],
      },
      "payment-confirmed",
      { reason: "对账异常补入账" },
    );

    expect(ledger).toMatchObject({ id: "ledger-1" });
    expect(createProjectPaymentLedger).toHaveBeenCalledWith(
      expect.objectContaining({
        tenant_id: "tenant-1",
        project_id: "550e8400-e29b-41d4-a716-446655440001",
        direction: "in",
        entry_type: "project_payment",
        amount: 10000,
        occurred_at: "2026-06-16T10:00:00.000Z",
        source_type: "workflow_task",
        source_id: "550e8400-e29b-41d4-a716-446655440099",
        workflow_task_id: "550e8400-e29b-41d4-a716-446655440099",
        payment_id: "payment-confirmed",
        handled_by: "employee-1",
        summary: "项目收款入账",
        metadata: expect.objectContaining({
          operation: "generate_missing_project_payment_ledger",
          repair_reason: "对账异常补入账",
          repaired_by: "employee-1",
        }),
      }),
    );
  });

  test("rejects generating ledger when payment is not confirmed", async () => {
    const { paymentService } = await import("./payments");

    await expect(paymentService.generateProjectPaymentLedger(
      {
        ...authContext,
        permissions: [{ code: "finance.payment.confirm", scope: "all" }],
      },
      "payment-1",
      { reason: "对账异常补入账" },
    )).rejects.toMatchObject({
      statusCode: 409,
      code: "PAYMENT_NOT_CONFIRMED",
    });
  });

  test("rejects generating duplicate project payment ledger", async () => {
    findById.mockImplementationOnce(async () => ({
      id: "payment-confirmed",
      project_id: "550e8400-e29b-41d4-a716-446655440001",
      amount: 10000,
      type: "stage_payment",
      status: "confirmed",
      pay_date: "2026-06-16T10:00:00.000Z",
      created_at: "2026-06-16T00:00:00.000Z",
      source_type: null,
      source_id: null,
      workflow_task_id: null,
      payment_channel: "manual",
      project: {
        id: "550e8400-e29b-41d4-a716-446655440001",
        tenant_id: "tenant-1",
      },
    }));
    findProjectPaymentByPaymentId.mockImplementationOnce(async () => ({
      id: "ledger-existing",
    }));
    const { paymentService } = await import("./payments");

    await expect(paymentService.generateProjectPaymentLedger(
      {
        ...authContext,
        permissions: [{ code: "finance.payment.confirm", scope: "all" }],
      },
      "payment-confirmed",
      { reason: "对账异常补入账" },
    )).rejects.toMatchObject({
      statusCode: 409,
      code: "PAYMENT_LEDGER_ALREADY_EXISTS",
    });
  });

  test("requires finance payment confirmation permission", async () => {
    const { paymentService } = await import("./payments");

    await expect(paymentService.generateProjectPaymentLedger(
      authContext,
      "payment-1",
      { reason: "对账异常补入账" },
    )).rejects.toMatchObject({
      statusCode: 403,
    });
  });
});
