import { beforeAll, describe, expect, mock, test } from "bun:test";

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
const BUDGET_ID = "bbbbbbbb-bbbb-4bbb-8bbb-000000000001";
const CREATED_AT = "2026-08-21T08:00:00.000Z";
const lead = {
  id: LEAD_ID, tenant_id: TENANT_ID,
  douyin_miniapp_installation_id: null, customer_id: null,
  assigned_employee_id: null, name: "李女士", phone: "13800138000",
  community: "晴天花园", lead_status: "new", form_data: {},
  created_at: CREATED_AT, followed_at: null, follow_remark: null, version: 1,
};
const appointment = {
  id: APPOINTMENT_ID, appointment_no: "DYLF-20260821-000001",
  tenant_id: TENANT_ID, marketing_lead_id: LEAD_ID, customer_id: null,
  assigned_employee_id: null, budget_estimate_id: BUDGET_ID,
  preferred_visit_date: "2026-08-23", preferred_visit_period: "morning" as const,
  community: "晴天花园", status: "pending_confirmation" as const,
  confirmed_visit_at: null, created_at: CREATED_AT, updated_at: CREATED_AT,
  version: 1,
};

function budgetRow(id: string, totals: {
  minimum_total: number; maximum_total: number;
} = { minimum_total: 110_000, maximum_total: 140_000 }) {
  return { id, tenant_id: TENANT_ID, payload_id: id, ...totals };
}

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
    in(...args: unknown[]) { return this.chain("in", args); }
    order(...args: unknown[]) { return this.chain("order", args); }
    range(...args: unknown[]) { return this.chain("range", args); }
    limit(...args: unknown[]) { return this.chain("limit", args); }
    maybeSingle() { return Promise.resolve(this.result); }
    then<TResult1 = Result, TResult2 = never>(
      onfulfilled?: ((value: Result) => TResult1 | PromiseLike<TResult1>) | null,
      onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
    ) { return Promise.resolve(this.result).then(onfulfilled, onrejected); }
  }
  return { calls, client: {
    from: mock((table: string) => {
      calls.push({ method: "from", args: [table] });
      return new Query(results[index++] ?? { data: [], error: null });
    }),
    rpc: mock((name: string, args: unknown[]) => {
      calls.push({ method: "rpc", args: [name, args] });
      return Promise.resolve(results[index++] ?? { data: [], error: null });
    }),
  } };
}

describe("TenantDouyinLeadsRepository budget ranges", () => {
  test("hydrates only a strict public yuan range for the latest appointment", async () => {
    const context = clientWith([
      { data: [lead], error: null, count: 1 },
      { data: [appointment], error: null },
      { data: [budgetRow(BUDGET_ID)], error: null },
    ]);
    const result = await new Repository(context.client as never).listLeads({
      tenantId: TENANT_ID, page: 1, pageSize: 20, visibleAssigneeIds: null,
    });
    expect(result.rows[0]?.appointments[0]).toMatchObject({
      id: APPOINTMENT_ID,
      budget_range: { minimum_total: 110_000, maximum_total: 140_000 },
    });
    expect(JSON.stringify(result)).not.toMatch(/result_payload|categories|pricing_version/);
    expect(context.calls).toContainEqual({ method: "select", args: [
      "id,tenant_id,payload_id:result_payload->>id,minimum_total:result_payload->minimum_total,maximum_total:result_payload->maximum_total",
    ] });
    expect(context.calls).toContainEqual({ method: "eq",
      args: ["tenant_id", TENANT_ID] });
    expect(context.calls).toContainEqual({ method: "in",
      args: ["id", [BUDGET_ID]] });
    expect(context.calls).toContainEqual({ method: "limit", args: [1] });
  });

  test("loads more than fifty latest budget ranges in bounded batches", async () => {
    const leads = Array.from({ length: 51 }, (_, index) => ({ ...lead,
      id: `22222222-2222-4222-8222-${String(index + 1).padStart(12, "0")}` }));
    const budgetIds = leads.map((_, index) =>
      `bbbbbbbb-bbbb-4bbb-8bbb-${String(index + 1).padStart(12, "0")}`);
    const appointments = leads.map((item, index) => ({ ...appointment,
      id: `33333333-3333-4333-8333-${String(index + 1).padStart(12, "0")}`,
      marketing_lead_id: item.id, budget_estimate_id: budgetIds[index] }));
    const budgetRows = budgetIds.map((id) => budgetRow(id));
    const context = clientWith([
      { data: leads, error: null, count: 51 }, { data: appointments, error: null },
      { data: budgetRows.slice(0, 50), error: null },
      { data: budgetRows.slice(50), error: null },
    ]);
    const result = await new Repository(context.client as never).listLeads({
      tenantId: TENANT_ID, page: 1, pageSize: 100, visibleAssigneeIds: null,
    });
    expect(result.rows).toHaveLength(51);
    expect(context.calls.filter((call) => call.method === "in"
      && call.args[0] === "id").map((call) => (call.args[1] as unknown[]).length))
      .toEqual([50, 1]);
  });

  test("keeps detail appointments unchanged without a budget range query", async () => {
    const detailAppointment = { ...appointment, source_snapshot: {} };
    const valid = clientWith([
      { data: lead, error: null },
      { data: [detailAppointment], error: null, count: 1 },
      { data: [], error: null, count: 0 },
    ]);
    const detail = await new Repository(valid.client as never).getLeadDetail({
      tenantId: TENANT_ID, leadId: LEAD_ID,
    });
    expect(detail?.appointments[0]).toEqual(detailAppointment);
    expect(valid.calls.filter((call) => call.method === "from")
      .map((call) => call.args[0])).not.toContain("douyin_budget_estimates");
  });

  test("rejects unsafe persisted totals with a redacted error", async () => {
    for (const totals of [
      { minimum_total: 150_000, maximum_total: 140_000 },
      { minimum_total: 110_000, maximum_total: Number.MAX_SAFE_INTEGER + 1 },
      { minimum_total: 110_000.5, maximum_total: 140_000 },
    ]) {
      const unsafe = clientWith([
        { data: [lead], error: null, count: 1 },
        { data: [appointment], error: null },
        { data: [budgetRow(BUDGET_ID, totals)], error: null },
      ]);
      await expect(new Repository(unsafe.client as never).listLeads({
        tenantId: TENANT_ID, page: 1, pageSize: 20, visibleAssigneeIds: null,
      })).rejects.toMatchObject({ statusCode: 500, code: "DB_ERROR",
        details: undefined });
    }
  });
});
