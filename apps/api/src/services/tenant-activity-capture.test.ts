import { expect, test } from "bun:test";
import { classifyTenantActivityResponse, resolveActivityChannel } from "./tenant-activity-capture";
import { withTenantActivityEventKey } from "@/utils/tenant-activity-evidence";
const id = "00000000-0000-4000-8000-000000000001";
test("only successful allowlisted mutations produce business evidence", () => {
  expect(classifyTenantActivityResponse("POST", "/customers", { data: { id } })).toEqual({ kind: "customer_created", eventKey: `customer_created:${id}` });
  expect(classifyTenantActivityResponse("GET", "/customers", { data: { id } })).toBeNull();
  expect(classifyTenantActivityResponse("POST", "/customers", { data: null })).toBeNull();
  expect(classifyTenantActivityResponse("POST", "/admin/auth/send-code", { data: { id } })).toBeNull();
  expect(classifyTenantActivityResponse("POST", "/auth", { data: { token: "silent" } })).toBeNull();
});
test("login is issued employee session only, including nested phone-login auth", () => {
  expect(classifyTenantActivityResponse("POST", "/auth/phone-login/verify", { data: { status: "selection_required" } })).toBeNull();
  for (const route of ["/auth/phone-login/verify", "/auth/phone-login/select"]) {
    expect(classifyTenantActivityResponse("POST", route, { data: { status: "authenticated", auth: { mode: "tenant_employee", token: "signed", roles: ["employee"] } } })).toEqual({ kind: "login", token: "signed" });
  }
  expect(classifyTenantActivityResponse("POST", "/auth/phone-login/select", { data: { auth: { mode: "customer", token: "signed", roles: ["employee","customer"] } } })).toBeNull();
  expect(classifyTenantActivityResponse("POST", "/admin/auth/login", { data: { token: "signed", roles: ["employee"], is_platform_staff: true } })).toBeNull();
});
test("acceptance events use persisted status version, not request retry IDs", () => {
  const data = { id, status: "employee_approved", updated_at: "2026-10-09T06:00:00Z" };
  expect(classifyTenantActivityResponse("POST", "/project-acceptances/:id/approve", { data })).toEqual({ kind: "acceptance_handled", eventKey: `acceptance_handled:${id}:employee_approved:2026-10-09T06:00:00Z` });
  expect(classifyTenantActivityResponse("POST", "/project-acceptances/:id/customer-confirm", { data })).toBeNull();
});
test("channel derives only from employee token identity, never headers", () => {
  expect(resolveActivityChannel({ sub:"u",roles:["employee"],login_channel:"admin_web" })).toBe("admin_web");
  expect(resolveActivityChannel({ sub:"u",roles:["employee"],login_channel:"wechat",openid:"o" })).toBe("wechat_mini");
  expect(resolveActivityChannel({ sub:"u",roles:["customer"],login_channel:"wechat",openid:"o" })).toBeNull();
  expect(resolveActivityChannel({ sub:"u",roles:["employee","customer"],customer_id:id,login_channel:"wechat",openid:"o" })).toBeNull();
  expect(resolveActivityChannel({ sub:"u",roles:["platform_admin"],login_channel:"admin_web" })).toBeNull();
  expect(resolveActivityChannel({ sub:"u",roles:["employee"],login_channel:"douyin" })).toBeNull();
});
test("rectifications require exact persisted action evidence instead of an unchanged row version", () => {
  const route="/project-acceptances/:id/rectification";
  const row={id,status:"rejected",updated_at:"2026-10-09T06:00:00Z"};
  expect(classifyTenantActivityResponse("POST",route,{data:{...row,eventKey:"client-spoof"}})).toBeNull();
  for (const actionId of ["first","second"]) {
    const eventKey=`acceptance_handled:${actionId}`;
    const data=withTenantActivityEventKey({...row},eventKey);
    expect(classifyTenantActivityResponse("POST",route,{data})).toEqual({kind:"acceptance_handled",eventKey});
  }
});
