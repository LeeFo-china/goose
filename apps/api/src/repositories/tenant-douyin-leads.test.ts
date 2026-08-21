import { beforeAll, describe, expect, mock, test } from "bun:test";

import { AppError } from "@/errors/app-error";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

let Repository: typeof import("./tenant-douyin-leads")
  .TenantDouyinLeadsRepository;

beforeAll(async () => {
  ({ TenantDouyinLeadsRepository: Repository } = await import(
    "./tenant-douyin-leads"
  ));
});

const TENANT_ID = "11111111-1111-4111-8111-111111111111";
const LEAD_ID = "22222222-2222-4222-8222-222222222222";
const APPOINTMENT_ID = "33333333-3333-4333-8333-333333333333";
const CUSTOMER_ID = "44444444-4444-4444-8444-444444444444";
const EMPLOYEE_ID = "55555555-5555-4555-8555-555555555555";
const DEPARTMENT_ID = "99999999-9999-4999-8999-999999999999";
const IDEMPOTENCY_KEY = "66666666-6666-4666-8666-666666666666";
const CREATED_AT = "2026-08-21T08:00:00.000Z";

const lead = {
  id: LEAD_ID,
  tenant_id: TENANT_ID,
  douyin_miniapp_installation_id: "77777777-7777-4777-8777-777777777777",
  customer_id: CUSTOMER_ID,
  assigned_employee_id: EMPLOYEE_ID,
  name: "李女士",
  phone: "13800138000",
  community: "晴天花园",
  lead_status: "new" as const,
  form_data: { demand: "旧房翻新" },
  created_at: CREATED_AT,
  followed_at: null,
  follow_remark: null,
  version: 1,
};
const appointment = {
  id: APPOINTMENT_ID,
  appointment_no: "DYLF-20260821-000001",
  tenant_id: TENANT_ID,
  marketing_lead_id: LEAD_ID,
  customer_id: CUSTOMER_ID,
  assigned_employee_id: EMPLOYEE_ID,
  budget_estimate_id: null,
  preferred_visit_date: "2026-08-23",
  preferred_visit_period: "morning" as const,
  community: "晴天花园",
  status: "pending_confirmation" as const,
  confirmed_visit_at: null,
  source_snapshot: {
    privacy_policy_version: "2026-08-01",
    consented_at: CREATED_AT,
    attribution: {},
    demand: "旧房翻新",
    budget_estimate: null,
  },
  created_at: CREATED_AT,
  updated_at: CREATED_AT,
  version: 1,
};
const { source_snapshot: _sourceSnapshot, ...appointmentSummary } = appointment;
const customer = {
  id: CUSTOMER_ID,
  tenant_id: TENANT_ID,
  name: "李女士",
  status: "potential",
  owner_id: EMPLOYEE_ID,
};
const employee = {
  id: EMPLOYEE_ID,
  tenant_id: TENANT_ID,
  name: "王顾问",
  avatar: null,
  status: "active",
};

type Result = { data: unknown; error: unknown; count?: number | null };
type Call = { method: string; args: unknown[] };

function clientWith(results: Result[]) {
  const calls: Call[] = [];
  let index = 0;
  class Query implements PromiseLike<Result> {
    constructor(private readonly result: Result) {}
    private chain(method: string, args: unknown[]) {
      calls.push({ method, args });
      return this;
    }
    select(...args: unknown[]) { return this.chain("select", args); }
    eq(...args: unknown[]) { return this.chain("eq", args); }
    gte(...args: unknown[]) { return this.chain("gte", args); }
    lt(...args: unknown[]) { return this.chain("lt", args); }
    lte(...args: unknown[]) { return this.chain("lte", args); }
    or(...args: unknown[]) { return this.chain("or", args); }
    in(...args: unknown[]) { return this.chain("in", args); }
    order(...args: unknown[]) { return this.chain("order", args); }
    range(...args: unknown[]) { return this.chain("range", args); }
    limit(...args: unknown[]) { return this.chain("limit", args); }
    maybeSingle() {
      calls.push({ method: "maybeSingle", args: [] });
      return Promise.resolve(this.result);
    }
    then<TResult1 = Result, TResult2 = never>(
      onfulfilled?: ((value: Result) => TResult1 | PromiseLike<TResult1>) | null,
      onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
    ) {
      return Promise.resolve(this.result).then(onfulfilled, onrejected);
    }
  }
  return {
    calls,
    client: {
      from: mock((table: string) => {
        calls.push({ method: "from", args: [table] });
        return new Query(results[index++] ?? { data: [], error: null });
      }),
      rpc: mock((name: string, args: unknown) => {
        calls.push({ method: "rpc", args: [name, args] });
        return Promise.resolve(results[index++] ?? { data: null, error: null });
      }),
    },
  };
}

