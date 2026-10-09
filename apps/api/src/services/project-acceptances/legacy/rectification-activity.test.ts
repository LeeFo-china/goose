import { beforeAll, expect, mock, test } from "bun:test";
import { Errors } from "@/errors/error-factory";
import type { AuthContext } from "@/services/authorization";
import type { ProjectAcceptanceActionRow, ProjectAcceptanceRow } from "@/repositories/project-acceptances";
import { RectifyProjectAcceptanceSchema } from "@/schema/project-acceptances";
import { getTenantActivityEventKey } from "@/utils/tenant-activity-evidence";

const row: ProjectAcceptanceRow = {
  id: "acceptance-1", tenant_id: "tenant-1", project_id: "project-1",
  acceptance_type: "stage", stage_code: "plumbing_electrical", template_id: null,
  template_version: 1, template_snapshot: null, title: "水电验收", status: "rejected",
  initiator_id: "employee-1", reviewer_id: "leader-1", customer_id: "customer-1",
  summary: null, submitted_at: null, reviewed_at: null, customer_confirmed_at: null,
  completed_at: null, rejected_at: null, reject_reason: null, reject_source: null,
  created_at: "2026-10-09T06:00:00Z", updated_at: "2026-10-09T06:00:00Z",
};
const auth: AuthContext = {
  authUserId: "user-1", employeeId: "employee-1", tenantId: "tenant-1",
  tenantName: "测试公司", tenantSlug: null, tenantStatus: "active", isPlatformAdmin: false,
  employeeName: "员工", employeeStatus: "active", departmentId: null, tenantDepartmentId: null,
  departmentCode: null, departmentName: null, postId: null, postName: null,
  avatar: null, roleCodes: [], roles: [], permissions: [],
};
type ActionInput = Omit<ProjectAcceptanceActionRow, "id" | "created_at">;
const createAction = mock(async (input: ActionInput): Promise<ProjectAcceptanceActionRow> => ({
  ...input, id: `action-${input.comment}`, created_at: row.updated_at,
}));
const listItems = mock(async () => []);
const listActions = mock(async () => []);
process.env.SUPABASE_URL = "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH = "test-publish";
process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role";
mock.module("@/repositories/project-acceptances", () => ({
  projectAcceptanceRepository: { createAction, listItems, listActions },
}));

let recordAction: typeof import("./notifications").recordAction;
let rectifyAcceptance: typeof import("./customer-actions").rectifyAcceptance;
beforeAll(async () => {
  ({ recordAction } = await import("./notifications"));
  ({ rectifyAcceptance } = await import("./customer-actions"));
});

function context() {
  return {
    requireTenantId: () => "tenant-1",
    getRequiredAcceptance: async () => row,
    assertCanSubmit: async () => undefined,
    getLatestReturnActionIndex: () => -1,
    buildImageReferenceCatalog: () => [],
    resolveReferencedImages: () => [],
    normalizeImageItems: () => [],
    clearCustomerAcceptanceListCache: mock(() => undefined),
    invalidateAcceptanceRelatedCaches: mock(() => undefined),
    recordAction,
    // A concurrent operation may already appear in the detail's action list.
    buildDetail: async () => ({ ...row, actions: [{ id: "unrelated-later-action" }] }),
  };
}

test("recordAction returns the exact persisted row and preserves cache invalidation", async () => {
  const service = context();
  const action = await recordAction.call(service, {
    row, action: "employee_rectify", fromStatus: "rejected", toStatus: "rejected",
    operatorType: "employee", operatorId: auth.employeeId, comment: "own-write",
  });
  expect(action).toMatchObject({ id: "action-own-write", acceptance_id: row.id });
  expect(service.clearCustomerAcceptanceListCache).toHaveBeenCalledTimes(1);
});

test("concurrent rectifications with unchanged status/version retain their own persisted action IDs", async () => {
  const service = context();
  let releaseFirst: (action: ProjectAcceptanceActionRow) => void = () => {};
  let signalFirstInsert: () => void = () => {};
  const firstInsertStarted = new Promise<void>((resolve) => { signalFirstInsert = resolve; });
  createAction.mockImplementationOnce(() => new Promise((resolve) => {
    releaseFirst = resolve;
    signalFirstInsert();
  }));
  const firstPromise = rectifyAcceptance.call(service, auth, row.id,
    RectifyProjectAcceptanceSchema.parse({ comment: "first" }));
  // Let the second response finish while the first insert is still in flight.
  await firstInsertStarted;
  const second = await rectifyAcceptance.call(service, auth, row.id,
    RectifyProjectAcceptanceSchema.parse({ comment: "second" }));
  releaseFirst({ id: "action-first", tenant_id: row.tenant_id, acceptance_id: row.id,
    operator_type: "employee", operator_id: auth.employeeId, action: "employee_rectify",
    from_status: "rejected", to_status: "rejected", comment: "first", metadata: {}, created_at: row.updated_at });
  const first = await firstPromise;
  expect(first.updated_at).toBe(second.updated_at);
  expect(first.status).toBe(second.status);
  expect(getTenantActivityEventKey(first)).toBe("acceptance_handled:action-first");
  expect(getTenantActivityEventKey(second)).toBe("acceptance_handled:action-second");
  expect(getTenantActivityEventKey(first)).not.toBe(getTenantActivityEventKey(second));
  expect(getTenantActivityEventKey(JSON.parse(JSON.stringify(first)))).toBeUndefined();
});

test("failed action persistence cannot return a response with activity evidence", async () => {
  const service = context();
  createAction.mockRejectedValueOnce(Errors.dbError("写入失败"));
  await expect(rectifyAcceptance.call(service, auth, row.id,
    RectifyProjectAcceptanceSchema.parse({ comment: "failed" }))).rejects.toThrow("写入失败");
  expect(service.invalidateAcceptanceRelatedCaches).not.toHaveBeenCalled();
});
