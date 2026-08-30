import { describe, expect, mock, test } from "bun:test";

import type { AuthContext } from "@/services/authorization";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

const TENANT_ID = "6a000000-0000-4000-8000-000000000001";
const PROJECT_ID = "6a000000-0000-4000-8000-000000000002";
const EMPLOYEE_ID = "6a000000-0000-4000-8000-000000000003";
const OTHER_EMPLOYEE_ID = "6a000000-0000-4000-8000-000000000004";
const REVIEW_BATCH_ID = "6a000000-0000-4000-8000-000000000005";
const OWN_BATCH_ID = "6a000000-0000-4000-8000-000000000006";
const REVIEW_INSTANCE_ID = "6a000000-0000-4000-8000-000000000007";
const OWN_INSTANCE_ID = "6a000000-0000-4000-8000-000000000008";

const auth: AuthContext = {
  authUserId: "6a000000-0000-4000-8000-000000000009",
  employeeId: EMPLOYEE_ID,
  tenantId: TENANT_ID,
  tenantName: "测试租户",
  tenantSlug: "test",
  tenantStatus: "active",
  isPlatformAdmin: false,
  employeeName: "审批人",
  employeeStatus: "active",
  departmentId: null,
  tenantDepartmentId: null,
  departmentCode: null,
  departmentName: null,
  postId: null,
  postName: null,
  avatar: null,
  roleCodes: ["purchase_reviewer"],
  roles: [],
  permissions: [
    { code: "supplier.purchase-requisition.view", scope: "all" },
    { code: "supplier.purchase-requisition.manage", scope: "all" },
    { code: "supplier.purchase-requisition.approve", scope: "all" },
    { code: "project.read", scope: "all" },
    { code: "project.update", scope: "all" },
  ],
};

function batch(id: string, submittedByEmployeeId: string) {
  return {
    id,
    tenant_id: TENANT_ID,
    project_id: PROJECT_ID,
    status: "pending_approval" as const,
    version: 2,
    budget_status: "within_budget",
    created_by_employee_id: submittedByEmployeeId,
    submitted_by_employee_id: submittedByEmployeeId,
  };
}

function state(subjectId: string, instanceId: string) {
  return {
    id: `state-${subjectId}`,
    tenant_id: TENANT_ID,
    subject_type: "supplier_purchase_batch" as const,
    subject_id: subjectId,
    definition_id: "6a000000-0000-4000-8000-000000000010",
    instance_id: instanceId,
    instance_status: "running" as const,
    current_node_key: "purchase_review",
    current_node_title: "采购审批",
    current_business_kind: null,
    pending_task_count: 1,
    created_at: "2026-08-30T00:00:00.000Z",
    updated_at: "2026-08-30T00:00:00.000Z",
  };
}

function dependencies() {
  const page = {
    list: [
      batch(REVIEW_BATCH_ID, OTHER_EMPLOYEE_ID),
      batch(OWN_BATCH_ID, EMPLOYEE_ID),
    ],
    pagination: { page: 1, pageSize: 20, total: 2, totalPages: 1 },
  };
  const listSubjectStates = mock(async () => [
    state(REVIEW_BATCH_ID, REVIEW_INSTANCE_ID),
    state(OWN_BATCH_ID, OWN_INSTANCE_ID),
  ]);
  const pendingTask = {
    id: "6a000000-0000-4000-8000-000000000011",
    tenant_id: TENANT_ID,
    instance_id: REVIEW_INSTANCE_ID,
    node_key: "purchase_review",
    node_type: "approval",
    title: "采购审批",
    status: "pending",
    assignee_employee_id: EMPLOYEE_ID,
    assignee_role_code: null,
    assignee_permission_code: null,
    instance: {
      id: REVIEW_INSTANCE_ID,
      subject_type: "supplier_purchase_batch",
      subject_id: REVIEW_BATCH_ID,
      status: "running",
      current_node_key: "purchase_review",
      current_node_snapshot: {
        node_type: "approval",
        config: {
          required_permissions: ["supplier.purchase-requisition.approve"],
        },
      },
    },
  };
  const listAccessiblePendingTasks = mock(async () => [pendingTask]);
  const buildTaskActions = mock(async () => [{
    key: "approve",
    label: "审批通过",
    business_domain: "supplier_purchase_batch",
    business_action: "approve",
    requires_reason: false,
    output_fields: [],
    task_id: "6a000000-0000-4000-8000-000000000011",
    node_key: "purchase_review",
    node_type: "approval",
    disabled: false,
  }]);
  const getState = mock(async () => ({
    workflow_state: {
      instance_id: REVIEW_INSTANCE_ID,
      instance_status: "running",
      current_node_key: "purchase_review",
      current_node_title: "采购审批",
      pending_task_count: 1,
      actions: await buildTaskActions(),
      timeline_nodes: [{
        node_key: "purchase_review",
        node_title: "采购审批",
        node_type: "approval",
        status: "current",
        actions: [],
      }],
    },
  }));
  return {
    page,
    listSubjectStates,
    listAccessiblePendingTasks,
    buildTaskActions,
    getState,
    pendingTask,
    access: {
      requireView: mock(async () => ({
        tenantId: TENANT_ID,
        authUserId: auth.authUserId!,
        employeeId: EMPLOYEE_ID,
      })),
      requireManage: mock(async () => ({})),
      requireApprove: mock(async () => ({})),
      requireFinanceBudgetManage: mock(() => undefined),
      getVisibleProjectIds: mock(async () => [PROJECT_ID]),
      getVisibleProjectUpdateIds: mock(async () => [PROJECT_ID]),
      assertProjectRead: mock(async () => undefined),
      assertProjectUpdate: mock(async () => undefined),
    },
    repository: {
      listBatches: mock(async () => page),
      findBatch: mock(async () => page.list[0]),
    },
    workflowRuntime: {
      isEnabled: mock(async () => true),
      submit: mock(async () => ({})),
    },
    workflowRead: {
      listSubjectStates,
      listAccessiblePendingTasks,
      buildTaskActions,
      getState,
    },
  };
}

