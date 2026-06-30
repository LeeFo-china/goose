import { beforeEach, describe, expect, mock, test } from "bun:test";
import { FinanceLedgerListQuerySchema } from "@/schema/finance";
import type { AuthContext } from "@/services/authorization";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

const listLedger = mock(async () => ({
  list: [],
  pagination: {
    page: 1,
    pageSize: 20,
    total: 0,
    totalPages: 0,
  },
}));
const findActiveCostCategory = mock(async () => ({
  id: "category-2",
  tenant_id: "tenant-1",
  status: "active",
}));
const updateLedgerCostCategory = mock(async () => ({
  id: "ledger-1",
  tenant_id: "tenant-1",
  cost_category_id: "category-2",
  cost_category_updated_by: "employee-1",
  cost_category_updated_at: "2026-06-24T10:00:00.000Z",
}));

type LedgerFixture = {
  id: string;
  tenant_id: string;
  project_id: string | null;
  direction: string;
  entry_type: string;
  amount: number;
  payment_id: string | null;
  legacy_payment_ledger_marked_at: string | null;
  metadata: Record<string, unknown>;
};

const findLedgerById = mock(async (): Promise<LedgerFixture | null> => ({
  id: "ledger-1",
  tenant_id: "tenant-1",
  project_id: "project-1",
  direction: "in",
  entry_type: "project_payment",
  amount: 1000,
  payment_id: null,
  legacy_payment_ledger_marked_at: null,
  metadata: {},
}));
const findProjectPaymentByPaymentId = mock(async () => null);
const linkProjectPayment = mock(async (input: Record<string, unknown>) => ({
  id: input.ledgerId,
  payment_id: input.paymentId,
  payment_linked_by: input.employeeId,
}));
const markLegacyProjectPayment = mock(async (input: Record<string, unknown>) => ({
  id: input.ledgerId,
  legacy_payment_ledger_marked_by: input.employeeId,
}));
type PaymentFixture = {
  id: string;
  project_id: string | null;
  amount: number;
  status: string | null;
  project?: {
    id: string;
    tenant_id: string | null;
  } | null;
};

const findPaymentById = mock(async (): Promise<PaymentFixture | null> => ({
  id: "payment-1",
  project_id: "project-1",
  amount: 1000,
  status: "confirmed",
  project: {
    id: "project-1",
    tenant_id: "tenant-1",
  },
}));

mock.module("@/repositories/finance-ledger", () => ({
  financeLedgerRepository: {
    list: listLedger,
    createIdempotent: mock(async (input: Record<string, unknown>) => input),
    findActiveCostCategory,
    updateCostCategory: updateLedgerCostCategory,
    findById: findLedgerById,
    findProjectPaymentByPaymentId,
    linkProjectPayment,
    markLegacyProjectPayment,
  },
}));

mock.module("@/repositories/payments", () => ({
  paymentRepository: {
    findById: findPaymentById,
  },
}));

mock.module("@/services/access-policy", () => ({
  accessPolicyService: {
    assertTenantContext: mock((authContext: AuthContext) => authContext.tenantId),
    hasPermission: mock((authContext: AuthContext, permissionCode: string) =>
      authContext.permissions.some((permission) => permission.code === permissionCode)
    ),
  },
}));

const baseAuthContext = {
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
} satisfies Omit<AuthContext, "permissions">;

function authContextWithPermissions(
  permissions: AuthContext["permissions"],
): AuthContext {
  return {
    ...baseAuthContext,
    permissions,
  };
}

