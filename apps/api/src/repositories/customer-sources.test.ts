import { beforeAll, describe, expect, test } from "bun:test";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

let CustomerSourceRepository: typeof import("./customer-sources")
  .CustomerSourceRepository;
let serializeDouyinCustomerSourceMetadata: typeof import("./customer-source-douyin-metadata")
  .serializeDouyinCustomerSourceMetadata;

beforeAll(async () => {
  ({ CustomerSourceRepository } = await import("./customer-sources"));
  ({ serializeDouyinCustomerSourceMetadata } = await import(
    "./customer-source-douyin-metadata"
  ));
});

type QueryResult = { data: unknown; error: unknown; count?: number | null };

function clientWith(result: QueryResult) {
  const calls: Array<{ method: string; args: unknown[] }> = [];
  class Query implements PromiseLike<QueryResult> {
    private chain(method: string, args: unknown[]) {
      calls.push({ method, args });
      return this;
    }
    select(...args: unknown[]) { return this.chain("select", args); }
    eq(...args: unknown[]) { return this.chain("eq", args); }
    order(...args: unknown[]) { return this.chain("order", args); }
    range(...args: unknown[]) { return this.chain("range", args); }
    then<TResult1 = QueryResult, TResult2 = never>(
      onfulfilled?: ((value: QueryResult) => TResult1 | PromiseLike<TResult1>) | null,
      onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
    ) {
      return Promise.resolve(result).then(onfulfilled, onrejected);
    }
  }
  return {
    calls,
    client: {
      from(table: string) {
        calls.push({ method: "from", args: [table] });
        return new Query();
      },
    },
  };
}

describe("Douyin customer source serialization", () => {
  test("projects only the stored appointment, estimate range and AI summary", () => {
    const serialized = serializeDouyinCustomerSourceMetadata({
      installation_id: "11111111-1111-4111-8111-111111111111",
      marketing_lead_id: "22222222-2222-4222-8222-222222222222",
      appointment_id: "33333333-3333-4333-8333-333333333333",
      appointment_no: "DYLF-20260822-000001",
      appointment_status: "confirmed",
      request_ip: "127.0.0.1",
      user_agent: "unsafe-agent",
      subject_hash: "unsafe-subject",
      budget_estimate_id: "44444444-4444-4444-8444-444444444444",
      budget_estimate: {
        estimate_no: "DYYS-20260822-000001",
        result: {
          minimum_total: 98_000,
          maximum_total: 128_000,
          categories: [{ category_code: "base", minimum_amount: 80_000 }],
        },
        ai_status: "succeeded",
        ai_analysis: {
          summary: "优先确认水电与柜体范围。",
          allocation_advice: ["基础施工优先保留。"],
          risk_factors: ["旧房拆改量需现场复核。"],
          onsite_questions: ["是否保留原有地板？"],
        },
        expired: false,
        raw_response: "unsafe-model-output",
      },
    });

    expect(serialized).toEqual({
      appointment_no: "DYLF-20260822-000001",
      status: "confirmed",
      estimate_no: "DYYS-20260822-000001",
      minimum_total: 98_000,
      maximum_total: 128_000,
      ai_status: "succeeded",
      ai_summary: "优先确认水电与柜体范围。",
      allocation_advice: ["基础施工优先保留。"],
      risk_factors: ["旧房拆改量需现场复核。"],
      onsite_questions: ["是否保留原有地板？"],
    });
    expect(JSON.stringify(serialized)).not.toMatch(
      /installation|lead_id|appointment_id|budget_estimate_id|request_ip|user_agent|subject_hash|raw_response/,
    );
  });

  test("uses a strict safe fallback for malformed legacy metadata", () => {
    expect(serializeDouyinCustomerSourceMetadata({
      appointment_no: "legacy-number",
      appointment_status: "contacted",
      budget_estimate: {
        estimate_no: "unsafe-number",
        result: { minimum_total: 200_000, maximum_total: 100_000 },
        ai_status: "succeeded",
        ai_analysis: {
          summary: "",
          allocation_advice: ["ok", 1],
          risk_factors: "raw text",
          onsite_questions: [],
        },
      },
    })).toEqual({
      appointment_no: null,
      status: null,
      estimate_no: null,
      minimum_total: null,
      maximum_total: null,
      ai_status: null,
      ai_summary: null,
      allocation_advice: [],
      risk_factors: [],
      onsite_questions: [],
    });
  });

  test("loads only the latest bounded page and serializes the public Douyin source", async () => {
    const context = clientWith({
      data: [{
        id: "source-1",
        tenant_id: "tenant-1",
        customer_id: "customer-1",
        source: "douyin_miniapp",
        source_label: "抖音小程序",
        platform_lead_id: null,
        assigned_by_employee_id: null,
        assigned_at: "2026-08-22T10:00:00.000Z",
        metadata: {
          appointment_no: "DYLF-20260822-000001",
          appointment_status: "pending_confirmation",
          budget_estimate: null,
          request_ip: "unsafe",
        },
        created_at: "2026-08-22T10:00:00.000Z",
        source_employee_id: null,
        related_type: null,
        related_id: null,
        share_link_id: null,
        marketing_lead_id: "lead-1",
        douyin_measurement_appointment_id: null,
      }],
      error: null,
      count: 1,
    });

    const result = await new CustomerSourceRepository(context.client as never)
      .listByCustomer({
        tenantId: "tenant-1",
        customerId: "customer-1",
        query: { page: 1, pageSize: 20 },
      });

    expect(context.calls).toContainEqual({ method: "range", args: [0, 19] });
    expect(context.calls).toContainEqual({ method: "eq", args: ["tenant_id", "tenant-1"] });
    expect(context.calls).toContainEqual({ method: "eq", args: ["customer_id", "customer-1"] });
    expect(context.calls.find((call) => call.method === "select")?.args[0])
      .not.toBe("*");
    expect(result.list[0]).toMatchObject({
      source: "douyin",
      source_label: "抖音小程序",
      display_label: "抖音小程序",
      metadata: {
        appointment_no: "DYLF-20260822-000001",
        status: "pending_confirmation",
      },
    });
    expect(JSON.stringify(result.list[0]?.metadata)).not.toContain("request_ip");
  });
});
