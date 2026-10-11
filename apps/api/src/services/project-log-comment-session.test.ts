import { expect, mock, test } from "bun:test";
import type { JwtPayload } from "@/utils/jwt";
process.env.SUPABASE_URL = "http://127.0.0.1:1";
process.env.SUPABASE_PUBLISH = "test";
process.env.SUPABASE_SERVICE_ROLE_KEY = "test";
const id = "00000000-0000-4000-8000-000000000001";
const actor: JwtPayload = { sub: id, tenant_id: id, employee_id: id, roles: ["employee"], login_channel: "admin_web" };
async function setup() {
  const { ProjectLogCommentSession } = await import("./project-log-comment-session");
  const repository = { findLog: mock(async () => ({ id, tenant_id: id, project_id: id })) };
  const access = { resolve: mock(async () => ({ tenantId: id, type: "employee" as const, author: { id, name: "员工" }, canWrite: true })) };
  const identity = { findActiveOauthIdentity: mock(async (): Promise<{user_id:string}|null> => ({ user_id: id })) };
  const rollout = { assertProjectAvailable: mock(async () => {}), assertContract: mock(async (_version: 1|2) => {}) };
  return { repository, access, identity, rollout, service: new ProjectLogCommentSession({ repository, access, identity, rollout }) };
}
test("admin session publishes without a content-detection openid dependency", async () => {
  const f = await setup();
  expect(await f.service.authorize({ actor, logId: id, write: true })).toMatchObject({ context: { canWrite: true }, log: { id } });
  expect(f.identity.findActiveOauthIdentity).not.toHaveBeenCalled();
  expect(f.rollout.assertContract).toHaveBeenCalledWith(2);
});
test("WeChat and legacy bound sessions recheck OAuth before every operation", async () => {
  const f = await setup();
  for (const login_channel of ["wechat", undefined] as const) {
    await f.service.authorize({ actor: { ...actor, login_channel, openid: "bound" }, logId: id, write: false });
  }
  expect(f.identity.findActiveOauthIdentity).toHaveBeenCalledTimes(2);
  f.identity.findActiveOauthIdentity.mockResolvedValue(null);
  await expect(f.service.authorize({ actor: { ...actor, login_channel: "wechat", openid: "bound" }, logId: id, write: false })).rejects.toMatchObject({ code: "WECHAT_BINDING_NOT_MATCHED" });
  expect(f.access.resolve).toHaveBeenCalledTimes(2);
});
test("anonymous, missing identity channel and missing log fail closed", async () => {
  const f = await setup();
  await expect(f.service.authorize({ actor: undefined, logId: id, write: true })).rejects.toMatchObject({ statusCode: 401 });
  await expect(f.service.authorize({ actor: { ...actor, login_channel: undefined }, logId: id, write: false })).rejects.toMatchObject({ statusCode: 401 });
});
