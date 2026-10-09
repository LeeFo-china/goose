import { afterEach, beforeEach, expect, mock, spyOn, test } from "bun:test";
import type { AuthContext } from "./authorization";
import { TenantActivityViewSchema } from "@/schema/tenant-activity";
import type { JwtPayload } from "@/utils/jwt";
process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-role";
process.env.JWT_SECRET = "tenant-activity-isolated-test-secret";
const context: AuthContext = {
  authUserId: "user-a", employeeId: "employee-a", tenantId: "tenant-a", tenantName: "测试公司", tenantSlug: null, tenantStatus: "active",
  isPlatformAdmin: false, employeeName: "员工", employeeStatus: "active", departmentId: null, tenantDepartmentId: null, departmentCode: null,
  departmentName: null, postId: null, postName: null, avatar: null, roleCodes: [], roles: [], permissions: [{ code: "project.read", scope: "self" }],
};
const user: JwtPayload = {sub:"user-a",roles:["employee"],login_channel:"admin_web"};
const record = mock(async (_input: unknown) => true);
afterEach(() => mock.restore());
beforeEach(() => record.mockClear());
async function setup(auth = context) {
  const { authorizationService } = await import("./authorization");
  const resolve = spyOn(authorizationService,"getRequiredAuthContext").mockResolvedValue(auth);
  const { TenantActivityCollectionService } = await import("./tenant-activity-collection");
  return { service: new TenantActivityCollectionService({ record }), resolve };
}
test("view counts authenticated employee and server channel in 5-minute buckets, read access supports grace", async () => {
  const {service,resolve}=await setup();
  await service.recordView(user,{screen:"projects"});
  expect(resolve).toHaveBeenCalledWith("user-a",{tenantServiceAccess:"read",requiredCapability:"core.projects"});
  expect(record).toHaveBeenCalledWith({tenantId:"tenant-a",employeeId:"employee-a",channel:"admin_web",kind:"view",eventKey:expect.stringMatching(/^view:projects:\d+$/)});
});
test("cannot submit tenant, employee, channel, counters or arbitrary screens", () => {
  expect(TenantActivityViewSchema.safeParse({screen:"projects",tenantId:"victim"}).success).toBe(false);
  expect(TenantActivityViewSchema.safeParse({screen:"projects",channel:"wechat_mini"}).success).toBe(false);
  expect(TenantActivityViewSchema.safeParse({screen:"login"}).success).toBe(false);
});
test("customer role, cross-tenant token, platform staff and missing screen permission are excluded", async () => {
  let fixture=await setup();
  await expect(fixture.service.recordView({...user,roles:["customer"]},{screen:"projects"})).rejects.toThrow();
  await expect(fixture.service.recordView({...user,tenant_id:"tenant-b"},{screen:"projects"})).rejects.toThrow();
  await expect(fixture.service.recordView(user,{screen:"finance"})).rejects.toThrow();
  fixture.resolve.mockResolvedValue({...context,isPlatformStaff:true});
  await expect(fixture.service.recordView(user,{screen:"projects"})).rejects.toThrow();
  expect(record).not.toHaveBeenCalled();
});
test("business records use authorized operation identity and preserve idempotent resource key", async () => {
  const {service,resolve}=await setup();
  await service.recordResponse({activity:{kind:"project_created",eventKey:"project_created:record-1"},user,authContext:context});
  expect(resolve).not.toHaveBeenCalled();
  expect(record).toHaveBeenCalledWith({tenantId:"tenant-a",employeeId:"employee-a",channel:"admin_web",kind:"project_created",eventKey:"project_created:record-1"});
  record.mockClear();
  await service.recordResponse({activity:{kind:"project_created",eventKey:"record-2"},user:{...user,employee_id:"another"},authContext:context});
  expect(record).not.toHaveBeenCalled();
});
test("successful login counts session once by digest without storing token", async () => {
  const {service}=await setup();
  const {signAdminToken}=await import("@/utils/jwt");
  const token=signAdminToken(user,{platform:false});
  await service.recordResponse({activity:{kind:"login",token}});
  expect(record).toHaveBeenCalledWith({tenantId:"tenant-a",employeeId:"employee-a",channel:"admin_web",kind:"login",eventKey:expect.stringMatching(/^login:[a-f0-9]{64}$/)});
  expect(JSON.stringify(record.mock.calls)).not.toContain(token);
});
test("invalid or customer token is never counted as an employee session", async () => {
  const {service}=await setup();
  await service.recordResponse({activity:{kind:"login",token:"invalid"}});
  const {signToken}=await import("@/utils/jwt");
  await service.recordResponse({activity:{kind:"login",token:signToken({sub:"user-a",roles:["customer"],login_channel:"wechat",openid:"customer-openid"})}});
  expect(record).not.toHaveBeenCalled();
});
test("trusted phone transaction identity overrides changing issued token digests", async () => {
  const {service}=await setup();
  const {signToken}=await import("@/utils/jwt");
  const eventKey="login:phone-session:verified-session";
  for (const openid of ["session-claim-a","session-claim-b"]) {
    const token=signToken({...user,openid});
    await service.recordResponse({activity:{kind:"login",token,eventKey}});
  }
  expect(record).toHaveBeenCalledTimes(2);
  expect(record.mock.calls.map(([input]) => (input as {eventKey:string}).eventKey)).toEqual([eventKey,eventKey]);
});
test("recording failure is visible to callers, never reported as zero success", async () => {
  const {service}=await setup();
  record.mockRejectedValueOnce(new Error("DB unavailable"));
  await expect(service.recordView(user,{screen:"projects"})).rejects.toThrow("DB unavailable");
});
