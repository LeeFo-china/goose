import { beforeEach, describe, expect, mock, test } from "bun:test";
import type { AuthContext } from "@/services/authorization";

type DisplayStatusStore = {
  acceptanceRows: Array<{ project_id: string | null }>;
  eqCalls: Array<readonly [string, unknown]>;
  inCalls: Array<readonly [string, unknown[]]>;
  fromCalls: string[];
};

function getDisplayStatusStore(): DisplayStatusStore {
  const source = globalThis as typeof globalThis & {
    __projectDisplayStatusStore?: DisplayStatusStore;
  };
  source.__projectDisplayStatusStore ??= {
    acceptanceRows: [],
    eqCalls: [],
    inCalls: [],
    fromCalls: [],
  };
  return source.__projectDisplayStatusStore;
}

class ProjectAcceptancesQuery {
  select() {
    return this;
  }

  eq(column: string, value: unknown) {
    getDisplayStatusStore().eqCalls.push([column, value]);
    return this;
  }

  in(column: string, values: unknown[]) {
    getDisplayStatusStore().inCalls.push([column, values]);
    return this;
  }

  then<TResult1 = {
    data: Array<{ project_id: string | null }>;
    error: null;
  }, TResult2 = never>(
    onfulfilled?: ((value: {
      data: Array<{ project_id: string | null }>;
      error: null;
    }) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    return Promise.resolve({
      data: getDisplayStatusStore().acceptanceRows,
      error: null,
    }).then(onfulfilled, onrejected);
  }
}

let resolveProjectDetail:
  | ((value: Record<string, unknown> | null) => void)
  | null = null;
let isProjectDetailPending = false;

const canAccessProject = mock(async () => true);
const assertTenantContext = mock((authContext: AuthContext) => {
  if (!authContext.tenantId) throw new Error("missing tenant");
  return authContext.tenantId;
});
const findDetailById = mock(() => {
  isProjectDetailPending = true;
  return new Promise<Record<string, unknown> | null>((resolve) => {
    resolveProjectDetail = (value) => {
      isProjectDetailPending = false;
      resolve(value);
    };
  });
});
const listPrimaryAssigneesByProjectIds = mock(async () => []);
const listProjectMembers = mock(async () => []);

mock.module("@/repositories/projects", () => ({
  projectRepository: {
    findDetailById,
  },
}));

mock.module("@/repositories/workflows", () => ({
  workflowRepository: {},
}));

mock.module("@/utils/supabase", () => ({
  SupabaseDB: {
    getAdminClient: () => ({
      from: (table: string) => {
        getDisplayStatusStore().fromCalls.push(table);
        return new ProjectAcceptancesQuery();
      },
    }),
  },
}));

mock.module("@/services/access-policy", () => ({
  accessPolicyService: {
    assertTenantContext,
    canAccessProject,
  },
}));

mock.module("@/services/construction-stage-status", () => ({
  constructionStageStatusService: {},
}));

mock.module("@/services/project-members", () => ({
  projectMemberService: {
    listPrimaryAssigneesByProjectIds,
    listProjectMembers,
    buildDerivedCustomerOwnerMember: () => null,
  },
}));

mock.module("@/services/project-status", () => ({
  projectStatusService: {},
}));

beforeEach(() => {
  resolveProjectDetail = null;
  isProjectDetailPending = false;
  canAccessProject.mockClear();
  assertTenantContext.mockClear();
  findDetailById.mockClear();
  listPrimaryAssigneesByProjectIds.mockClear();
  listProjectMembers.mockClear();
  const store = getDisplayStatusStore();
  store.acceptanceRows.length = 0;
  store.eqCalls.length = 0;
  store.inCalls.length = 0;
  store.fromCalls.length = 0;
});

function buildAuthContext(): AuthContext {
  return {
    authUserId: "auth-user",
    employeeId: "employee-1",
    tenantId: "tenant-1",
    tenantName: null,
    tenantSlug: null,
    tenantStatus: "active",
    isPlatformAdmin: false,
    employeeName: null,
    employeeStatus: "active",
    departmentId: null,
    tenantDepartmentId: "department-1",
    departmentCode: "PROJECT",
    departmentName: "工程部",
    postId: null,
    postName: null,
    avatar: null,
    roleCodes: [],
    roles: [],
    permissions: [{ code: "project.read", scope: "self" }],
  };
}

describe("project detail bootstrap", () => {
  test("starts primary assignee lookup while project detail lookup is pending", async () => {
    const { projectSer } = await import("@/services/projects");
    const request = projectSer.getProjectDetail({
      authContext: buildAuthContext(),
      projectId: "project-1",
    });

    await Promise.resolve();
    const calledBeforeDetailResolved =
      listPrimaryAssigneesByProjectIds.mock.calls.length > 0 &&
      isProjectDetailPending;

    resolveProjectDetail?.({
      id: "project-1",
      tenant_id: "tenant-1",
      status: "draft",
      customer: null,
      property: null,
    });
    await request;

    expect(calledBeforeDetailResolved).toBe(true);
  });

  test("starts stored member lookup while project detail lookup is pending", async () => {
    const { projectSer } = await import("@/services/projects");
    const request = projectSer.getProjectDetail({
      authContext: buildAuthContext(),
      projectId: "project-1",
    });

    await Promise.resolve();
    const calledBeforeDetailResolved =
      listProjectMembers.mock.calls.length > 0 &&
      isProjectDetailPending;

    resolveProjectDetail?.({
      id: "project-1",
      tenant_id: "tenant-1",
      status: "draft",
      customer: null,
      property: null,
    });
    await request;

    expect(calledBeforeDetailResolved).toBe(true);
  });

  test("starts display status lookup while project detail lookup is pending", async () => {
    const { projectSer } = await import("@/services/projects");
    const request = projectSer.getProjectDetail({
      authContext: buildAuthContext(),
      projectId: "project-1",
    });

    await Promise.resolve();
    const calledBeforeDetailResolved =
      getDisplayStatusStore().inCalls.length > 0 &&
      isProjectDetailPending;

    resolveProjectDetail?.({
      id: "project-1",
      tenant_id: "tenant-1",
      status: "constructing",
      customer: null,
      property: null,
    });
    await request;

    expect(calledBeforeDetailResolved).toBe(true);
  });
});
