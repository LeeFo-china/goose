import { beforeEach, describe, expect, mock, test } from "bun:test";
import type { AuthContext } from "@/services/authorization";

const project = {
  id: "project-1",
  tenant_id: "tenant-1",
  name: "测试项目",
  customer_id: "customer-1",
  status: "constructing",
};

const acceptanceRow = {
  id: "acceptance-1",
  tenant_id: "tenant-1",
  project_id: project.id,
  acceptance_type: "stage",
  stage_code: "plumbing_electrical",
  template_id: "template-1",
  template_version: 1,
  template_snapshot: null,
  title: "水电验收",
  status: "draft",
  initiator_id: "employee-1",
  reviewer_id: "reviewer-1",
  customer_id: project.customer_id,
  summary: null,
  submitted_at: null,
  reviewed_at: null,
  customer_confirmed_at: null,
  completed_at: null,
  rejected_at: null,
  reject_reason: null,
  reject_source: null,
  created_at: "2026-06-19T00:00:00.000Z",
  updated_at: "2026-06-19T00:00:00.000Z",
};

const getProject = mock(async () => project);
const hasOpenAcceptance = mock(async () => null);
const createAcceptanceRow = mock(async () => acceptanceRow);
const createItems = mock(async () => undefined);
const assertCanCreateProjectAcceptance = mock(() => undefined);
const assertProjectWorkflowStageMutationAllowed = mock(async () => undefined);
const legacyAssertCanCreateAcceptance = mock(async () => {
  throw new Error("请先完成拆改验收后再进入水电");
});

mock.module("@/repositories/project-acceptances", () => ({
  projectAcceptanceRepository: {
    getProject,
    hasOpenAcceptance,
    createAcceptance: createAcceptanceRow,
    createItems,
  },
}));

mock.module("@/services/project-status", () => ({
  projectStatusService: {
    assertCanCreateProjectAcceptance,
  },
}));

mock.module("@/services/project-workflow-mutation-guards", () => ({
  assertProjectWorkflowStageMutationAllowed,
}));

mock.module("@/services/construction-stage-status", () => ({
  constructionStageStatusService: {
    assertCanCreateAcceptance: legacyAssertCanCreateAcceptance,
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
  employeeName: "工程负责人",
  employeeStatus: "active",
  departmentId: null,
  tenantDepartmentId: null,
  departmentCode: "ENGINEERING",
  departmentName: "工程部",
  postId: null,
  postName: null,
  avatar: null,
  roleCodes: [],
  roles: [],
  permissions: [],
} satisfies AuthContext;

const serviceContext = {
  assertCurrentEmployee: mock(() => "employee-1"),
  requireTenantId: mock(() => "tenant-1"),
  assertCanCreate: mock(async () => undefined),
  assertCanCreateFinalAcceptance: mock(async () => undefined),
  assertCanCreateFinalAcceptanceForProject: mock(async () => undefined),
  resolveTemplate: mock(async () => ({
    template: {
      id: "template-1",
      version: 1,
      name: "阶段验收模板",
    },
    items: [{
      id: "template-item-1",
      section_id: null,
      category: "standard",
      title: "检查项",
      standard: null,
      required: true,
      allow_not_applicable: false,
      photo_required: false,
      photo_min_count: 0,
      photo_max_count: null,
      remark_required_on_fail: false,
      sort_order: 1,
    }],
  })),
  resolveReviewer: mock(async () => "reviewer-1"),
  buildTemplateDetail: mock(async () => null),
  recordAction: mock(async () => undefined),
  invalidateAcceptanceRelatedCaches: mock(() => undefined),
  buildDetail: mock((row: typeof acceptanceRow) => row),
  buildCreateSummary: mock((row: typeof acceptanceRow) => ({
    id: row.id,
    project_id: row.project_id,
    acceptance_type: row.acceptance_type,
    stage_code: row.stage_code,
    status: row.status,
    created_at: row.created_at,
    stage_label: "水电",
  })),
};

describe("createAcceptance", () => {
  beforeEach(() => {
    getProject.mockClear();
    hasOpenAcceptance.mockClear();
    createAcceptanceRow.mockClear();
    createItems.mockClear();
    assertCanCreateProjectAcceptance.mockClear();
    assertProjectWorkflowStageMutationAllowed.mockClear();
    legacyAssertCanCreateAcceptance.mockClear();
    serviceContext.recordAction.mockClear();
    serviceContext.invalidateAcceptanceRelatedCaches.mockClear();
  });

  test("does not apply legacy previous-stage acceptance gate when workflow runtime allows stage acceptance", async () => {
    const { createAcceptance } = await import("./create-update");

    const result = await createAcceptance.call(
      serviceContext,
      authContext,
      {
        project_id: project.id,
        acceptance_type: "stage",
        stage_code: "plumbing_electrical",
      },
    );

    expect(result).toMatchObject({
      id: "acceptance-1",
      project_id: project.id,
      stage_code: "plumbing_electrical",
      status: "draft",
    });
    expect(assertProjectWorkflowStageMutationAllowed).toHaveBeenCalledWith({
      tenantId: "tenant-1",
      projectId: project.id,
      stageCode: "plumbing_electrical",
      mutation: "create_stage_acceptance",
    });
    expect(legacyAssertCanCreateAcceptance).not.toHaveBeenCalled();
    expect(createAcceptanceRow).toHaveBeenCalledWith(
      expect.objectContaining({
        project_id: project.id,
        stage_code: "plumbing_electrical",
        status: "draft",
      }),
    );
  });
});
