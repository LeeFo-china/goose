import { beforeAll, describe, expect, mock, test } from "bun:test";

import type { AuthContext } from "@/services/authorization";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

let Service: typeof import("./tenant-douyin-leads").TenantDouyinLeadsService;

beforeAll(async () => {
  ({ TenantDouyinLeadsService: Service } = await import("./tenant-douyin-leads"));
});

const TENANT_ID = "11111111-1111-4111-8111-111111111111";
const LEAD_ID = "22222222-2222-4222-8222-222222222222";
const APPOINTMENT_ID = "33333333-3333-4333-8333-333333333333";
const CUSTOMER_ID = "44444444-4444-4444-8444-444444444444";
const ACTOR_ID = "55555555-5555-4555-8555-555555555555";
const OTHER_ID = "77777777-7777-4777-8777-777777777777";
const DEPARTMENT_ID = "99999999-9999-4999-8999-999999999999";
const IDEMPOTENCY_KEY = "66666666-6666-4666-8666-666666666666";
const command = { expected_lead_version: 1, idempotency_key: IDEMPOTENCY_KEY };

type Scope = "self" | "department" | "assigned" | "all";
function auth(permission: string, scope: Scope, extra: string[] = []): AuthContext {
  return { tenantId: TENANT_ID, employeeId: ACTOR_ID,
    tenantDepartmentId: DEPARTMENT_ID,
    permissions: [permission, ...extra].map((code) => ({ code, scope })) } as AuthContext;
}

function fixture(input: {
  assignedEmployeeId?: string | null;
  visibleIds?: string[] | null;
  customerId?: string | null;
  createScope?: Scope | null;
  targetVisible?: boolean;
  targetEmployeeId?: string;
  targetDepartmentId?: string | null;
} = {}) {
  const assignedEmployeeId = input.assignedEmployeeId === undefined
    ? ACTOR_ID : input.assignedEmployeeId;
  const repository = {
    listLeads: mock(async () => ({ rows: [], total: 0 })),
    getLeadDetail: mock(async () => null), listFollowUps: mock(async () => ({ rows: [], total: 0 })),
    findLeadAccess: mock(async () => ({ id: LEAD_ID, tenant_id: TENANT_ID,
      assigned_employee_id: assignedEmployeeId })),
    findEmployeeAccess: mock(async () => ({ id: input.targetEmployeeId ?? OTHER_ID,
      tenant_id: TENANT_ID,
      tenant_department_id: input.targetDepartmentId === undefined
        ? "88888888-8888-4888-8888-888888888888" : input.targetDepartmentId,
      status: "active" })),
    findConversionPreflight: mock(async () => ({ leadId: LEAD_ID,
      phone: "13800138000", assignedEmployeeId, customerId: input.customerId ?? null })),
    assign: mock(async (args: { assignedEmployeeId: string }) => ({ ok: true as const, data: {
      action: "assign" as const, result: "assigned" as const, lead_id: LEAD_ID,
      assigned_employee_id: args.assignedEmployeeId, lead_version: 2,
      appointments_updated: 0, idempotent: false } })),
    appendFollowUp: mock(async () => ({ ok: true as const, data: {
      action: "follow_up" as const, result: "followed_up" as const,
      lead_id: LEAD_ID, follow_up_id: OTHER_ID, appointment_id: APPOINTMENT_ID,
      lead_version: 2, appointment_version: 2, appointment_status: "confirmed" as const,
      idempotent: false } })),
    convert: mock(async (args: { allowCustomerCreate?: boolean }) => ({ ok: true as const, data: {
      action: "convert" as const, result: "converted" as const, lead_id: LEAD_ID,
      customer_id: CUSTOMER_ID, created_customer: args.allowCustomerCreate === true,
      repeated_conversion: false, lead_version: 2, appointments_updated: 0,
      idempotent: false } })),
    markInvalid: mock(async () => ({ ok: true as const, data: {
      action: "mark_invalid" as const, result: "invalid" as const, lead_id: LEAD_ID,
      lead_version: 2, appointments_updated: 0, repeated_invalidation: false,
      idempotent: false } })),
  };
  const accessPolicy = {
    assertTenantContext: mock(() => TENANT_ID),
    assertPermission: mock((context: AuthContext, permission: string) => {
      const found = context.permissions.find((item) => item.code === permission);
      if (!found) throw Object.assign(new Error("forbidden"), { statusCode: 403 });
      return permission === "customer.create" && input.createScope !== undefined
        ? input.createScope : found.scope;
    }),
    getVisibleCustomerOwnerIds: mock(async () => input.visibleIds ?? null),
    canAccessEmployee: mock(() => input.targetVisible ?? false),
  };
  const phonePrivacy = { createPrivacyContext: mock(async () => ({})),
    serializeCustomerPhoneFields: mock(() => ({})) };
  return { service: new Service({ repository, accessPolicy, phonePrivacy } as never),
    repository, accessPolicy };
}

