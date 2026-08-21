import { beforeAll, describe, expect, mock, test } from "bun:test";

import type { AuthContext } from "@/services/authorization";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

let Service: typeof import("./tenant-douyin-leads").TenantDouyinLeadsService;
let permissionFor: typeof import("./tenant-douyin-leads").permissionFor;
let customerPhonePrivacyService: typeof import("@/services/customer-phone-privacy")
  .customerPhonePrivacyService;

beforeAll(async () => {
  ({ TenantDouyinLeadsService: Service, permissionFor } = await import(
    "./tenant-douyin-leads"
  ));
  ({ customerPhonePrivacyService } = await import(
    "@/services/customer-phone-privacy"
  ));
});

const TENANT_ID = "11111111-1111-4111-8111-111111111111";
const LEAD_ID = "22222222-2222-4222-8222-222222222222";
const APPOINTMENT_ID = "33333333-3333-4333-8333-333333333333";
const CUSTOMER_ID = "44444444-4444-4444-8444-444444444444";
const EMPLOYEE_ID = "55555555-5555-4555-8555-555555555555";
const IDEMPOTENCY_KEY = "66666666-6666-4666-8666-666666666666";
const CREATED_AT = "2026-08-21T08:00:00.000Z";

const lead = {
  id: LEAD_ID, tenant_id: TENANT_ID,
  douyin_miniapp_installation_id: "77777777-7777-4777-8777-777777777777",
  customer_id: CUSTOMER_ID, assigned_employee_id: EMPLOYEE_ID,
  name: "李女士", phone: "13800138000", community: "晴天花园",
  lead_status: "new", form_data: {}, created_at: CREATED_AT,
  followed_at: null, follow_remark: null, version: 1,
};
const appointment = {
  id: APPOINTMENT_ID, appointment_no: "DYLF-20260821-000001",
  tenant_id: TENANT_ID, marketing_lead_id: LEAD_ID,
  customer_id: CUSTOMER_ID, assigned_employee_id: EMPLOYEE_ID,
  budget_estimate_id: null, preferred_visit_date: "2026-08-23",
  preferred_visit_period: "morning" as const, community: "晴天花园",
  status: "pending_confirmation" as const, confirmed_visit_at: null,
  source_snapshot: { privacy_policy_version: "2026-08-01",
    consented_at: CREATED_AT, attribution: {}, demand: null,
    budget_estimate: null },
  created_at: CREATED_AT, updated_at: CREATED_AT, version: 1,
};
const customer = { id: CUSTOMER_ID, tenant_id: TENANT_ID, name: "李女士",
  status: "potential", owner_id: EMPLOYEE_ID };
const employee = { id: EMPLOYEE_ID, tenant_id: TENANT_ID, name: "王顾问",
  avatar: null, status: "active" };

function authContext(
  permissions: string[], tenantId: string | null = TENANT_ID,
  employeeId: string | null = EMPLOYEE_ID,
): AuthContext {
  return { tenantId, employeeId,
    permissions: permissions.map((code) => ({ code, scope: "all" })) } as AuthContext;
}

