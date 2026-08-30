import { beforeEach, describe, expect, mock, test } from "bun:test";
import type { AuthContext } from "@/services/authorization";

const listAccessibleTasks = mock(async () => ({
  list: [],
  pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 },
}));
const listAccessibleSupplierPurchaseBatchTasks = mock(async () => ({
  list: [],
  pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 },
}));
const getVisibleProjectIds = mock(async () => ["project-1"] as string[] | null);
const listSupplierPurchaseBatchSummariesByIds = mock(async () => []);

mock.module("@/repositories/workflow-tasks", () => ({
  workflowTaskRepository: {
    listAccessibleTasks,
    listAccessibleSupplierPurchaseBatchTasks,
  },
}));

mock.module("@/services/access-policy", () => ({
  accessPolicyService: {
    assertTenantId: (auth: AuthContext) => auth.tenantId,
    hasPermission: (auth: AuthContext, code: string) =>
      auth.permissions.some((permission) => permission.code === code),
    getVisibleProjectIds,
  },
}));

mock.module("@/repositories/workflow-task-card-context", () => ({
  workflowTaskCardContextRepository: {
    listProjectSummariesByIds: mock(async () => []),
    listCustomerSummariesByIds: mock(async () => []),
    listExpenseRequestSummariesByIds: mock(async () => []),
    listProjectReceivableSummaries: mock(async () => []),
    listProjectAcceptanceSummariesByProjectIds: mock(async () => []),
    listSupplierPurchaseBatchSummariesByIds,
    listEmployeeSummariesByIds: mock(async () => []),
  },
}));

mock.module("@/repositories/workflows", () => ({
  workflowRepository: {},
}));

mock.module("@/services/project-procedure-assignments", () => ({
  projectProcedureAssignmentService: {
    listProjectAssignmentsForRuntime: mock(async () => []),
  },
}));

mock.module("@/services/project-workflow-progress", () => ({
  projectWorkflowProgressService: { invalidateProject: mock(() => undefined) },
}));

mock.module("@/services/workflow-runtime-guards", () => ({
  assertRuntimeNodeCompletionAllowed: mock(async () => undefined),
}));

mock.module("@/services/workflow-subject-state", () => ({
  workflowSubjectStateService: {
    syncFromRuntimeInstance: mock(async () => null),
  },
}));

mock.module("@/services/workflow-task-customer-bridge", () => ({
  workflowTaskCustomerBridge: { complete: mock(async () => null) },
}));

mock.module("@/services/workflow-task-expense-bridge", () => ({
  workflowTaskExpenseBridge: { complete: mock(async () => null) },
}));

mock.module("@/services/workflow-task-payment-bridge", () => ({
  workflowTaskPaymentBridge: { complete: mock(async () => null) },
}));

mock.module("@/services/workflow-task-project-bridge", () => ({
  shouldRequireProjectWorkflowRebuild: mock(() => false),
  workflowTaskProjectBridge: { complete: mock(async () => null) },
}));

mock.module("@/services/workflow-supplier-purchase-batch-boundary", () => ({
  assertGenericWorkflowMutationAllowed: mock(() => undefined),
}));

