import { describe, expect, mock, test } from "bun:test";
import type { AuthContext } from "@/services/authorization";
import { reconciliationCandidateRows } from "@/services/finance-reconciliation.test-fixtures";

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

describe("finance reconciliation exception action targets", () => {
  test("points every exception type to the manual correction page", async () => {
    const { FinanceReconciliationService } = await import(
      "./finance-reconciliation"
    );
    const service = new FinanceReconciliationService({
      repository: {
        listCandidateRows: mock(async () => reconciliationCandidateRows),
        getProjectSummaryTotals: mock(async () => null),
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
    });

    const result = await service.listExceptions(authContext, {
      page: 1,
      pageSize: 20,
      date_from: "2026-06-01",
      date_to: "2026-06-30",
    });

    expect(
      Object.fromEntries(
        result.list.map((item) => [item.exception_code, item.action]),
      ),
    ).toMatchObject({
      receivable_overdue: {
        key: "open_receivable_overdue",
        label: "去处理",
        target:
          "/finance/receivables?project_id=project-1&status=overdue&receivable_plan_id=plan-overdue",
      },
      payment_without_ledger: {
        key: "open_project_payment_ledger",
        label: "去处理",
        target:
          "/finance/ledger?project_id=project-3&direction=in&entry_type=project_payment&payment_id=payment-without-ledger",
      },
      ledger_without_payment: {
        key: "open_ledger",
        label: "去处理",
        target:
          "/finance/ledger?project_id=project-7&direction=in&entry_type=project_payment&ledger_id=ledger-without-payment",
      },
      payment_unallocated: {
        key: "open_receivables",
        label: "去处理",
        target: "/finance/receivables?project_id=project-4",
      },
      allocation_amount_mismatch: {
        key: "open_receivables",
        label: "去处理",
        target: "/finance/receivables?project_id=project-5",
      },
      receivable_paid_amount_mismatch: {
        key: "open_receivables",
        label: "去处理",
        target: "/finance/receivables?project_id=project-2",
      },
    });
  });
});