function fixture(overrides: Record<string, unknown> = {}) {
  const repository = {
    listLeads: mock(async () => ({ rows: [{ lead, appointments: [appointment], customer, assignee: employee }], total: 1 })),
    getLeadDetail: mock(async () => ({ lead, appointments: [appointment],
      appointmentTotal: 21, customer, assignee: employee,
      followUps: [], followUpTotal: 0 })),
    listFollowUps: mock(async () => ({ rows: [], total: 0 })),
    findLeadAccess: mock(async () => ({ id: LEAD_ID, tenant_id: TENANT_ID,
      assigned_employee_id: EMPLOYEE_ID })),
    findConversionPreflight: mock(async () => ({ leadId: LEAD_ID,
      phone: lead.phone, assignedEmployeeId: EMPLOYEE_ID,
      customerId: CUSTOMER_ID })),
    assign: mock(async () => ({ ok: true as const, data: { action: "assign" as const,
      result: "assigned" as const, lead_id: LEAD_ID,
      assigned_employee_id: EMPLOYEE_ID, lead_version: 2,
      appointments_updated: 1, idempotent: false } })),
    appendFollowUp: mock(async () => ({ ok: true as const, data: {
      action: "follow_up" as const, result: "followed_up" as const,
      lead_id: LEAD_ID, follow_up_id: "88888888-8888-4888-8888-888888888888",
      appointment_id: APPOINTMENT_ID, lead_version: 2,
      appointment_version: 2, appointment_status: "confirmed",
      idempotent: false } })),
    convert: mock(async () => ({ ok: true as const, data: {
      action: "convert" as const, result: "converted" as const,
      lead_id: LEAD_ID, customer_id: CUSTOMER_ID, created_customer: false,
      repeated_conversion: false, lead_version: 2, appointments_updated: 0,
      idempotent: false } })),
    markInvalid: mock(async () => ({ ok: true as const, data: {
      action: "mark_invalid" as const, result: "invalid" as const,
      lead_id: LEAD_ID, lead_version: 2, appointments_updated: 1,
      repeated_invalidation: false, idempotent: false } })),
  };
  const accessPolicy = {
    assertTenantContext: mock((context: AuthContext) => {
      if (!context.tenantId) throw Object.assign(new Error("tenant"), { statusCode: 403 });
      return context.tenantId;
    }),
    assertPermission: mock((context: AuthContext, permission: string) => {
      if (!context.permissions.some((item) => item.code === permission)) {
        throw Object.assign(new Error("forbidden"), { statusCode: 403 });
      }
      return "all";
    }),
    getVisibleCustomerOwnerIds: mock(async () => null),
  };
  const phonePrivacy = {
    createPrivacyContext: mock(async (context: AuthContext) => context),
    serializeCustomerPhoneFields: mock((_context: unknown, target: { phone?: string | null }) => ({
      phone: target.phone ?? null, phone_masked: "138****8000",
      can_view_phone: true, can_call_phone: false, can_copy_phone: false,
    })),
  };
  return {
    service: new Service({ repository, accessPolicy, phonePrivacy, ...overrides } as never),
    repository, accessPolicy, phonePrivacy,
  };
}

