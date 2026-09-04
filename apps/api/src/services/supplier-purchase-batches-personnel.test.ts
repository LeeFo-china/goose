import { describe, expect, mock, test } from "bun:test";

import type { AuthContext } from "@/services/authorization";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

const TENANT_ID = "69000000-0000-4000-8000-000000000001";
const BATCH_ID = "69000000-0000-4000-8000-000000000002";
const PROJECT_ID = "69000000-0000-4000-8000-000000000003";
const USER_ID = "69000000-0000-4000-8000-000000000004";
const EMPLOYEE_ID = "69000000-0000-4000-8000-000000000005";
const CREATOR_ID = "69000000-0000-4000-8000-000000000006";
const SUBMITTER_ID = "69000000-0000-4000-8000-000000000007";
const REVIEWER_ID = "69000000-0000-4000-8000-000000000008";

const auth = {
  authUserId: USER_ID,
  employeeId: EMPLOYEE_ID,
  tenantId: TENANT_ID,
  roleCodes: [],
  permissions: [],
} as unknown as AuthContext;

function baseDependencies() {
  const scope = { tenantId: TENANT_ID, authUserId: USER_ID, employeeId: EMPLOYEE_ID };
  return {
    access: {
      requireView: mock(async () => scope),
      requireActorScope: mock(async () => scope),
      requireManage: mock(async () => scope),
      requireApprove: mock(async () => scope),
      requireFinanceBudgetManage: mock(() => undefined),
      getVisibleProjectIds: mock(async () => [PROJECT_ID]),
      getVisibleProjectUpdateIds: mock(async () => [PROJECT_ID]),
      assertProjectRead: mock(async () => undefined),
      assertProjectUpdate: mock(async () => undefined),
    },
    repository: {
      listBatches: mock(async () => ({
        list: [] as unknown[],
        pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 },
      })),
      findBatch: mock(async () => null),
      listItems: mock(async () => ({ list: [], pagination: emptyPagination() })),
      listRequisitions: mock(async () => ({ list: [], pagination: emptyPagination() })),
      listOrders: mock(async () => ({ list: [], pagination: emptyPagination() })),
      listProjectOptions: mock(async () => ({ list: [], pagination: emptyPagination() })),
      listCostCategories: mock(async () => ({ list: [], pagination: emptyPagination() })),
      listCatalog: mock(async () => ({ list: [], pagination: emptyPagination() })),
      resolveCostCategoryDefaults: mock(async () => []),
      saveDraft: mock(async () => ({})),
      submit: mock(async () => ({})),
      review: mock(async () => ({})),
      cancel: mock(async () => ({})),
    },
    workflowRuntime: {
      isEnabled: mock(async () => false),
      submit: mock(async () => ({})),
    },
    workflowRepository: { withdraw: mock(async () => ({})) },
    workflowReviewBridge: {
      completeLegacyReview: mock(async () => ({})),
      replayExactLegacyReview: mock(async () => ({ matched: false })),
    },
    nowFactory: () => new Date("2026-08-27T03:04:05.000Z"),
  };
}

describe("SupplierPurchaseBatchesService personnel projection", () => {
  test("exposes readable applicant creator and approval summary on list items", async () => {
    const deps = baseDependencies();
    deps.repository.listBatches.mockImplementation(async () => ({
      list: [batch("ordered")],
      pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
    }));
    const service = await serviceFor(deps);

    const result = await service.listBatches(auth, { page: 1, pageSize: 20 });

    expect(result.list[0]).toMatchObject({
      creator: employee(CREATOR_ID, "采购创建人", "188****3001", null),
      applicant: employee(SUBMITTER_ID, "采购申请人", "188****3002", "项目经理"),
      approval_summary: {
        status: "approved",
        current_approvers: [],
        last_reviewer: employee(REVIEWER_ID, "审批负责人", "188****3003", "采购审批"),
        reviewed_at: "2026-08-27T03:00:00.000Z",
        rejected_at: null,
        review_remark: "同意采购",
      },
    });
  });

  test("exposes current approvers from pending workflow tasks in one bulk read", async () => {
    const deps = baseDependencies();
    deps.workflowRuntime.isEnabled.mockImplementation(async () => true);
    deps.repository.listBatches.mockImplementation(async () => ({
      list: [batch("pending_approval")],
      pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
    }));
    const workflowTasks = {
      listPendingBySubjectIds: mock(async () => [{
        assignee_employee_id: REVIEWER_ID,
        assignee_employee: { id: REVIEWER_ID, name: "当前审批人" },
        instance: {
          subject_type: "supplier_purchase_batch",
          subject_id: BATCH_ID,
        },
      }]),
    };
    Object.assign(deps, {
      workflowProjection: {
        enrichPage: mock(async ({ page }: { page: unknown }) => page),
        enrichDetail: mock(async ({ batch }: { batch: unknown }) => batch),
      },
      workflowTasks,
    });
    const service = await serviceFor(deps);

    const result = await service.listBatches(auth, { page: 1, pageSize: 20 });

    expect(workflowTasks.listPendingBySubjectIds).toHaveBeenCalledWith({
      tenantId: TENANT_ID,
      subjectType: "supplier_purchase_batch",
      subjectIds: [BATCH_ID],
      limit: 3,
    });
    expect(result.list[0]?.approval_summary).toMatchObject({
      status: "pending",
      current_approvers: [
        employee(REVIEWER_ID, "当前审批人", null, null),
      ],
      last_reviewer: null,
      reviewed_at: null,
      rejected_at: null,
    });
  });
});

async function serviceFor(deps: ReturnType<typeof baseDependencies>) {
  const { SupplierPurchaseBatchesService } = await import(
    "./supplier-purchase-batches"
  );
  return new SupplierPurchaseBatchesService(deps as never);
}

function batch(status: string) {
  return {
    id: BATCH_ID,
    tenant_id: TENANT_ID,
    project_id: PROJECT_ID,
    status,
    created_by_employee_id: CREATOR_ID,
    submitted_by_employee_id: SUBMITTER_ID,
    submitted_at: "2026-08-27T02:00:00.000Z",
    reviewed_by_employee_id: status === "pending_approval" ? null : REVIEWER_ID,
    reviewed_at: status === "pending_approval" ? null : "2026-08-27T03:00:00.000Z",
    review_remark: status === "pending_approval" ? null : "同意采购",
    creator_snapshot: employee(CREATOR_ID, "采购创建人", "188****3001", null),
    applicant_snapshot: employee(SUBMITTER_ID, "采购申请人", "188****3002", "项目经理"),
    last_reviewer_snapshot: status === "pending_approval"
      ? null
      : employee(REVIEWER_ID, "审批负责人", "188****3003", "采购审批"),
  };
}

function employee(
  employeeId: string,
  name: string,
  phoneMasked: string | null,
  roleName: string | null,
) {
  return {
    employee_id: employeeId,
    name,
    phone_masked: phoneMasked,
    role_name: roleName,
  };
}

function emptyPagination() {
  return { page: 1, pageSize: 20, total: 0, totalPages: 0 };
}
