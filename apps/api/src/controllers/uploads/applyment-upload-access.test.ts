import { afterEach, beforeAll, beforeEach, expect, mock, spyOn, test } from "bun:test";
import { Errors } from "@/errors/error-factory";
import type { AuthContext } from "@/services/authorization";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

let assertApplymentUploadSceneAccess: typeof import("./applyment-upload-access")["assertApplymentUploadSceneAccess"];
let authorizationService: typeof import("@/services/authorization")["authorizationService"];
let uploadService: typeof import("@/services/uploads")["uploadService"];
let getRequiredAuthContext: ReturnType<typeof spyOn<typeof authorizationService, "getRequiredAuthContext">>;
let assertDirectUploadAccess: ReturnType<typeof spyOn<typeof uploadService, "assertDirectUploadAccess">>;

const tenantId = "applyment-tenant";
const employeeId = "applyment-employee";
const context: AuthContext = {
  authUserId: "applyment-user", employeeId, tenantId,
  tenantName: null, tenantSlug: null, tenantStatus: "active",
  isPlatformAdmin: false, employeeName: null, employeeStatus: "active",
  departmentId: null, tenantDepartmentId: null, departmentCode: null,
  departmentName: null, postId: null, postName: null, avatar: null,
  roleCodes: [], roles: [], permissions: [],
};
const user = { sub: context.authUserId, tenant_id: tenantId, employee_id: employeeId };

beforeAll(async () => {
  ({ assertApplymentUploadSceneAccess } = await import("./applyment-upload-access"));
  ({ authorizationService } = await import("@/services/authorization"));
  ({ uploadService } = await import("@/services/uploads"));
});
beforeEach(() => {
  getRequiredAuthContext = spyOn(authorizationService, "getRequiredAuthContext")
    .mockResolvedValue(context);
  assertDirectUploadAccess = spyOn(uploadService, "assertDirectUploadAccess")
    .mockImplementation(() => undefined);
});
afterEach(() => mock.restore());

test("applyment upload guards business.finance write before merchant permission", async () => {
  expect(await assertApplymentUploadSceneAccess(user, "wechat_pay_applyment")).toMatchObject({ tenantId, employeeId });
  expect(getRequiredAuthContext).toHaveBeenCalledWith(user.sub, {
    tenantServiceAccess: "write", requiredCapability: "business.finance",
  });
  expect(assertDirectUploadAccess).toHaveBeenCalledWith({
    authContext: expect.objectContaining({ tenantId, employeeId }), scene: "wechat_pay_applyment",
  });
});

test("capability denial does not reach the merchant permission guard", async () => {
  const denial = Errors.business(403, "财务不在试用范围内", "TENANT_SERVICE_CAPABILITY_DENIED");
  getRequiredAuthContext.mockRejectedValueOnce(denial);
  await expect(assertApplymentUploadSceneAccess(user, "wechat_pay_applyment")).rejects.toBe(denial);
  expect(assertDirectUploadAccess).not.toHaveBeenCalled();
});

test("finance capability does not bypass merchant permission", async () => {
  const denial = Errors.forbidden();
  assertDirectUploadAccess.mockImplementationOnce(() => { throw denial; });
  await expect(assertApplymentUploadSceneAccess(user, "wechat_pay_applyment")).rejects.toBe(denial);
});

test.each([
  { tenant_id: "other-tenant" }, { employee_id: "other-employee" },
])("applyment upload preserves JWT binding validation %j", async (claims) => {
  await expect(assertApplymentUploadSceneAccess({ ...user, ...claims }, "wechat_pay_applyment")).rejects.toMatchObject({ code: "FORBIDDEN" });
});

test("unrelated scenes skip the applyment guard", async () => {
  expect(await assertApplymentUploadSceneAccess(user, "project_log")).toBeNull();
  expect(getRequiredAuthContext).not.toHaveBeenCalled();
});
