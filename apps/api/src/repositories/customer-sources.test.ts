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

function clientWith(
  result: QueryResult,
  rpcResult: QueryResult = { data: null, error: null },
) {
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
      rpc(name: string, args: unknown) {
        calls.push({ method: "rpc", args: [name, args] });
        return Promise.resolve(rpcResult);
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
    expect(Object.keys(result.list[0]!).sort()).toEqual([
      "assigned_at",
      "assigned_by",
      "created_at",
      "dedupe_result",
      "display_label",
      "id",
      "is_employee_share",
      "is_old_customer_new_lead",
      "is_platform_new_lead",
      "metadata",
      "platform_lead",
      "share_link",
      "source",
      "source_employee",
      "source_label",
    ].sort());
    expect(result.list[0]).not.toHaveProperty("tenant_id");
    expect(result.list[0]).not.toHaveProperty("customer_id");
    expect(result.list[0]).not.toHaveProperty("platform_lead_id");
    expect(result.list[0]).not.toHaveProperty("marketing_lead_id");
    expect(result.list[0]).not.toHaveProperty("douyin_measurement_appointment_id");
    expect(result.list[0]).not.toHaveProperty("related_id");
    expect(JSON.stringify(result.list[0]?.metadata)).not.toContain("request_ip");
  });

  test("loads one strict tenant-scoped summary row per customer through the bounded RPC", async () => {
    const latestSource = {
      id: "source-1",
      tenant_id: "11111111-1111-4111-8111-111111111111",
      customer_id: "22222222-2222-4222-8222-222222222222",
      source: "douyin_miniapp",
      source_label: "抖音小程序",
      platform_lead_id: null,
      assigned_by_employee_id: null,
      assigned_at: "2026-08-22T10:00:00.000Z",
      metadata: {
        appointment_no: "DYLF-20260822-000001",
        appointment_status: "confirmed",
        budget_estimate: null,
      },
      created_at: "2026-08-22T10:00:00.000Z",
      source_employee_id: null,
      related_type: null,
      related_id: null,
      share_link_id: null,
      marketing_lead_id: "33333333-3333-4333-8333-333333333333",
      douyin_measurement_appointment_id: "44444444-4444-4444-8444-444444444444",
    };
    const context = clientWith(
      { data: null, error: null },
      {
        data: [{
          customer_id: "22222222-2222-4222-8222-222222222222",
          total: 3,
          latest_source: latestSource,
          has_old_customer_new_lead: true,
          has_platform_new_lead: false,
          has_employee_share: true,
        }],
        error: null,
      },
    );

    const result = await new CustomerSourceRepository(context.client as never)
      .listByCustomerIds({
        tenantId: "11111111-1111-4111-8111-111111111111",
        customerIds: ["22222222-2222-4222-8222-222222222222"],
      });

    expect(context.calls.filter((call) => call.method === "rpc")).toEqual([{
      method: "rpc",
      args: ["list_customer_source_summaries", {
        p_tenant_id: "11111111-1111-4111-8111-111111111111",
        p_customer_ids: ["22222222-2222-4222-8222-222222222222"],
      }],
    }]);
    expect(context.calls.some((call) => call.method === "from" && call.args[0] === "customer_sources"))
      .toBe(false);
    expect(result).toEqual([{
      customerId: "22222222-2222-4222-8222-222222222222",
      total: 3,
      latestSource: expect.objectContaining({
        id: "source-1",
        source: "douyin",
        metadata: expect.objectContaining({ appointment_no: "DYLF-20260822-000001" }),
      }),
      hasOldCustomerNewLead: true,
      hasPlatformNewLead: false,
      hasEmployeeShare: true,
    }]);
    expect(result[0]?.latestSource).not.toHaveProperty("tenant_id");
    expect(result[0]?.latestSource).not.toHaveProperty("customer_id");
    expect(Object.keys(result[0]!.latestSource!).sort()).toEqual([
      "assigned_at", "assigned_by", "created_at", "dedupe_result",
      "display_label", "id", "is_employee_share",
      "is_old_customer_new_lead", "is_platform_new_lead", "metadata",
      "platform_lead", "share_link", "source", "source_employee",
      "source_label",
    ].sort());
    expect(JSON.stringify(result)).not.toContain("marketing_lead_id");
  });

  test("rejects duplicate inputs and malformed RPC rows without exposing raw data", async () => {
    const duplicateContext = clientWith({ data: null, error: null });
    const duplicateRepository = new CustomerSourceRepository(
      duplicateContext.client as never,
    );
    const duplicateId = "22222222-2222-4222-8222-222222222222";

    await expect(duplicateRepository.listByCustomerIds({
      tenantId: "11111111-1111-4111-8111-111111111111",
      customerIds: [duplicateId, duplicateId],
    })).rejects.toMatchObject({ statusCode: 400 });
    expect(duplicateContext.calls.some((call) => call.method === "rpc")).toBe(false);

    const malformedContext = clientWith(
      { data: null, error: null },
      {
        data: [{
          customer_id: duplicateId,
          total: 1,
          latest_source: null,
          has_old_customer_new_lead: false,
          has_platform_new_lead: false,
          has_employee_share: false,
          raw_rows: [{ raw_response: "unsafe-model-output" }],
        }],
        error: null,
      },
    );
    const malformedRepository = new CustomerSourceRepository(
      malformedContext.client as never,
    );

    let caught: unknown;
    try {
      await malformedRepository.listByCustomerIds({
        tenantId: "11111111-1111-4111-8111-111111111111",
        customerIds: [duplicateId],
      });
    } catch (error) {
      caught = error;
    }
    expect(caught).toMatchObject({ statusCode: 500 });
    expect(JSON.stringify(caught)).not.toContain("unsafe-model-output");

    const databaseErrorContext = clientWith(
      { data: null, error: null },
      { data: null, error: { message: "raw database detail", hint: "unsafe" } },
    );
    let databaseError: unknown;
    try {
      await new CustomerSourceRepository(databaseErrorContext.client as never)
        .listByCustomerIds({
          tenantId: "11111111-1111-4111-8111-111111111111",
          customerIds: [duplicateId],
        });
    } catch (error) {
      databaseError = error;
    }
    expect(databaseError).toMatchObject({ statusCode: 500 });
    expect(JSON.stringify(databaseError)).not.toMatch(/raw database detail|unsafe/);
  });
});