describe("TenantDouyinLeadsService", () => {
  test("defines the exact action permissions including invalidation", () => {
    expect(permissionFor("list")).toBe("douyin_lead.read");
    expect(permissionFor("detail")).toBe("douyin_lead.read");
    expect(permissionFor("follow_up_list")).toBe("douyin_lead.read");
    expect(permissionFor("assign")).toBe("douyin_lead.assign");
    expect(permissionFor("follow_up")).toBe("douyin_lead.follow_up");
    expect(permissionFor("convert")).toBe("douyin_lead.convert");
    expect(permissionFor("mark_invalid")).toBe("douyin_lead.convert");
  });

  test("requires tenant/read permission, echoes pagination and masks server-side", async () => {
    const context = fixture();
    const auth = authContext(["douyin_lead.read", "customer.read", "customer.phone.view"]);
    await expect(context.service.list(auth, {})).resolves.toMatchObject({
      list: [{ id: LEAD_ID, phone: lead.phone, phone_masked: "138****8000",
        latest_appointment: { id: APPOINTMENT_ID }, customer: { id: CUSTOMER_ID } }],
      pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
    });
    expect(context.repository.listLeads).toHaveBeenCalledWith({
      tenantId: TENANT_ID, page: 1, pageSize: 20, visibleAssigneeIds: null,
    });
    expect(context.phonePrivacy.createPrivacyContext).toHaveBeenCalledTimes(1);

    for (const auth of [authContext([], TENANT_ID), authContext(["douyin_lead.read"], null)]) {
      await expect(fixture().service.list(auth, {})).rejects.toMatchObject({ statusCode: 403 });
    }
  });

  test("applies the read permission scope to list, detail and follow-up pages", async () => {
    const hiddenAccessPolicy = {
      ...fixture().accessPolicy,
      getVisibleCustomerOwnerIds: mock(async () => [] as string[]),
    };
    const hidden = fixture({ accessPolicy: hiddenAccessPolicy });
    await expect(hidden.service.list(authContext(["douyin_lead.read"]), {}))
      .resolves.toMatchObject({ list: [], pagination: { total: 0 } });
    expect(hidden.repository.listLeads).not.toHaveBeenCalled();
    await expect(hidden.service.getDetail(
      authContext(["douyin_lead.read"]), LEAD_ID,
    )).rejects.toMatchObject({ statusCode: 404, code: "DOUYIN_LEAD_NOT_FOUND" });
    expect(hidden.repository.getLeadDetail).not.toHaveBeenCalled();
    await expect(hidden.service.listFollowUps(
      authContext(["douyin_lead.read"]), LEAD_ID, {},
    )).rejects.toMatchObject({ statusCode: 404, code: "DOUYIN_LEAD_NOT_FOUND" });
    expect(hidden.repository.listFollowUps).not.toHaveBeenCalled();

    const scopedAccessPolicy = {
      ...fixture().accessPolicy,
      getVisibleCustomerOwnerIds: mock(async () => [EMPLOYEE_ID]),
    };
    const scoped = fixture({ accessPolicy: scopedAccessPolicy });
    await scoped.service.list(authContext(["douyin_lead.read"]), {});
    expect(scoped.repository.listLeads).toHaveBeenCalledWith({
      tenantId: TENANT_ID, page: 1, pageSize: 20,
      visibleAssigneeIds: [EMPLOYEE_ID],
    });
  });

  test("uses the real customer phone scopes and defaults to masked-only", async () => {
    const context = fixture({ phonePrivacy: customerPhonePrivacyService });
    const result = await context.service.list(authContext(["douyin_lead.read"]), {});
    expect(result.list[0]).toMatchObject({
      phone: null,
      phone_masked: "138****8000",
      can_view_phone: false,
    });

    const viewOnly = await context.service.list(authContext([
      "douyin_lead.read", "customer.phone.view",
    ]), {});
    expect(viewOnly.list[0]).toMatchObject({ phone: null, can_view_phone: false });

    const visible = await context.service.list(authContext([
      "douyin_lead.read", "customer.read", "customer.phone.view",
    ]), {});
    expect(visible.list[0]).toMatchObject({
      phone: "13800138000", can_view_phone: true,
    });
  });

  test("returns explicit bounded appointment pagination for detail", async () => {
    const result = await fixture().service.getDetail(
      authContext(["douyin_lead.read"]), LEAD_ID,
    );
    expect(result.appointments).toEqual({
      list: [appointment],
      pagination: { page: 1, pageSize: 20, total: 21, totalPages: 2 },
      truncated: true,
    });
  });

  test("rejects an invalid exact appointment total", async () => {
    const context = fixture({ repository: {
      ...fixture().repository,
      getLeadDetail: mock(async () => ({ lead, appointments: [appointment],
        appointmentTotal: -1, customer, assignee: employee,
        followUps: [], followUpTotal: 0 })),
    } });
    await expect(context.service.getDetail(
      authContext(["douyin_lead.read"]), LEAD_ID,
    )).rejects.toMatchObject({ statusCode: 500,
      code: "DOUYIN_LEAD_RESPONSE_INVALID" });
  });

  test("denies missing tenant or permission for every read and write action", async () => {
    const command = { expected_lead_version: 1,
      idempotency_key: IDEMPOTENCY_KEY };
    const attempts = (context: ReturnType<typeof fixture>, auth: AuthContext) => [
      () => context.service.list(auth, {}),
      () => context.service.getDetail(auth, LEAD_ID),
      () => context.service.listFollowUps(auth, LEAD_ID, {}),
      () => context.service.assign(auth, LEAD_ID, {
        ...command, assigned_employee_id: EMPLOYEE_ID,
      }),
      () => context.service.appendFollowUp(auth, LEAD_ID, {
        ...command, appointment_id: APPOINTMENT_ID, follow_up_type: "phone",
        summary: "已联系", result: "等待上门", next_follow_up_at: null,
        appointment_status: null, confirmed_visit_at: null,
      }),
      () => context.service.convert(auth, LEAD_ID, command),
      () => context.service.markInvalid(auth, LEAD_ID, {
        ...command, reason: "无效",
      }),
    ];
    for (const auth of [authContext([], TENANT_ID),
      authContext(["douyin_lead.read", "douyin_lead.assign",
        "douyin_lead.follow_up", "douyin_lead.convert"], null)]) {
      const context = fixture();
      for (const attempt of attempts(context, auth)) {
        await expect(attempt()).rejects.toMatchObject({ statusCode: 403 });
      }
      expect(context.repository.listLeads).not.toHaveBeenCalled();
      expect(context.repository.assign).not.toHaveBeenCalled();
    }
  });

  test("requires every action permission before repository mutation", async () => {
    const bodies = {
      assign: { assigned_employee_id: EMPLOYEE_ID, expected_lead_version: 1,
        idempotency_key: IDEMPOTENCY_KEY },
      followUp: { appointment_id: APPOINTMENT_ID, follow_up_type: "phone",
        summary: "已联系", result: "等待上门", next_follow_up_at: null,
        appointment_status: null, confirmed_visit_at: null,
        expected_lead_version: 1, idempotency_key: IDEMPOTENCY_KEY },
      command: { expected_lead_version: 1, idempotency_key: IDEMPOTENCY_KEY },
      invalid: { reason: "超出服务范围", expected_lead_version: 1,
        idempotency_key: IDEMPOTENCY_KEY },
    };
    const cases = [
      ["assign", "assign", bodies.assign],
      ["appendFollowUp", "appendFollowUp", bodies.followUp],
      ["convert", "convert", bodies.command],
      ["markInvalid", "markInvalid", bodies.invalid],
    ] as const;
    for (const [method, repositoryMethod, body] of cases) {
      const context = fixture();
      await expect((context.service[method] as Function)(
        authContext([]), LEAD_ID, body,
      )).rejects.toMatchObject({ statusCode: 403 });
      expect(context.repository[repositoryMethod]).not.toHaveBeenCalled();
    }
  });

  test("requires an authenticated employee for every workflow mutation", async () => {
    const context = fixture();
    await expect(context.service.assign(
      authContext(["douyin_lead.assign"], TENANT_ID, null), LEAD_ID,
      { assigned_employee_id: EMPLOYEE_ID, expected_lead_version: 1,
        idempotency_key: IDEMPOTENCY_KEY },
    )).rejects.toMatchObject({ statusCode: 403,
      code: "DOUYIN_LEAD_EMPLOYEE_REQUIRED" });
    expect(context.repository.assign).not.toHaveBeenCalled();
  });

  test("requires customer.create only when scoped preflight finds no customer", async () => {
    const existing = fixture();
    await existing.service.convert(authContext(["douyin_lead.convert"]), LEAD_ID, {
      expected_lead_version: 1, idempotency_key: IDEMPOTENCY_KEY,
    });
    expect(existing.accessPolicy.assertPermission).not.toHaveBeenCalledWith(
      expect.anything(), "customer.create",
    );

    const absent = fixture({ repository: {
      ...fixture().repository,
      findConversionPreflight: mock(async () => ({ leadId: LEAD_ID,
        phone: lead.phone, assignedEmployeeId: EMPLOYEE_ID, customerId: null })),
    } });
    await expect(absent.service.convert(authContext(["douyin_lead.convert"]), LEAD_ID, {
      expected_lead_version: 1, idempotency_key: IDEMPOTENCY_KEY,
    })).rejects.toMatchObject({ statusCode: 403 });
    expect(absent.repository.convert).not.toHaveBeenCalled();

    await expect(absent.service.convert(
      authContext(["douyin_lead.convert", "customer.create"]), LEAD_ID,
      { expected_lead_version: 1, idempotency_key: IDEMPOTENCY_KEY },
    )).resolves.toMatchObject({ customer_id: CUSTOMER_ID });
    expect(absent.accessPolicy.assertPermission).toHaveBeenCalledWith(
      expect.anything(), "customer.create",
    );
  });

  test("passes exact command arguments and accepts idempotent replay", async () => {
    const context = fixture();
    const result = await context.service.appendFollowUp(
      authContext(["douyin_lead.follow_up"]), LEAD_ID,
      { appointment_id: APPOINTMENT_ID, follow_up_type: "phone",
        summary: "已联系", result: "等待上门", next_follow_up_at: null,
        appointment_status: "confirmed",
        confirmed_visit_at: "2026-08-23T01:00:00.000Z",
        expected_lead_version: 1, idempotency_key: IDEMPOTENCY_KEY },
    );
    expect(result).toMatchObject({ lead_id: LEAD_ID, appointment_id: APPOINTMENT_ID });
    expect(context.repository.appendFollowUp).toHaveBeenCalledWith({
      tenantId: TENANT_ID, leadId: LEAD_ID, appointmentId: APPOINTMENT_ID,
      actorEmployeeId: EMPLOYEE_ID, followUpType: "phone",
      summary: "已联系", result: "等待上门", nextFollowUpAt: null,
      appointmentStatus: "confirmed",
      confirmedVisitAt: "2026-08-23T01:00:00.000Z", expectedVersion: 1,
      idempotencyKey: IDEMPOTENCY_KEY,
    });
  });

  test("maps known conflicts and rejects wrong-scope command results", async () => {
    const conflict = fixture({ repository: {
      ...fixture().repository,
      assign: mock(async () => ({ ok: false as const, error: {
        status_code: 409 as const, code: "DOUYIN_LEAD_VERSION_CONFLICT" as const,
      } })),
    } });
    await expect(conflict.service.assign(authContext(["douyin_lead.assign"]), LEAD_ID, {
      assigned_employee_id: EMPLOYEE_ID, expected_lead_version: 1,
      idempotency_key: IDEMPOTENCY_KEY,
    })).rejects.toMatchObject({ statusCode: 409, code: "DOUYIN_LEAD_VERSION_CONFLICT" });

    const idempotencyConflict = fixture({ repository: {
      ...fixture().repository,
      convert: mock(async () => ({ ok: false as const, error: {
        status_code: 409 as const,
        code: "DOUYIN_LEAD_IDEMPOTENCY_CONFLICT" as const,
      } })),
    } });
    await expect(idempotencyConflict.service.convert(
      authContext(["douyin_lead.convert"]), LEAD_ID,
      { expected_lead_version: 1, idempotency_key: IDEMPOTENCY_KEY },
    )).rejects.toMatchObject({ statusCode: 409,
      code: "DOUYIN_LEAD_IDEMPOTENCY_CONFLICT" });

    const stalePreflight = fixture({ repository: {
      ...fixture().repository,
      findConversionPreflight: mock(async () => ({ leadId: LEAD_ID,
        phone: lead.phone, assignedEmployeeId: EMPLOYEE_ID, customerId: null })),
      convert: mock(async () => ({ ok: false as const, error: {
        status_code: 409 as const,
        code: "DOUYIN_LEAD_CUSTOMER_PREFLIGHT_CONFLICT" as const,
      } })),
    } });
    await expect(stalePreflight.service.convert(
      authContext(["douyin_lead.convert", "customer.create"]), LEAD_ID,
      { expected_lead_version: 1, idempotency_key: IDEMPOTENCY_KEY },
    )).rejects.toMatchObject({ statusCode: 409,
      code: "DOUYIN_LEAD_CUSTOMER_PREFLIGHT_CONFLICT" });

    const wrongLead = fixture({ repository: {
      ...fixture().repository,
      markInvalid: mock(async () => ({ ok: true as const, data: {
        action: "mark_invalid" as const, result: "invalid" as const,
        lead_id: "99999999-9999-4999-8999-999999999999", lead_version: 2,
        appointments_updated: 1, repeated_invalidation: false,
        idempotent: false } })),
    } });
    await expect(wrongLead.service.markInvalid(
      authContext(["douyin_lead.convert"]), LEAD_ID,
      { reason: "无效", expected_lead_version: 1,
        idempotency_key: IDEMPOTENCY_KEY },
    )).rejects.toMatchObject({ statusCode: 500,
      code: "DOUYIN_LEAD_RESPONSE_INVALID" });

    const wrongCustomer = fixture({ repository: {
      ...fixture().repository,
      convert: mock(async () => ({ ok: true as const, data: {
        action: "convert" as const, result: "converted" as const,
        lead_id: LEAD_ID, customer_id: "99999999-9999-4999-8999-999999999999",
        created_customer: false, repeated_conversion: false,
        lead_version: 2, appointments_updated: 0, idempotent: false } })),
    } });
    await expect(wrongCustomer.service.convert(
      authContext(["douyin_lead.convert"]), LEAD_ID,
      { expected_lead_version: 1, idempotency_key: IDEMPOTENCY_KEY },
    )).rejects.toMatchObject({ statusCode: 500,
      code: "DOUYIN_LEAD_RESPONSE_INVALID" });
  });

  test("rejects incomplete or cross-tenant hydrated relations before phone serialization", async () => {
    const context = fixture({ repository: {
      ...fixture().repository,
      listLeads: mock(async () => ({ rows: [{ lead, appointments: [appointment],
        customer: null, assignee: employee }], total: 1 })),
    } });
    await expect(context.service.list(
      authContext(["douyin_lead.read", "customer.read", "customer.phone.view"]),
      {},
    )).rejects.toMatchObject({ statusCode: 500,
      code: "DOUYIN_LEAD_RESPONSE_INVALID" });
    expect(context.phonePrivacy.serializeCustomerPhoneFields).not.toHaveBeenCalled();
  });
});
