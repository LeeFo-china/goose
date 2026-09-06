import { beforeAll, expect, mock, spyOn, test } from "bun:test";
import Fastify from "fastify";
import type { AuthContext, EffectivePermission } from "@/services/authorization";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";
let Service: typeof import("./tenant-customer-leads").TenantCustomerLeadsService;
let policy: typeof import("./access-policy").accessPolicyService;
beforeAll(async () => {
  ({ TenantCustomerLeadsService: Service } = await import("./tenant-customer-leads"));
  ({ accessPolicyService: policy } = await import("./access-policy"));
});
const tenant = "11111111-1111-4111-8111-111111111111";
const employee = "22222222-2222-4222-8222-222222222222";
const leadId = "33333333-3333-4333-8333-333333333333";
const customerId = "44444444-4444-4444-8444-444444444444";
const followUpId = "55555555-5555-4555-8555-555555555555";
const command = { expected_lead_version: 1, idempotency_key: "66666666-6666-4666-8666-666666666666" };
const timestamp = "2026-09-06T04:00:00Z";
function auth(codes = ["customer_lead.read"], scope: EffectivePermission["scope"] = "all"): AuthContext {
  return { authUserId: employee, employeeId: employee, tenantId: tenant,
    tenantName: null, tenantSlug: null, tenantStatus: "active", isPlatformAdmin: false,
    employeeName: "员工", employeeStatus: "active", departmentId: null,
    tenantDepartmentId: null, departmentCode: null, departmentName: null,
    postId: null, postName: null, avatar: null, roleCodes: [], roles: [],
    permissions: codes.map((code) => ({ code, scope })) };
}
function fixture() {
  const lead = { id: leadId, tenant_id: tenant, douyin_miniapp_installation_id: null,
    customer_id: customerId, assigned_employee_id: employee, name: "客户",
    phone: "13800138000", community: "测试小区", lead_status: "new" as const,
    created_at: timestamp, followed_at: null, follow_remark: null, version: 1,
    form_data: { demand: "需要设计", openid: "secret", raw_payload: "secret" } };
  const customer = { id: customerId, tenant_id: tenant, name: "客户", status: "potential", owner_id: employee };
  const bundle = { lead, customer, appointments: [],
    assignee: { id: employee, tenant_id: tenant, name: "员工", avatar: null, status: "active" } };
  const repository = {
    listLeads: mock(async () => ({ rows: [bundle], total: 1 })),
    getLeadDetail: mock(async () => ({ ...bundle, appointmentTotal: 0, followUps: [], followUpTotal: 0 })),
    findLeadAccess: mock(async () => ({ id: leadId, tenant_id: tenant, assigned_employee_id: employee })),
    listAppointments: mock(async () => ({ rows: [], total: 0 })),
    listFollowUps: mock(async () => ({ rows: [], total: 0 })),
    listAssigneeCandidates: mock(async () => ({ rows: [], total: 0 })),
    listAssigneeFilterOptions: mock(async () => ({ rows: [], total: 0 })),
    findEmployeeAccess: mock(async () => ({ id: employee, tenant_id: tenant, tenant_department_id: null, status: "active" })),
    findCustomerAccess: mock(async () => customer),
    findConversionPreflight: mock(async (): Promise<{ leadId: string; phone: string; assignedEmployeeId: string | null; customerId: string | null }> =>
      ({ leadId, phone: lead.phone, assignedEmployeeId: employee, customerId })),
    assign: mock(async () => ({ ok: true as const, data: { action: "assign" as const, result: "assigned" as const,
      lead_id: leadId, lead_version: 2, assigned_employee_id: employee, appointments_updated: 0, idempotent: false } })),
    appendFollowUp: mock(async () => ({ ok: true as const, data: { action: "follow_up" as const, result: "followed_up" as const,
      lead_id: leadId, lead_version: 2, follow_up_id: followUpId, appointment_id: null,
      appointment_version: null, appointment_status: null, idempotent: false } })),
    convert: mock(async () => ({ ok: true as const, data: { action: "convert" as const, result: "converted" as const,
      lead_id: leadId, lead_version: 2, customer_id: customerId, created_customer: false,
      repeated_conversion: false, appointments_updated: 0, idempotent: false } })),
    markInvalid: mock(async () => ({ ok: true as const, data: { action: "mark_invalid" as const, result: "invalid" as const,
      lead_id: leadId, lead_version: 2, appointments_updated: 0, repeated_invalidation: false, idempotent: false } })),
  };
  return { lead, customer, repository, service: new Service({ repository, accessPolicy: policy,
    phonePrivacy: { serializeMaskedPhoneOnly: () => ({ phone: null, phone_masked: "138****8000" }) } }) };
}