describe("workflowTaskService supplier purchase batch list access", () => {
  beforeEach(() => {
    listAccessibleTasks.mockClear();
    listAccessibleSupplierPurchaseBatchTasks.mockClear();
    getVisibleProjectIds.mockClear();
    getVisibleProjectIds.mockImplementation(async () => ["project-1"]);
    listSupplierPurchaseBatchSummariesByIds.mockClear();
  });

  test("returns an empty page without view permission before repository or card queries", async () => {
    const { workflowTaskService } = await import("./workflow-tasks");

    const result = await workflowTaskService.listTasks(authContext({
      permissions: [{ code: "project.read", scope: "all" }],
    }), supplierQuery());

    expect(result).toEqual({
      list: [],
      pagination: { page: 2, pageSize: 10, total: 0, totalPages: 0 },
    });
    expect(getVisibleProjectIds).not.toHaveBeenCalled();
    expect(listAccessibleSupplierPurchaseBatchTasks).not.toHaveBeenCalled();
    expect(listAccessibleTasks).not.toHaveBeenCalled();
    expect(listSupplierPurchaseBatchSummariesByIds).not.toHaveBeenCalled();
  });

  test("returns an empty page when project.read has no visible projects", async () => {
    const { workflowTaskService } = await import("./workflow-tasks");
    getVisibleProjectIds.mockImplementationOnce(async () => []);

    const result = await workflowTaskService.listTasks(authContext(), supplierQuery());

    expect(result.pagination).toEqual({
      page: 2,
      pageSize: 10,
      total: 0,
      totalPages: 0,
    });
    expect(listAccessibleSupplierPurchaseBatchTasks).not.toHaveBeenCalled();
    expect(listSupplierPurchaseBatchSummariesByIds).not.toHaveBeenCalled();
  });

  test("passes visible project scope and submitter exclusion to the supplier repository", async () => {
    const { workflowTaskService } = await import("./workflow-tasks");

    await workflowTaskService.listTasks(authContext(), supplierQuery({
      subject_id: "batch-1",
    }));

    expect(listAccessibleSupplierPurchaseBatchTasks).toHaveBeenCalledWith({
      tenantId: "tenant-1",
      employeeId: "employee-1",
      roleCodes: ["purchase_reviewer"],
      permissionCodes: [
        "supplier.purchase-requisition.view",
        "project.read",
        "supplier.purchase-requisition.approve",
      ],
      visibleProjectIds: ["project-1"],
      page: 2,
      pageSize: 10,
      status: "pending",
      subjectId: "batch-1",
    });
    expect(listAccessibleTasks).not.toHaveBeenCalled();
  });

  test("preserves null project scope for all-project access", async () => {
    const { workflowTaskService } = await import("./workflow-tasks");
    getVisibleProjectIds.mockImplementationOnce(async () => null);

    await workflowTaskService.listTasks(authContext(), supplierQuery());

    expect(listAccessibleSupplierPurchaseBatchTasks).toHaveBeenCalledWith(
      expect.objectContaining({
        employeeId: "employee-1",
        visibleProjectIds: null,
      }),
    );
  });

  test("keeps other subject types on the generic repository path", async () => {
    const { workflowTaskService } = await import("./workflow-tasks");

    await workflowTaskService.listTasks(authContext(), {
      page: 1,
      pageSize: 20,
      status: "pending",
      subject_type: "project",
    });

    expect(listAccessibleTasks).toHaveBeenCalledTimes(1);
    expect(listAccessibleSupplierPurchaseBatchTasks).not.toHaveBeenCalled();
    expect(getVisibleProjectIds).not.toHaveBeenCalled();
  });

  test("denies supplier rows inside an unfiltered mixed page without view permission", async () => {
    const { workflowTaskService } = await import("./workflow-tasks");

    await workflowTaskService.listTasks(authContext({
      permissions: [{ code: "project.read", scope: "all" }],
    }), {
      page: 1,
      pageSize: 20,
      status: "pending",
    });

    expect(listAccessibleTasks).toHaveBeenCalledWith(expect.objectContaining({
      subjectType: undefined,
      supplierPurchaseBatchAccess: null,
    }));
    expect(getVisibleProjectIds).not.toHaveBeenCalled();
  });

  test("passes supplier project and self scope into an unfiltered mixed page", async () => {
    const { workflowTaskService } = await import("./workflow-tasks");

    await workflowTaskService.listTasks(authContext(), {
      page: 1,
      pageSize: 20,
      status: "pending",
      subject_id: "batch-1",
    });

    expect(listAccessibleTasks).toHaveBeenCalledWith(expect.objectContaining({
      subjectType: undefined,
      subjectId: "batch-1",
      supplierPurchaseBatchAccess: {
        employeeId: "employee-1",
        visibleProjectIds: ["project-1"],
      },
    }));
  });
});

function supplierQuery(overrides: Record<string, unknown> = {}) {
  return {
    page: 2,
    pageSize: 10,
    status: "pending" as const,
    subject_type: "supplier_purchase_batch" as const,
    ...overrides,
  };
}

function authContext(overrides: Partial<AuthContext> = {}): AuthContext {
  return {
    authUserId: "auth-1",
    employeeId: "employee-1",
    tenantId: "tenant-1",
    tenantStatus: "active",
    isPlatformAdmin: false,
    employeeName: "采购审批人",
    employeeStatus: "active",
    roleCodes: ["purchase_reviewer"],
    roles: [],
    permissions: [
      { code: "supplier.purchase-requisition.view", scope: "all" },
      { code: "project.read", scope: "self" },
      { code: "supplier.purchase-requisition.approve", scope: "all" },
    ],
    tenantName: null,
    tenantSlug: null,
    departmentId: null,
    tenantDepartmentId: null,
    departmentCode: null,
    departmentName: null,
    postId: null,
    postName: null,
    avatar: null,
    ...overrides,
  };
}
