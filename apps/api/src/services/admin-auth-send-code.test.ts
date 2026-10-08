import { afterEach, beforeAll, expect, spyOn, test } from "bun:test";
import { Errors } from "@/errors/error-factory";
import type { AuthContext } from "@/services/authorization";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

let repository: typeof import("@/repositories/admin-auth").adminAuthRepository;
let authorization: typeof import("@/services/authorization").authorizationService;
let service: typeof import("./admin-auth").adminAuthService;
let sms: typeof import("@/services/sms");
beforeAll(async () => {
  repository = (await import("@/repositories/admin-auth")).adminAuthRepository;
  authorization = (await import("@/services/authorization")).authorizationService;
  sms = await import("@/services/sms");
  service = (await import("./admin-auth")).adminAuthService;
});
const spies: Array<{ mockRestore(): void }> = [];
afterEach(() => { for (const spy of spies.splice(0)) spy.mockRestore(); });
const context: AuthContext = {
  authUserId: "user-a", employeeId: "employee-a", tenantId: "tenant-a",
  tenantName: "Synthetic tenant", tenantSlug: "test", tenantStatus: "active",
  isPlatformAdmin: false, isPlatformStaff: false, isPlatformSuperAdmin: false,
  adminAuthVersion: 3, employeeName: "Synthetic employee", employeeStatus: "active",
  departmentId: null, tenantDepartmentId: null, departmentCode: null, departmentName: null,
  postId: null, postName: null, avatar: null, roleCodes: ["system_admin"], roles: [], permissions: [],
};

test("admin send-code reports provider daily limit and removes only its failed code", async () => {
  const create = spyOn(repository, "createVerificationCode").mockResolvedValue(undefined);
  const cleanup = spyOn(repository, "deletePendingVerificationCode").mockResolvedValue(undefined);
  const send = spyOn(sms, "sendSmsCode").mockRejectedValue(Errors.business(
    503, "阿里云短信发送失败: isv.BUSINESS_LIMIT_CONTROL 触发天级流控Permits:10", "ALIYUN_SMS_SEND_FAILED",
  ));
  spies.push(create, cleanup, send,
    spyOn(repository, "findEmployeeByPhone").mockResolvedValue([{
      id: "employee-a", tenant_id: "tenant-a", user_id: null, status: "active",
      phone: "13800000000", admin_auth_version: 3, name: "Synthetic employee",
      tenant_department_id: null, post_id: null, avatar: null, tenant: null,
      tenant_department: null, post: null,
    }]),
    spyOn(repository, "findRecentVerificationCode").mockResolvedValue(null),
    spyOn(authorization, "getAuthContextByEmployeeId").mockResolvedValue(context),
    spyOn(authorization, "assertTenantAvailable").mockReturnValue(undefined),
  );
  await expect(service.sendCode({ phone: "13800000000" })).rejects.toMatchObject({
    statusCode: 429, code: "SMS_CODE_PROVIDER_RATE_LIMITED",
    message: "验证码发送已达短信服务每日上限，请等待限流恢复后再试",
    details: { provider: "aliyun", limit_window: "day" },
  });
  const code = create.mock.calls[0]?.[0].code;
  expect(code).toMatch(/^\d{6}$/);
  expect(send).toHaveBeenCalledWith("13800000000", code, "admin_login", { tenantId: "tenant-a" });
  expect(cleanup).toHaveBeenCalledTimes(1);
  expect(cleanup).toHaveBeenCalledWith({ phone: "13800000000", scene: "admin_login", code });
});