describe("SupplierPurchaseBatchesService workflow read projection", () => {
  test("loads one page of states and tasks in two bounded bulk queries", async () => {
    const deps = dependencies();
    const { SupplierPurchaseBatchesService } = await import(
      "./supplier-purchase-batches"
    );
    const service = new SupplierPurchaseBatchesService(deps as never);

    const result = await service.listBatches(auth, { page: 1, pageSize: 20 });

    expect(deps.listSubjectStates).toHaveBeenCalledTimes(1);
    expect(deps.listAccessiblePendingTasks).toHaveBeenCalledTimes(1);
    expect(deps.listSubjectStates).toHaveBeenCalledWith({
      tenantId: TENANT_ID,
      subjectType: "supplier_purchase_batch",
      subjectIds: [REVIEW_BATCH_ID, OWN_BATCH_ID],
    });
    expect(deps.listAccessiblePendingTasks).toHaveBeenCalledWith({
      tenantId: TENANT_ID,
      subjectType: "supplier_purchase_batch",
      subjectIds: [REVIEW_BATCH_ID, OWN_BATCH_ID],
      employeeId: EMPLOYEE_ID,
      roleCodes: ["purchase_reviewer"],
      permissionCodes: [
        "supplier.purchase-requisition.view",
        "supplier.purchase-requisition.manage",
        "supplier.purchase-requisition.approve",
        "project.read",
        "project.update",
      ],
      limit: 100,
    });
    expect(result.list[0]).toMatchObject({
      workflow_state: {
        instance_id: REVIEW_INSTANCE_ID,
        instance_status: "running",
        current_node_key: "purchase_review",
        pending_task_count: 1,
        actions: [{ key: "approve" }],
      },
      actions: { can_review: true, can_withdraw: false },
    });
    expect(result.list[1]).toMatchObject({
      workflow_state: {
        instance_id: OWN_INSTANCE_ID,
        actions: [],
      },
      actions: { can_review: false, can_withdraw: true },
    });
  });

  test("returns detail timeline without granting a fixed-permission bypass", async () => {
    const deps = dependencies();
    deps.listAccessiblePendingTasks.mockImplementation(async () => []);
    const { SupplierPurchaseBatchesService } = await import(
      "./supplier-purchase-batches"
    );
    const service = new SupplierPurchaseBatchesService(deps as never);

    const detail = await service.getBatch(auth, REVIEW_BATCH_ID);

    expect(detail).toMatchObject({
      workflow_state: {
        timeline_nodes: [{ node_key: "purchase_review" }],
      },
      actions: { can_review: false },
    });
    expect(deps.getState).toHaveBeenCalledWith(
      auth,
      {
        subjectType: "supplier_purchase_batch",
        subjectId: REVIEW_BATCH_ID,
      },
      expect.objectContaining({ actionsPromise: expect.any(Promise) }),
    );
  });

  test("does not expose actions to a non-assignee", async () => {
    const deps = dependencies();
    deps.listAccessiblePendingTasks.mockImplementation(async () => [{
      ...deps.pendingTask,
      assignee_employee_id: OTHER_EMPLOYEE_ID,
    }] as never);
    const { SupplierPurchaseBatchesService } = await import(
      "./supplier-purchase-batches"
    );
    const service = new SupplierPurchaseBatchesService(deps as never);

    const result = await service.listBatches(auth, { page: 1, pageSize: 20 });

    expect(result.list[0]).toMatchObject({
      workflow_state: { actions: [] },
      actions: { can_review: false },
    });
  });
});