describe("financeLedgerService", () => {
  beforeEach(() => {
    listLedger.mockClear();
    findActiveCostCategory.mockClear();
    updateLedgerCostCategory.mockClear();
    findLedgerById.mockClear();
    findProjectPaymentByPaymentId.mockClear();
    linkProjectPayment.mockClear();
    markLegacyProjectPayment.mockClear();
    findPaymentById.mockClear();
    findLedgerById.mockImplementation(async () => ({
      id: "ledger-1",
      tenant_id: "tenant-1",
      project_id: "project-1",
      direction: "in",
      entry_type: "project_payment",
      amount: 1000,
      payment_id: null,
      legacy_payment_ledger_marked_at: null,
      metadata: {},
    }));
    findProjectPaymentByPaymentId.mockImplementation(async () => null);
    findPaymentById.mockImplementation(async () => ({
      id: "payment-1",
      project_id: "project-1",
      amount: 1000,
      status: "confirmed",
      project: {
        id: "project-1",
        tenant_id: "tenant-1",
      },
    }));
  });

  test("lists ledger for finance module viewers", async () => {
    const { financeLedgerService } = await import("./finance-ledger");

    await financeLedgerService.listLedger(
      authContextWithPermissions([{ code: "finance.view", scope: "all" }]),
      { page: 1, pageSize: 20 },
    );

    expect(listLedger).toHaveBeenCalledWith("tenant-1", {
      page: 1,
      pageSize: 20,
    });
  });

  test("parses and forwards unallocated ledger filter", async () => {
    const parsed = FinanceLedgerListQuerySchema.parse({
      page: "1",
      pageSize: "20",
      project_id: "11111111-1111-4111-8111-111111111111",
      direction: "out",
      unallocated_only: "true",
    });
    const { financeLedgerService } = await import("./finance-ledger");

    await financeLedgerService.listLedger(
      authContextWithPermissions([{ code: "finance.ledger.view", scope: "all" }]),
      parsed,
    );

    expect(parsed.unallocated_only).toBe(true);
    expect(listLedger).toHaveBeenCalledWith("tenant-1", {
      page: 1,
      pageSize: 20,
      project_id: "11111111-1111-4111-8111-111111111111",
      direction: "out",
      unallocated_only: true,
    });
  });

  test("rejects users without finance ledger permission", async () => {
    const { financeLedgerService } = await import("./finance-ledger");

    await expect(
      financeLedgerService.listLedger(
        authContextWithPermissions([{ code: "project.read", scope: "all" }]),
        { page: 1, pageSize: 20 },
      ),
    ).rejects.toMatchObject({
      statusCode: 403,
      code: "FORBIDDEN",
    });
  });

  test("updates ledger cost category with audit fields", async () => {
    const { financeLedgerService } = await import("./finance-ledger");

    const result = await financeLedgerService.updateCostCategory(
      authContextWithPermissions([
        { code: "finance.cost-allocation.manage", scope: "all" },
      ]),
      "ledger-1",
      { cost_category_id: "category-2" },
    );

    expect(findActiveCostCategory).toHaveBeenCalledWith({
      tenantId: "tenant-1",
      costCategoryId: "category-2",
    });
    expect(updateLedgerCostCategory).toHaveBeenCalledWith({
      tenantId: "tenant-1",
      ledgerId: "ledger-1",
      costCategoryId: "category-2",
      employeeId: "employee-1",
    });
    expect(result).toMatchObject({
      cost_category_id: "category-2",
      cost_category_updated_by: "employee-1",
    });
  });

  test("rejects ledger cost category update without allocation permission", async () => {
    const { financeLedgerService } = await import("./finance-ledger");

    await expect(
      financeLedgerService.updateCostCategory(
        authContextWithPermissions([{ code: "finance.ledger.view", scope: "all" }]),
        "ledger-1",
        { cost_category_id: "category-2" },
      ),
    ).rejects.toMatchObject({
      statusCode: 403,
      code: "FORBIDDEN",
    });
    expect(updateLedgerCostCategory).not.toHaveBeenCalled();
  });

  test("links a project payment ledger to a confirmed payment with audit fields", async () => {
    const { financeLedgerService } = await import("./finance-ledger");

    const result = await financeLedgerService.linkProjectPayment(
      authContextWithPermissions([
        { code: "finance.reconciliation.manage", scope: "all" },
      ]),
      "ledger-1",
      {
        payment_id: "payment-1",
        reason: "确认历史流水对应这笔收款",
      },
    );

    expect(findLedgerById).toHaveBeenCalledWith(expect.objectContaining({
      tenantId: "tenant-1",
      ledgerId: "ledger-1",
    }));
    expect(findPaymentById).toHaveBeenCalledWith("payment-1");
    expect(findProjectPaymentByPaymentId).toHaveBeenCalledWith({
      tenantId: "tenant-1",
      paymentId: "payment-1",
    });
    expect(linkProjectPayment).toHaveBeenCalledWith(expect.objectContaining({
      tenantId: "tenant-1",
      ledgerId: "ledger-1",
      paymentId: "payment-1",
      employeeId: "employee-1",
      reason: "确认历史流水对应这笔收款",
      previousPaymentId: null,
      metadata: expect.objectContaining({
        operation: "link_ledger_payment",
        linked_payment_id: "payment-1",
        payment_link_reason: "确认历史流水对应这笔收款",
        payment_linked_by: "employee-1",
      }),
    }));
    expect(result).toMatchObject({
      id: "ledger-1",
      payment_id: "payment-1",
      payment_linked_by: "employee-1",
    });
  });

  test("marks an unlinked project payment ledger as historical", async () => {
    const { financeLedgerService } = await import("./finance-ledger");

    const result = await financeLedgerService.markLegacyProjectPayment(
      authContextWithPermissions([
        { code: "finance.reconciliation.manage", scope: "all" },
      ]),
      "ledger-1",
      {
        reason: "历史导入流水，原始 payment 不存在",
      },
    );

    expect(markLegacyProjectPayment).toHaveBeenCalledWith(expect.objectContaining({
      tenantId: "tenant-1",
      ledgerId: "ledger-1",
      employeeId: "employee-1",
      reason: "历史导入流水，原始 payment 不存在",
      metadata: expect.objectContaining({
        operation: "mark_legacy_ledger",
        legacy_payment_ledger: true,
        legacy_payment_ledger_reason: "历史导入流水，原始 payment 不存在",
        legacy_payment_ledger_marked_by: "employee-1",
      }),
    }));
    expect(result).toMatchObject({
      id: "ledger-1",
      legacy_payment_ledger_marked_by: "employee-1",
    });
  });

  test("rejects ledger payment repairs without reconciliation permission", async () => {
    const { financeLedgerService } = await import("./finance-ledger");

    await expect(
      financeLedgerService.linkProjectPayment(
        authContextWithPermissions([{ code: "finance.ledger.view", scope: "all" }]),
        "ledger-1",
        {
          payment_id: "payment-1",
          reason: "确认历史流水对应这笔收款",
        },
      ),
    ).rejects.toMatchObject({
      statusCode: 403,
      code: "FORBIDDEN",
    });
    expect(linkProjectPayment).not.toHaveBeenCalled();
  });

  test("rejects linking a ledger that already has payment association", async () => {
    findLedgerById.mockImplementationOnce(async () => ({
      id: "ledger-1",
      tenant_id: "tenant-1",
      project_id: "project-1",
      direction: "in",
      entry_type: "project_payment",
      amount: 1000,
      payment_id: "payment-existing",
      legacy_payment_ledger_marked_at: null,
      metadata: {},
    }));
    const { financeLedgerService } = await import("./finance-ledger");

    await expect(
      financeLedgerService.linkProjectPayment(
        authContextWithPermissions([
          { code: "finance.reconciliation.manage", scope: "all" },
        ]),
        "ledger-1",
        {
          payment_id: "payment-1",
          reason: "确认历史流水对应这笔收款",
        },
      ),
    ).rejects.toMatchObject({
      statusCode: 409,
      code: "LEDGER_PAYMENT_ALREADY_LINKED",
    });
  });

  test("rejects linking a payment that is not confirmed", async () => {
    findPaymentById.mockImplementationOnce(async () => ({
      id: "payment-1",
      project_id: "project-1",
      amount: 1000,
      status: "pending",
      project: {
        id: "project-1",
        tenant_id: "tenant-1",
      },
    }));
    const { financeLedgerService } = await import("./finance-ledger");

    await expect(
      financeLedgerService.linkProjectPayment(
        authContextWithPermissions([
          { code: "finance.reconciliation.manage", scope: "all" },
        ]),
        "ledger-1",
        {
          payment_id: "payment-1",
          reason: "确认历史流水对应这笔收款",
        },
      ),
    ).rejects.toMatchObject({
      statusCode: 409,
      code: "PAYMENT_NOT_CONFIRMED",
    });
  });

  test("rejects linking a payment with mismatched amount", async () => {
    findPaymentById.mockImplementationOnce(async () => ({
      id: "payment-1",
      project_id: "project-1",
      amount: 900,
      status: "confirmed",
      project: {
        id: "project-1",
        tenant_id: "tenant-1",
      },
    }));
    const { financeLedgerService } = await import("./finance-ledger");

    await expect(
      financeLedgerService.linkProjectPayment(
        authContextWithPermissions([
          { code: "finance.reconciliation.manage", scope: "all" },
        ]),
        "ledger-1",
        {
          payment_id: "payment-1",
          reason: "确认历史流水对应这笔收款",
        },
      ),
    ).rejects.toMatchObject({
      statusCode: 409,
      code: "LEDGER_PAYMENT_AMOUNT_MISMATCH",
    });
  });
});
