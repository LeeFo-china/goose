import { beforeEach, describe, expect, mock, test } from "bun:test";
import type { AuthContext } from "@/services/authorization";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

const listReceivableCorrectionEvents = mock(async () => ({
  list: [
    {
      id: "event-allocate",
      tenant_id: "tenant-1",
      project_id: "project-1",
      project_name: "张三施工项目",
      receivable_plan_id: "plan-1",
      event_type: "allocate_payment",
      title: "人工核销收款",
      note: "历史收款补核销",
      before_snapshot: { paid_amount: 0 },
      after_snapshot: { paid_amount: 1000, amount: 1000, status: "paid" },
      created_by: "employee-1",
      created_by_name: "财务甲",
      created_at: "2026-06-30T10:00:00.000Z",
    },
    {
      id: "event-adjust",
      tenant_id: "tenant-1",
      project_id: "project-1",
      project_name: "张三施工项目",
      receivable_plan_id: "plan-1",
      event_type: "adjust_allocation",
      title: "调整核销金额",
      note: "金额修正",
      before_snapshot: { id: "allocation-1", amount: 800 },
      after_snapshot: {
        id: "allocation-1",
        amount: 1000,
        payment_id: "payment-1",
      },
      created_by: "employee-1",
      created_by_name: "财务甲",
      created_at: "2026-06-30T11:00:00.000Z",
    },
  ],
  total: 2,
}));

const listLedgerCorrectionAudits = mock(async () => ({
  list: [
    {
      id: "ledger-generated",
      tenant_id: "tenant-1",
      project_id: "project-3",
      project_name: "王五施工项目",
      amount: 3000,
      payment_id: "payment-generated",
      payment_linked_at: null,
      payment_linked_by: null,
      payment_linked_by_name: null,
      payment_link_reason: null,
      legacy_payment_ledger_marked_at: null,
      legacy_payment_ledger_marked_by: null,
      legacy_payment_ledger_marked_by_name: null,
      legacy_payment_ledger_reason: null,
      generated_ledger_at: "2026-06-30T13:00:00.000Z",
      generated_ledger_by: "employee-1",
      generated_ledger_by_name: "财务甲",
      generated_ledger_reason: "对账异常补入账",
      metadata: {
        operation: "generate_missing_project_payment_ledger",
        repair_reason: "对账异常补入账",
        repaired_by: "employee-1",
      },
    },
    {
      id: "ledger-1",
      tenant_id: "tenant-1",
      project_id: "project-1",
      project_name: "张三施工项目",
      amount: 1000,
      payment_id: "payment-1",
      payment_linked_at: "2026-06-30T12:00:00.000Z",
      payment_linked_by: "employee-2",
      payment_linked_by_name: "主管乙",
      payment_link_reason: "历史台账补关联",
      legacy_payment_ledger_marked_at: null,
      legacy_payment_ledger_marked_by: null,
      legacy_payment_ledger_marked_by_name: null,
      legacy_payment_ledger_reason: null,
      metadata: { operation: "link_ledger_payment" },
    },
    {
      id: "ledger-legacy",
      tenant_id: "tenant-1",
      project_id: "project-2",
      project_name: "李四施工项目",
      amount: 2000,
      payment_id: null,
      payment_linked_at: null,
      payment_linked_by: null,
      payment_linked_by_name: null,
      payment_link_reason: null,
      legacy_payment_ledger_marked_at: "2026-06-30T09:00:00.000Z",
      legacy_payment_ledger_marked_by: "employee-2",
      legacy_payment_ledger_marked_by_name: "主管乙",
      legacy_payment_ledger_reason: "2025 历史流水",
      metadata: { operation: "mark_legacy_ledger" },
    },
  ],
  total: 3,
}));

mock.module("@/repositories/finance-correction-audits", () => ({
  financeCorrectionAuditRepository: {
    listReceivableCorrectionEvents,
    listLedgerCorrectionAudits,
  },
}));