test("generic read is employee-only and does not accept legacy permissions", async () => {
  const context = fixture();
  for (const actor of [auth(["douyin_lead.read"]), { ...auth(), employeeId: null }]) {
    await expect(context.service.list(actor, {})).rejects.toMatchObject({ statusCode: 403 });
  }
  expect(context.repository.listLeads).not.toHaveBeenCalled();
});

test("list projects common fields and hides customer ID without customer.read", async () => {
  const context = fixture();
  const result = await context.service.list(auth(), { assignment: "assigned", source: "douyin_miniapp" });
  expect(result).toMatchObject({ list: [{ source: "douyin_miniapp", assigned_employee_id: employee,
    customer_id: null, can_view_customer: false, phone_masked: "138****8000" }], pagination: { page: 1, pageSize: 20 } });
  expect(result.list[0]).not.toHaveProperty("phone");
  expect(result.list[0]).not.toHaveProperty("form_data");
  expect(context.repository.listLeads).toHaveBeenCalledWith({ tenantId: tenant,
    page: 1, pageSize: 20, assignment: "assigned", source: "douyin_miniapp", visibleAssigneeIds: null });
  expect((await context.service.list(auth(["customer_lead.read", "customer.read"], "self"), {})).list[0])
    .toMatchObject({ customer_id: customerId, can_view_customer: true });
  context.customer.owner_id = followUpId;
  expect((await context.service.list(auth(["customer_lead.read", "customer.read"], "self"), {})).list[0])
    .toMatchObject({ customer_id: null, can_view_customer: false });
});

test("generic follows a lead without any appointment and returns coherent nullable fields", async () => {
  const context = fixture();
  const result = await context.service.appendFollowUp(auth(["customer_lead.read", "customer_lead.follow_up"]), leadId,
    { ...command, summary: "已联系", result: "待沟通", follow_up_type: "wechat" });
  expect(result).toMatchObject({ appointment_id: null, appointment_version: null, appointment_status: null });
  expect(context.repository.appendFollowUp).toHaveBeenCalledWith(expect.objectContaining({ appointmentId: null,
    appointmentStatus: null, confirmedVisitAt: null, idempotencyKey: command.idempotency_key }));
});

test("commands require intersection of read and action scopes", async () => {
  const context = fixture();
  await expect(context.service.assign(auth(["customer_lead.assign"]), leadId,
    { ...command, assigned_employee_id: employee })).rejects.toMatchObject({ statusCode: 403 });
  const actor = auth(["customer_lead.read", "customer_lead.assign"]);
  actor.permissions[0]!.scope = "self";
  actor.employeeId = followUpId;
  await expect(context.service.assign(actor, leadId, { ...command, assigned_employee_id: employee }))
    .rejects.toMatchObject({ statusCode: 404, code: "CUSTOMER_LEAD_NOT_FOUND" });
  expect(context.repository.assign).not.toHaveBeenCalled();
});

test("conversion preflight rechecks read/action intersection after reassignment", async () => {
  const context = fixture();
  const actor = auth(["customer_lead.read", "customer_lead.convert"]);
  actor.permissions[0]!.scope = "self";
  context.repository.findConversionPreflight.mockImplementation(async () =>
    ({ leadId, phone: context.lead.phone, assignedEmployeeId: followUpId, customerId }));
  await expect(context.service.convert(actor, leadId, command))
    .rejects.toMatchObject({ statusCode: 404, code: "CUSTOMER_LEAD_NOT_FOUND" });
  expect(context.repository.convert).not.toHaveBeenCalled();
});

test("conversion hides customer ID independently of permission to convert", async () => {
  const context = fixture();
  expect(await context.service.convert(auth(["customer_lead.read", "customer_lead.convert"]), leadId, command))
    .toMatchObject({ customer_id: null, can_view_customer: false });
  expect(context.repository.findCustomerAccess).not.toHaveBeenCalled();
  expect(await context.service.convert(auth(["customer_lead.read", "customer_lead.convert", "customer.read"]), leadId, command))
    .toMatchObject({ customer_id: customerId, can_view_customer: true });
});

test("conversion accepts recorded creation on an idempotent replay after preflight now finds customer", async () => {
  const context = fixture();
  context.repository.convert.mockImplementation(async () => ({ ok: true, data: {
    action: "convert", result: "converted", lead_id: leadId, lead_version: 2,
    customer_id: customerId, created_customer: true, repeated_conversion: false,
    appointments_updated: 0, idempotent: true,
  } }));
  await expect(context.service.convert(auth(["customer_lead.read", "customer_lead.convert"]), leadId, command))
    .resolves.toMatchObject({ idempotent: true, created_customer: true, customer_id: null });
});

