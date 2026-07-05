import { describe, expect, mock, test } from "bun:test";
import type { AuthContext } from "@/services/authorization";
import {
  reconciliationCandidateRows,
  reconciliationProjectSummaryTotals,
} from "@/services/finance-reconciliation.test-fixtures";

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
  permissions: [{ code: "finance.view", scope: "all" }],
} satisfies AuthContext;

describe("finance reconciliation project summary", () => {
  test("returns consistency flags and latest exception context", async () => {
    const { FinanceReconciliationService } = await import(
      "./finance-reconciliation"
    );
    const service = new FinanceReconciliationService({
      repository: {
        listCandidateRows: mock(async () => reconciliationCandidateRows),
        getProjectSummaryTotals: mock(async () => reconciliationProjectSummaryTotals),
      },
      actionsRepository: {
        listLatestActions: mock(async () => new Map()),
        listActions: mock(async () => ({
          list: [],
          pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 },
        })),
        createAction: mock(async () => {
          throw new Error("not used");
        }),
      },
      accessPolicyService: {
        assertTenantContext: mock(() => "tenant-1"),
        hasPermission: mock((context: AuthContext, permissionCode: string) =>
          context.permissions.some((permission) =>
            permission.code === permissionCode
          )
        ),
        canAccessProject: mock(async () => true),
      },
      now: () => new Date("2026-06-30T08:00:00.000Z"),
    });

    const result = await service.getProjectSummary(authContext, "project-1");

    expect(result).toMatchObject({
      highest_exception_level: "danger",
      latest_exception_code: "receivable_paid_amount_mismatch",
      latest_exception_title: "应收已收金额与核销不一致",
      income_ledger_consistent: true,
      payment_allocation_consistent: false,
      expense_ledger_consistent: true,
    });
  });
});