mock.module("@/services/access-policy", () => ({
  accessPolicyService: {
    assertTenantContext: mock((authContext: AuthContext) => authContext.tenantId),
    hasPermission: mock((authContext: AuthContext, permissionCode: string) =>
      authContext.permissions.some((permission) =>
        permission.code === permissionCode
      )
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

describe("financeCorrectionAuditService", () => {
  beforeEach(() => {
    listReceivableCorrectionEvents.mockClear();
    listLedgerCorrectionAudits.mockClear();
  });

  test("requires reconciliation manage permission", async () => {
    const { financeCorrectionAuditService } = await import(
      "./finance-correction-audits"
    );

    await expect(
      financeCorrectionAuditService.listAudits(
        authContextWithPermissions([
          { code: "finance.receivable.manage", scope: "all" },
        ]),
        { page: 1, pageSize: 20 },
      ),
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  test("merges receivable and ledger correction records sorted by occurrence time", async () => {
    const { financeCorrectionAuditService } = await import(
      "./finance-correction-audits"
    );

    const result = await financeCorrectionAuditService.listAudits(
      authContextWithPermissions([
        { code: "finance.reconciliation.manage", scope: "all" },
      ]),
      { page: 1, pageSize: 20 },
    );

    expect(result.summary).toEqual({
      total: 5,
      ledger_repair: 3,
      receivable_allocation: 2,
    });
    expect(result.list.map((item) => item.operation)).toEqual([
      "generate_payment_ledger",
      "link_ledger_payment",
      "adjust_allocation",
      "manual_allocation",
      "mark_legacy_ledger",
    ]);
    expect(result.list[0]).toMatchObject({
      id: "ledger:ledger-generated:generate_payment_ledger",
      operation_label: "补生成收款台账",
      domain: "ledger",
      project_name: "王五施工项目",
      actor_employee_name: "财务甲",
      payment_id: "payment-generated",
      ledger_id: "ledger-generated",
      reason: "对账异常补入账",
      target: {
        label: "查看台账流水",
        href: "/finance/ledger?ledger_id=ledger-generated",
      },
    });
    expect(result.list[1]).toMatchObject({
      id: "ledger:ledger-1:link_ledger_payment",
      operation_label: "关联收款",
      domain: "ledger",
      project_name: "张三施工项目",
      actor_employee_name: "主管乙",
      payment_id: "payment-1",
      ledger_id: "ledger-1",
      target: {
        label: "查看台账流水",
        href: "/finance/ledger?ledger_id=ledger-1",
      },
    });
    expect(result.list.at(2)?.allocation_id).toBe("allocation-1");
    expect(result.list[3]).toMatchObject({
      operation: "manual_allocation",
      allocation_id: null,
      target: {
        label: "查看应收计划",
        href: "/finance/receivables?project_id=project-1&receivable_plan_id=plan-1",
      },
    });
  });

  test("forwards filters and paginates after merging sources", async () => {
    const { financeCorrectionAuditService } = await import(
      "./finance-correction-audits"
    );

    const result = await financeCorrectionAuditService.listAudits(
      authContextWithPermissions([
        { code: "finance.reconciliation.manage", scope: "all" },
      ]),
      {
        page: 2,
        pageSize: 2,
        operation: "manual_allocation",
        project_id: "11111111-1111-4111-8111-111111111111",
        actor_employee_id: "22222222-2222-4222-8222-222222222222",
        date_from: "2026-06-01",
        date_to: "2026-06-30",
      },
    );

    expect(listReceivableCorrectionEvents).toHaveBeenCalledWith({
      tenantId: "tenant-1",
      query: {
        page: 2,
        pageSize: 2,
        operation: "manual_allocation",
        project_id: "11111111-1111-4111-8111-111111111111",
        actor_employee_id: "22222222-2222-4222-8222-222222222222",
        date_from: "2026-06-01",
        date_to: "2026-06-30",
      },
      candidateLimit: 4,
    });
    expect(listLedgerCorrectionAudits).toHaveBeenCalledWith({
      tenantId: "tenant-1",
      query: {
        page: 2,
        pageSize: 2,
        operation: "manual_allocation",
        project_id: "11111111-1111-4111-8111-111111111111",
        actor_employee_id: "22222222-2222-4222-8222-222222222222",
        date_from: "2026-06-01",
        date_to: "2026-06-30",
      },
      candidateLimit: 4,
    });
    expect(result.pagination).toEqual({
      page: 2,
      pageSize: 2,
      total: 5,
      totalPages: 3,
    });
    expect(result.list).toHaveLength(2);
  });

  test("schema caps page size and parses optional filters", async () => {
    const { FinanceCorrectionAuditListQuerySchema } = await import(
      "@/schema/finance-correction-audits"
    );

    const parsed = FinanceCorrectionAuditListQuerySchema.parse({
      page: "3",
      pageSize: "100",
      operation: "link_ledger_payment",
      project_id: "11111111-1111-4111-8111-111111111111",
      actor_employee_id: "22222222-2222-4222-8222-222222222222",
      date_from: "2026-06-01",
      date_to: "2026-06-30",
    });

    expect(parsed).toEqual({
      page: 3,
      pageSize: 100,
      operation: "link_ledger_payment",
      project_id: "11111111-1111-4111-8111-111111111111",
      actor_employee_id: "22222222-2222-4222-8222-222222222222",
      date_from: "2026-06-01",
      date_to: "2026-06-30",
    });
    expect(() =>
      FinanceCorrectionAuditListQuerySchema.parse({ pageSize: "101" })
    ).toThrow();
  });
});