describe("TenantDouyinLeadsService write access", () => {
  test("checks current lead scope before every workflow RPC", async () => {
    const cases = [
      ["assign", "douyin_lead.assign", { ...command, assigned_employee_id: ACTOR_ID }],
      ["appendFollowUp", "douyin_lead.follow_up", { ...command,
        appointment_id: APPOINTMENT_ID, follow_up_type: "phone", summary: "联系",
        result: "待定", next_follow_up_at: null, appointment_status: null,
        confirmed_visit_at: null }],
      ["convert", "douyin_lead.convert", command],
      ["markInvalid", "douyin_lead.convert", { ...command, reason: "无效" }],
    ] as const;
    for (const [method, permission, body] of cases) {
      const context = fixture({ assignedEmployeeId: OTHER_ID, visibleIds: [ACTOR_ID],
        customerId: CUSTOMER_ID });
      await expect((context.service[method] as Function)(
        auth(permission, "self"), LEAD_ID, body,
      )).rejects.toMatchObject({ statusCode: 404, code: "DOUYIN_LEAD_NOT_FOUND" });
      expect(context.repository[method === "appendFollowUp" ? "appendFollowUp"
        : method as "assign" | "convert" | "markInvalid"]).not.toHaveBeenCalled();
    }

    const unassigned = fixture({ assignedEmployeeId: null, visibleIds: [ACTOR_ID] });
    await expect(unassigned.service.markInvalid(auth("douyin_lead.convert", "self"),
      LEAD_ID, { ...command, reason: "无效" }))
      .rejects.toMatchObject({ statusCode: 404 });
    expect(unassigned.repository.markInvalid).not.toHaveBeenCalled();
  });

  test("limits non-all assignment targets while all scope stays unrestricted", async () => {
    const hidden = fixture({ visibleIds: [ACTOR_ID], targetVisible: false });
    await expect(hidden.service.assign(auth("douyin_lead.assign", "department"),
      LEAD_ID, { ...command, assigned_employee_id: OTHER_ID }))
      .rejects.toMatchObject({ statusCode: 403 });
    expect(hidden.repository.assign).not.toHaveBeenCalled();

    const all = fixture({ assignedEmployeeId: null, visibleIds: null });
    await all.service.assign(auth("douyin_lead.assign", "all"), LEAD_ID,
      { ...command, assigned_employee_id: OTHER_ID });
    expect(all.repository.findEmployeeAccess).not.toHaveBeenCalled();
    expect(all.repository.assign).toHaveBeenCalledWith(expect.objectContaining({
      expectedAssigneeDepartmentId: null,
    }));
  });

  test("binds only department assignment to the authenticated department snapshot", async () => {
    const department = fixture({ visibleIds: [ACTOR_ID], targetVisible: true,
      targetDepartmentId: DEPARTMENT_ID });
    await department.service.assign(auth("douyin_lead.assign", "department"),
      LEAD_ID, { ...command, assigned_employee_id: OTHER_ID });
    expect(department.repository.assign).toHaveBeenCalledWith(
      expect.objectContaining({ expectedAssigneeDepartmentId: DEPARTMENT_ID }),
    );

    for (const scope of ["self", "assigned"] as const) {
      const scoped = fixture({ visibleIds: [ACTOR_ID], targetVisible: true,
        targetEmployeeId: ACTOR_ID });
      await scoped.service.assign(auth("douyin_lead.assign", scope), LEAD_ID,
        { ...command, assigned_employee_id: ACTOR_ID });
      expect(scoped.repository.assign).toHaveBeenCalledWith(
        expect.objectContaining({ expectedAssigneeDepartmentId: null }),
      );
    }

    const missingDepartment = fixture({ visibleIds: [ACTOR_ID],
      targetVisible: true, targetDepartmentId: DEPARTMENT_ID });
    await expect(missingDepartment.service.assign({
      ...auth("douyin_lead.assign", "department"), tenantDepartmentId: null,
    } as AuthContext, LEAD_ID, { ...command, assigned_employee_id: OTHER_ID }))
      .rejects.toMatchObject({ statusCode: 403 });
    expect(missingDepartment.repository.assign).not.toHaveBeenCalled();
  });

  test("rejects a mismatched scoped assignee lookup before mutation", async () => {
    const context = fixture({ visibleIds: [ACTOR_ID], targetVisible: true });
    await expect(context.service.assign(auth("douyin_lead.assign", "self"),
      LEAD_ID, { ...command, assigned_employee_id: ACTOR_ID }))
      .rejects.toMatchObject({ statusCode: 500,
        code: "DOUYIN_LEAD_RESPONSE_INVALID" });
    expect(context.repository.assign).not.toHaveBeenCalled();
  });

  test("binds customer creation scope and preflight coherence into conversion", async () => {
    const missingScope = fixture({ assignedEmployeeId: null, visibleIds: null,
      customerId: null, createScope: null });
    await expect(missingScope.service.convert(auth("douyin_lead.convert", "all",
      ["customer.create"]), LEAD_ID, command)).rejects.toMatchObject({ statusCode: 403 });
    expect(missingScope.repository.convert).not.toHaveBeenCalled();

    const denied = fixture({ assignedEmployeeId: OTHER_ID, visibleIds: null,
      customerId: null, createScope: "self" });
    await expect(denied.service.convert(auth("douyin_lead.convert", "all",
      ["customer.create"]), LEAD_ID, command)).rejects.toMatchObject({ statusCode: 403 });
    expect(denied.repository.convert).not.toHaveBeenCalled();

    const create = fixture({ assignedEmployeeId: null, visibleIds: null,
      customerId: null, createScope: "self" });
    await create.service.convert(auth("douyin_lead.convert", "all",
      ["customer.create"]), LEAD_ID, command);
    expect(create.repository.convert).toHaveBeenCalledWith(expect.objectContaining({
      expectedCustomerId: null, allowCustomerCreate: true,
    }));

    const existing = fixture({ visibleIds: null, customerId: CUSTOMER_ID });
    await existing.service.convert(auth("douyin_lead.convert", "all"), LEAD_ID, command);
    expect(existing.repository.convert).toHaveBeenCalledWith(expect.objectContaining({
      expectedCustomerId: CUSTOMER_ID, allowCustomerCreate: false,
    }));
    expect(existing.accessPolicy.assertPermission).not.toHaveBeenCalledWith(
      expect.anything(), "customer.create",
    );
  });
});