test("detail whitelists source and derives actions from real permissions and preflight", async () => {
  const context = fixture();
  const actor = auth(["customer_lead.read", "customer_lead.convert", "customer_lead.follow_up"]);
  const detail = await context.service.getDetail(actor, leadId);
  expect(detail.actions).toMatchObject({ assign: { enabled: false }, follow_up: { enabled: true }, convert: { enabled: true } });
  expect(detail.source_context).toEqual({ demand: "需要设计", attribution: {}, budget: null, ai: null });
  expect(detail.latest_appointment).toBeNull();
  expect(detail.appointments.pagination).toMatchObject({ page: 1, pageSize: 20, total: 0 });
  context.repository.findConversionPreflight.mockImplementation(async () =>
    ({ leadId, phone: context.lead.phone, assignedEmployeeId: employee, customerId: null }));
  expect((await context.service.getDetail(actor, leadId)).actions.convert.enabled).toBe(false);
  await expect(context.service.convert(actor, leadId, command)).rejects.toMatchObject({ statusCode: 403 });
  expect(context.repository.convert).not.toHaveBeenCalled();
});

test("HTTP smoke verifies JWT/session isolation and employee-only list through real controller/service", async () => {
  process.env.JWT_SECRET ??= "customer-leads-http-test-secret-at-least-32-characters";
  const [{ TenantCustomerLeadsController }, { default: authPlugin },
    { default: errorHandler }, { authorizationService }, { userIdentityService }, jwt] = await Promise.all([
    import("@/controllers/tenant-customer-leads"), import("@/plugins/auth"),
    import("@/plugins/error-handler"), import("@/services/authorization"),
    import("@/services/user-identities"), import("@/utils/jwt"),
  ]);
  // Only persistence-backed identity/context lookups are fixtures; JWT,
  // auth hooks, HTTP validation, policy, controller and service run unchanged.
  const contextLookup = spyOn(authorizationService, "getRequiredAuthContext")
    .mockImplementation(async (sub) => ({ ...auth(), employeeId: sub === "customer-http-fixture" ? null : employee }));
  const binding = spyOn(userIdentityService, "verifyWechatIdentityBinding").mockResolvedValue({
    oauth_matched: true, employee_user_matched: true,
    customer_membership_matched: true, employee_membership_matched: true,
  } as never);
  const app = Fastify({ logger: false });
  errorHandler(app);
  authPlugin(app);
  const context = fixture();
  new TenantCustomerLeadsController(context.service).registerExtraRoutes(app);
  try {
    const url = "/tenant/customer-leads";
    const adminToken = jwt.signToken({ sub: employee, token_type: "auth" });
    const employeeToken = jwt.signToken({ sub: employee, token_type: "auth",
      openid: "customer-lead-employee-fixture", employee_id: employee, tenant_id: tenant });
    const customerToken = jwt.signToken({ sub: "customer-http-fixture", token_type: "auth",
      openid: "customer-lead-customer-fixture", customer_id: customerId, tenant_id: tenant });
    const visitorToken = jwt.signVisitorSessionToken({ openid: "visitor-fixture", visitor_id: "visitor-fixture" });
    const douyinToken = jwt.signDouyinMiniappToken({ tenant_id: tenant, douyin_installation_id: leadId,
      douyin_app_id: "tt-fixture", subject_hash: "a".repeat(64) });
    for (const [token, expected] of [[adminToken, 200], [employeeToken, 200], [customerToken, 403],
      [visitorToken, 401], [douyinToken, 401], ["invalid-token", 401]] as const) {
      const response = await app.inject({ method: "GET", url, headers: { authorization: `Bearer ${token}` } });
      expect(response.statusCode).toBe(expected);
      if (expected === 200) expect(response.json()).toMatchObject({ data: {
        list: [{ source: "douyin_miniapp", customer_id: null }], pagination: { pageSize: 20 } } });
    }
    expect((await app.inject({ method: "GET", url })).statusCode).toBe(401);
    expect((await app.inject({ method: "GET", url: `${url}?pageSize=101`,
      headers: { authorization: `Bearer ${adminToken}` } })).statusCode).toBe(400);
    expect(binding).toHaveBeenCalledTimes(2);
  } finally {
    await app.close();
    contextLookup.mockRestore();
    binding.mockRestore();
  }
});