describe("TenantDouyinLeadsRepository", () => {
  test("uses exact pagination, strict tenant filters and bounded batch hydration", async () => {
    const context = clientWith([
      { data: { data: { list: [lead], total: 21 } }, error: null },
      { data: [appointmentSummary], error: null },
      { data: [customer], error: null },
      { data: [employee], error: null },
    ]);
    const repository = new Repository(context.client as never);

    await expect(repository.listLeads({
      tenantId: TENANT_ID,
      page: 2,
      pageSize: 20,
      status: "new",
      assigneeId: EMPLOYEE_ID,
      dateFrom: "2026-08-01",
      dateTo: "2026-08-21",
      keyword: "晴天",
      visibleAssigneeIds: [EMPLOYEE_ID],
    })).resolves.toEqual({
      rows: [{ lead, appointments: [{ ...appointmentSummary,
        budget_range: null }], customer, assignee: employee }],
      total: 21,
    });

    expect(context.calls[0]).toEqual({ method: "rpc", args: [
      "list_tenant_douyin_leads", {
        p_tenant_id: TENANT_ID, p_visible_assignee_ids: [EMPLOYEE_ID],
        p_status: "new", p_assignee_id: EMPLOYEE_ID,
        p_date_from: "2026-08-01T00:00:00+08:00",
        p_date_to_exclusive: "2026-08-22T00:00:00+08:00",
        p_keyword: "晴天", p_page: 2, p_page_size: 20,
      },
    ] });
    expect(context.calls.filter((call) => call.method === "from"))
      .toHaveLength(2);
    const selects = context.calls.filter((call) => call.method === "select")
      .map((call) => String(call.args[0])).join(",");
    expect(selects).not.toMatch(/request_ip|user_agent|sms_verification_code_id|create_request_hash/);
    expect(String(context.calls.find((call) => call.method === "select")?.args[0]))
      .not.toContain("form_data");
  });

  test("does not hydrate an empty page and rejects invalid exact counts", async () => {
    const empty = clientWith([{ data: { data: { list: [], total: 0 } }, error: null }]);
    await expect(new Repository(empty.client as never).listLeads({
      tenantId: TENANT_ID, page: 1, pageSize: 20, visibleAssigneeIds: null,
    })).resolves.toEqual({ rows: [], total: 0 });
    expect(empty.calls.filter((call) => call.method === "from")).toHaveLength(0);

    const badCount = clientWith([{ data: { data: { list: [], total: -1 } }, error: null }]);
    await expect(new Repository(badCount.client as never).listLeads({
      tenantId: TENANT_ID, page: 1, pageSize: 20, visibleAssigneeIds: null,
    })).rejects.toMatchObject({ statusCode: 500, code: "DB_ERROR" });
  });
  test("posts a thousand visible assignee ids without an unbounded GET filter", async () => {
    const visible = Array.from({ length: 1_000 }, (_, index) =>
      `aaaaaaaa-aaaa-4aaa-8aaa-${String(index + 1).padStart(12, "0")}`);
    const context = clientWith([{
      data: { data: { list: [], total: 0 } }, error: null }]);
    await new Repository(context.client as never).listLeads({
      tenantId: TENANT_ID, page: 1, pageSize: 100, visibleAssigneeIds: visible,
    });
    expect(context.calls).toEqual([{ method: "rpc", args: [
      "list_tenant_douyin_leads", expect.objectContaining({
        p_visible_assignee_ids: visible, p_page_size: 100 }),
    ] }]);
  });
  test("loads exactly one latest summary per lead through the bounded RPC", async () => {
    const leads = Array.from({ length: 51 }, (_, index) => ({
      ...lead,
      id: `22222222-2222-4222-8222-${String(index + 1).padStart(12, "0")}`,
      customer_id: null,
      assigned_employee_id: null,
    }));
    const latest = { ...appointmentSummary, marketing_lead_id: leads[0]!.id,
      customer_id: null, assigned_employee_id: null };
    const context = clientWith([
      { data: { data: { list: leads, total: 51 } }, error: null },
      { data: [latest], error: null },
      { data: [], error: null },
    ]);
    const result = await new Repository(context.client as never).listLeads({
      tenantId: TENANT_ID, page: 1, pageSize: 100, visibleAssigneeIds: null,
    });
    expect(result.rows[0]?.appointments).toEqual([{ ...latest,
      budget_range: null }]);
    expect(context.calls.filter((call) => call.method === "rpc"
      && call.args[0] === "list_tenant_douyin_lead_latest_appointments"))
      .toEqual([{ method: "rpc", args: [
        "list_tenant_douyin_lead_latest_appointments",
        { p_tenant_id: TENANT_ID,
          p_marketing_lead_ids: leads.map((item) => item.id) },
      ] }]);
    expect(context.calls.filter((call) => call.method === "from")
      .map((call) => call.args[0]))
      .not.toContain("douyin_measurement_appointments");
  });

  test("loads bounded detail appointments and the first follow-up page", async () => {
    const followUp = {
      id: "88888888-8888-4888-8888-888888888888", tenant_id: TENANT_ID,
      marketing_lead_id: LEAD_ID,
      douyin_measurement_appointment_id: APPOINTMENT_ID,
      employee_id: EMPLOYEE_ID, follow_up_type: "phone" as const,
      summary: "已联系", result: "等待上门", next_follow_up_at: null,
      created_at: CREATED_AT,
    };
    const context = clientWith([
      { data: lead, error: null },
      { data: Array.from({ length: 20 }, (_, index) => ({ ...appointment,
        id: `aaaaaaaa-aaaa-4aaa-8aaa-${String(index + 1).padStart(12, "0")}` })),
        error: null, count: 21 },
      { data: [customer], error: null },
      { data: [employee], error: null },
      { data: [followUp], error: null, count: 22 },
      { data: [employee], error: null },
    ]);
    await expect(new Repository(context.client as never).getLeadDetail({
      tenantId: TENANT_ID, leadId: LEAD_ID,
    })).resolves.toMatchObject({
      lead: { id: LEAD_ID }, appointments: expect.any(Array), appointmentTotal: 21,
      followUps: [{ followUp: { id: followUp.id } }], followUpTotal: 22,
    });
    expect(context.calls).toContainEqual({ method: "range", args: [0, 19] });
    expect(context.calls).toContainEqual({ method: "select",
      args: [expect.stringContaining("source_snapshot"), { count: "exact" }] });
  });
  test("paginates appointment details with necessary fields and exact count", async () => {
    const context = clientWith([{ data: [appointment], error: null, count: 121 }]);
    const result = await new Repository(context.client as never).listAppointments({
      tenantId: TENANT_ID, leadId: LEAD_ID, page: 2, pageSize: 100,
    });
    expect(result).toEqual({ rows: [appointment], total: 121 });
    expect(context.calls).toContainEqual({ method: "range", args: [100, 199] });
    expect(context.calls).toContainEqual({ method: "eq",
      args: ["tenant_id", TENANT_ID] });
    expect(context.calls).toContainEqual({ method: "eq",
      args: ["marketing_lead_id", LEAD_ID] });
    const select = context.calls.find((call) => call.method === "select");
    expect(String(select?.args[0])).toContain("source_snapshot");
    expect(String(select?.args[0])).not.toMatch(/request_ip|form_data|phone/);
  });

  test("rejects cross-scope or over-page appointment responses", async () => {
    for (const data of [
      [{ ...appointment, tenant_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" }],
      Array.from({ length: 21 }, (_, index) => ({ ...appointment,
        id: `aaaaaaaa-aaaa-4aaa-8aaa-${String(index + 1).padStart(12, "0")}` })),
    ]) {
      const context = clientWith([{ data, error: null, count: data.length }]);
      await expect(new Repository(context.client as never).listAppointments({
        tenantId: TENANT_ID, leadId: LEAD_ID, page: 1, pageSize: 20 }))
        .rejects.toMatchObject({ statusCode: 500, code: "DB_ERROR",
          details: undefined });
    }
  });

  test("paginates follow-ups and hydrates employees in one bounded batch", async () => {
    const followUp = {
      id: "88888888-8888-4888-8888-888888888888",
      tenant_id: TENANT_ID,
      marketing_lead_id: LEAD_ID,
      douyin_measurement_appointment_id: APPOINTMENT_ID,
      employee_id: EMPLOYEE_ID,
      follow_up_type: "phone" as const,
      summary: "已联系",
      result: "等待上门",
      next_follow_up_at: null,
      created_at: CREATED_AT,
    };
    const context = clientWith([
      { data: [followUp], error: null, count: 31 },
      { data: [employee], error: null },
    ]);
    const result = await new Repository(context.client as never).listFollowUps({
      tenantId: TENANT_ID,
      leadId: LEAD_ID,
      page: 2,
      pageSize: 20,
    });
    expect(result).toEqual({
      rows: [{ followUp, employee }],
      total: 31,
    });
    expect(context.calls).toContainEqual({ method: "range", args: [20, 39] });
    expect(context.calls.filter((call) =>
      call.method === "in" && call.args[0] === "id"
    )).toHaveLength(1);
  });

  test("preflights customer creation with deterministic tenant phone lookup", async () => {
    const context = clientWith([
      { data: { id: LEAD_ID, tenant_id: TENANT_ID, phone: lead.phone,
        customer_id: null, assigned_employee_id: EMPLOYEE_ID }, error: null },
      { data: customer, error: null },
    ]);
    await expect(new Repository(context.client as never).findConversionPreflight({
      tenantId: TENANT_ID,
      leadId: LEAD_ID,
    })).resolves.toEqual({
      leadId: LEAD_ID,
      phone: lead.phone,
      assignedEmployeeId: EMPLOYEE_ID,
      customerId: CUSTOMER_ID,
    });
    expect(context.calls).toContainEqual({ method: "eq", args: ["tenant_id", TENANT_ID] });
    expect(context.calls).toContainEqual({ method: "eq", args: ["phone", lead.phone] });
    expect(context.calls).toContainEqual({ method: "order", args: ["created_at", { ascending: true }] });
    expect(context.calls).toContainEqual({ method: "order", args: ["id", { ascending: true }] });
    expect(context.calls).toContainEqual({ method: "limit", args: [1] });
  });

  test("invokes only canonical workflow RPCs with exact scoped arguments", async () => {
    const envelopes = [
      { data: { action: "assign", result: "assigned", lead_id: LEAD_ID,
        assigned_employee_id: EMPLOYEE_ID, lead_version: 2,
        appointments_updated: 1, idempotent: false } },
      { data: { action: "follow_up", result: "followed_up", lead_id: LEAD_ID,
        follow_up_id: "88888888-8888-4888-8888-888888888888",
        appointment_id: APPOINTMENT_ID, lead_version: 3,
        appointment_version: 2, appointment_status: "confirmed", idempotent: false } },
      { data: { action: "convert", result: "converted", lead_id: LEAD_ID,
        customer_id: CUSTOMER_ID, created_customer: false,
        repeated_conversion: false, lead_version: 4,
        appointments_updated: 1, idempotent: false } },
      { data: { action: "mark_invalid", result: "invalid", lead_id: LEAD_ID,
        lead_version: 4, appointments_updated: 1,
        repeated_invalidation: false, idempotent: false } },
    ].map((data) => ({ data, error: null }));
    const context = clientWith(envelopes);
    const repository = new Repository(context.client as never);
    await repository.assign({ tenantId: TENANT_ID, leadId: LEAD_ID,
      actorEmployeeId: EMPLOYEE_ID, assignedEmployeeId: EMPLOYEE_ID,
      expectedVersion: 1, idempotencyKey: IDEMPOTENCY_KEY,
      expectedAssigneeDepartmentId: DEPARTMENT_ID });
    await repository.appendFollowUp({ tenantId: TENANT_ID, leadId: LEAD_ID,
      appointmentId: APPOINTMENT_ID, actorEmployeeId: EMPLOYEE_ID,
      followUpType: "phone", summary: "已联系", result: "等待上门",
      nextFollowUpAt: null, appointmentStatus: "confirmed",
      confirmedVisitAt: "2026-08-23T01:00:00.000Z", expectedVersion: 2,
      idempotencyKey: IDEMPOTENCY_KEY });
    await repository.convert({ tenantId: TENANT_ID, leadId: LEAD_ID,
      actorEmployeeId: EMPLOYEE_ID, expectedVersion: 3,
      idempotencyKey: IDEMPOTENCY_KEY, expectedCustomerId: CUSTOMER_ID,
      allowCustomerCreate: false });
    await repository.markInvalid({ tenantId: TENANT_ID, leadId: LEAD_ID,
      actorEmployeeId: EMPLOYEE_ID, reason: "超出服务范围", expectedVersion: 3,
      idempotencyKey: IDEMPOTENCY_KEY });

    const rpcCalls = context.calls.filter((call) => call.method === "rpc");
    expect(rpcCalls.map((call) => call.args[0])).toEqual([
      "assign_douyin_lead", "append_douyin_lead_follow_up",
      "convert_douyin_lead_to_customer", "mark_douyin_lead_invalid",
    ]);
    expect(rpcCalls[0]?.args[1]).toEqual({
      p_tenant_id: TENANT_ID, p_marketing_lead_id: LEAD_ID,
      p_actor_employee_id: EMPLOYEE_ID,
      p_assigned_employee_id: EMPLOYEE_ID,
      p_expected_version: 1, p_idempotency_key: IDEMPOTENCY_KEY,
      p_expected_assignee_department_id: DEPARTMENT_ID,
    });
    expect(rpcCalls[1]?.args[1]).toEqual({
      p_tenant_id: TENANT_ID,
      p_marketing_lead_id: LEAD_ID,
      p_appointment_id: APPOINTMENT_ID,
      p_actor_employee_id: EMPLOYEE_ID,
      p_follow_up_type: "phone",
      p_summary: "已联系",
      p_result: "等待上门",
      p_next_follow_up_at: null,
      p_appointment_status: "confirmed",
      p_confirmed_visit_at: "2026-08-23T01:00:00.000Z",
      p_expected_version: 2,
      p_idempotency_key: IDEMPOTENCY_KEY,
    });
    expect(rpcCalls[2]?.args[1]).toEqual({
      p_tenant_id: TENANT_ID, p_marketing_lead_id: LEAD_ID,
      p_actor_employee_id: EMPLOYEE_ID, p_expected_version: 3,
      p_idempotency_key: IDEMPOTENCY_KEY,
      p_expected_customer_id: CUSTOMER_ID, p_allow_customer_create: false,
    });
  });

  test("requires appointments_updated in the real conversion response", async () => {
    const context = clientWith([{ data: { data: {
      action: "convert", result: "converted", lead_id: LEAD_ID,
      customer_id: CUSTOMER_ID, created_customer: false,
      repeated_conversion: false, lead_version: 2, idempotent: false,
    } }, error: null }]);
    await expect(new Repository(context.client as never).convert({
      tenantId: TENANT_ID, leadId: LEAD_ID, actorEmployeeId: EMPLOYEE_ID,
      expectedVersion: 1, idempotencyKey: IDEMPOTENCY_KEY,
      expectedCustomerId: CUSTOMER_ID, allowCustomerCreate: false,
    })).rejects.toMatchObject({ statusCode: 500, code: "DB_ERROR" });
  });

  test("returns the canonical idempotent replay without rewriting it", async () => {
    const replay = { action: "assign" as const, result: "assigned" as const,
      lead_id: LEAD_ID,
      assigned_employee_id: EMPLOYEE_ID, lead_version: 2,
      appointments_updated: 1, idempotent: true };
    const repository = new Repository(clientWith([{
      data: { data: replay }, error: null,
    }]).client as never);
    await expect(repository.assign({ tenantId: TENANT_ID, leadId: LEAD_ID,
      actorEmployeeId: EMPLOYEE_ID, assignedEmployeeId: EMPLOYEE_ID,
      expectedVersion: 1, idempotencyKey: IDEMPOTENCY_KEY,
      expectedAssigneeDepartmentId: null }))
      .resolves.toEqual({ ok: true, data: replay });
  });

  test("accepts only strict command envelopes and never exposes database details", async () => {
    const invalidEnvelope = clientWith([{
      data: { error: { status_code: 409, code: "DOUYIN_LEAD_VERSION_CONFLICT", raw: "secret" } },
      error: null,
    }]);
    await expect(new Repository(invalidEnvelope.client as never).assign({
      tenantId: TENANT_ID, leadId: LEAD_ID, actorEmployeeId: EMPLOYEE_ID,
      assignedEmployeeId: EMPLOYEE_ID, expectedVersion: 1,
      idempotencyKey: IDEMPOTENCY_KEY, expectedAssigneeDepartmentId: null,
    })).rejects.toMatchObject({ statusCode: 500, code: "DB_ERROR", details: undefined });

    const databaseFailure = clientWith([{ data: null, error: { message: "secret" } }]);
    try {
      await new Repository(databaseFailure.client as never).convert({
        tenantId: TENANT_ID, leadId: LEAD_ID, actorEmployeeId: EMPLOYEE_ID,
        expectedVersion: 1, idempotencyKey: IDEMPOTENCY_KEY,
        expectedCustomerId: CUSTOMER_ID, allowCustomerCreate: false,
      });
      throw new TypeError("expected rejection");
    } catch (error) {
      expect(error).toBeInstanceOf(AppError);
      expect(error).toMatchObject({ statusCode: 500, code: "DB_ERROR", details: undefined });
      expect(String((error as Error).message)).not.toContain("secret");
    }
  });

  test("rejects mismatched business status codes and relation overflow as DB errors", async () => {
    const mismatched = clientWith([{
      data: { error: { status_code: 500,
        code: "DOUYIN_LEAD_VERSION_CONFLICT" } }, error: null,
    }]);
    await expect(new Repository(mismatched.client as never).assign({
      tenantId: TENANT_ID, leadId: LEAD_ID, actorEmployeeId: EMPLOYEE_ID,
      assignedEmployeeId: EMPLOYEE_ID, expectedVersion: 1,
      idempotencyKey: IDEMPOTENCY_KEY, expectedAssigneeDepartmentId: null,
    })).rejects.toMatchObject({ statusCode: 500, code: "DB_ERROR" });

    const secondLead = { ...lead,
      id: "99999999-9999-4999-8999-999999999999", customer_id: null,
      assigned_employee_id: null };
    const tooMany = Array.from({ length: 21 }, (_, index) => ({
      ...appointment,
      id: `aaaaaaaa-aaaa-4aaa-8aaa-${String(index + 1).padStart(12, "0")}`,
      customer_id: null,
    }));
    const overflow = clientWith([
      { data: { data: { list: [
        { ...lead, customer_id: null, assigned_employee_id: null }, secondLead,
      ], total: 2 } }, error: null },
      { data: tooMany, error: null },
    ]);
    await expect(new Repository(overflow.client as never).listLeads({
      tenantId: TENANT_ID, page: 1, pageSize: 20, visibleAssigneeIds: null,
    })).rejects.toMatchObject({ statusCode: 500, code: "DB_ERROR" });
  });
});
