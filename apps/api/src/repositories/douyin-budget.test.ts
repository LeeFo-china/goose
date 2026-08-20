import { beforeAll, describe, expect, mock, test } from "bun:test";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

let Repository: typeof import("./douyin-budget").DouyinBudgetRepository;

beforeAll(async () => {
  ({ DouyinBudgetRepository: Repository } = await import("./douyin-budget"));
});

type Call = { readonly method: string; readonly args: readonly unknown[] };
type Result = {
  readonly data: unknown;
  readonly error: unknown;
  readonly count?: number | null;
};

function clientWith(results: Result[]) {
  const calls: Call[] = [];
  let resultIndex = 0;

  class Query implements PromiseLike<Result> {
    private readonly result = results[resultIndex++] ?? { data: null, error: null };

    private chain(method: string, args: readonly unknown[]) {
      calls.push({ method, args });
      return this;
    }

    select(...args: unknown[]) { return this.chain("select", args); }
    eq(...args: unknown[]) { return this.chain("eq", args); }
    gte(...args: unknown[]) { return this.chain("gte", args); }
    lte(...args: unknown[]) { return this.chain("lte", args); }
    or(...args: unknown[]) { return this.chain("or", args); }
    order(...args: unknown[]) { return this.chain("order", args); }
    limit(...args: unknown[]) { return this.chain("limit", args); }
    insert(...args: unknown[]) { return this.chain("insert", args); }
    single() {
      calls.push({ method: "single", args: [] });
      return Promise.resolve(this.result);
    }
    then<TResult1 = Result, TResult2 = never>(
      onfulfilled?: ((value: Result) => TResult1 | PromiseLike<TResult1>) | null,
      onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
    ) {
      return Promise.resolve(this.result).then(onfulfilled, onrejected);
    }
  }

  const client = {
    from: mock((table: string) => {
      calls.push({ method: "from", args: [table] });
      return new Query();
    }),
  };
  return { client, calls };
}

const tenantId = "11111111-1111-4111-8111-111111111111";
const installationId = "22222222-2222-4222-8222-222222222222";
const pricingVersionId = "33333333-3333-4333-8333-333333333333";
const estimateId = "44444444-4444-4444-8444-444444444444";
const now = "2026-08-21T03:04:05.000Z";
const version = {
  id: pricingVersionId,
  tenant_id: tenantId,
  version_no: 7,
  effective_from: "2026-08-20T00:00:00.000Z",
  effective_to: null,
  currency: "CNY" as const,
  disclaimer: "初步估算，不构成最终报价",
};
const baseItem = {
  id: "55555555-5555-4555-8555-555555555555",
  pricing_version_id: pricingVersionId,
  category_code: "base",
  item_code: "base.comfortable.rough",
  label: "舒适档毛坯基础施工",
  unit: "sqm",
  minimum_amount: 80_000,
  maximum_amount: 100_000,
  condition_payload: {
    role: "base",
    property_conditions: ["rough"],
    decoration_tiers: ["comfortable"],
    decoration_scopes: ["whole_house", "partial"],
    property_condition_coefficient_bps: 10_000,
    decoration_scope_coefficient_bps: {
      whole_house: 10_000,
      partial: 6_000,
    },
  },
  sort_order: 0,
};

describe("DouyinBudgetRepository active pricing", () => {
  test("loads one effective active version and at most 101 active ordered items", async () => {
    const { client, calls } = clientWith([
      { data: [version], error: null },
      { data: [baseItem], error: null },
    ]);
    const repository = new Repository(client as never);

    await expect(repository.loadActivePricing({ tenantId, now })).resolves.toEqual({
      version,
      items: [baseItem],
    });

    expect(calls.filter((call) => call.method === "from")).toEqual([
      { method: "from", args: ["douyin_budget_pricing_versions"] },
      { method: "from", args: ["douyin_budget_pricing_items"] },
    ]);
    expect(calls).toContainEqual({ method: "eq", args: ["tenant_id", tenantId] });
    expect(calls).toContainEqual({ method: "eq", args: ["status", "active"] });
    expect(calls).toContainEqual({ method: "lte", args: ["effective_from", now] });
    expect(calls).toContainEqual({
      method: "or",
      args: [`effective_to.is.null,effective_to.gt.${now}`],
    });
    expect(calls).toContainEqual({
      method: "order",
      args: ["sort_order", { ascending: true }],
    });
    expect(calls).toContainEqual({
      method: "order",
      args: ["id", { ascending: true }],
    });
    expect(calls).toContainEqual({ method: "limit", args: [101] });

    const selects = calls.filter((call) => call.method === "select")
      .map((call) => String(call.args[0]));
    expect(selects[0]).toBe(
      "id,tenant_id,version_no,effective_from,effective_to,currency,disclaimer",
    );
    expect(selects[1]).toBe(
      "id,pricing_version_id,category_code,item_code,label,unit,minimum_amount,"
        + "maximum_amount,condition_payload,sort_order",
    );
  });

  test("returns null without querying items when no effective version exists", async () => {
    const { client, calls } = clientWith([{ data: [], error: null }]);
    await expect(new Repository(client as never).loadActivePricing({ tenantId, now }))
      .resolves.toBeNull();
    expect(calls.filter((call) => call.method === "from")).toHaveLength(1);
  });

  test("rejects ambiguous versions and more than 100 active items", async () => {
    const ambiguous = clientWith([{ data: [version, version], error: null }]);
    await expect(new Repository(ambiguous.client as never).loadActivePricing({
      tenantId,
      now,
    })).rejects.toMatchObject({
      statusCode: 500,
      code: "DOUYIN_BUDGET_REPOSITORY_RESPONSE_INVALID",
    });

    const oversized = clientWith([
      { data: [version], error: null },
      { data: Array.from({ length: 101 }, (_, index) => ({
        ...baseItem,
        id: `${String(index).padStart(8, "0")}-5555-4555-8555-555555555555`,
        sort_order: index,
      })), error: null },
    ]);
    await expect(new Repository(oversized.client as never).loadActivePricing({
      tenantId,
      now,
    })).rejects.toMatchObject({
      statusCode: 500,
      code: "DOUYIN_BUDGET_PRICING_ITEM_LIMIT_EXCEEDED",
    });
  });
});

describe("DouyinBudgetRepository estimate rate and persistence", () => {
  test("counts subject and IP independently with tenant-scoped indexed filters", async () => {
    const subjectHash = "a".repeat(64);
    const requestIpHash = "b".repeat(64);
    const since = "2026-08-21T02:54:05.000Z";
    const { client, calls } = clientWith([
      { data: null, error: null, count: 20 },
      { data: null, error: null, count: 19 },
    ]);

    await expect(new Repository(client as never).countRecentEstimates({
      tenantId,
      subjectHash,
      requestIpHash,
      since,
    })).resolves.toEqual({ subjectCount: 20, ipCount: 19 });

    const selects = calls.filter((call) => call.method === "select");
    expect(selects).toEqual([
      { method: "select", args: ["id", { count: "exact", head: true }] },
      { method: "select", args: ["id", { count: "exact", head: true }] },
    ]);
    expect(calls.filter((call) => call.method === "eq" && call.args[0] === "tenant_id"))
      .toHaveLength(2);
    expect(calls).toContainEqual({ method: "eq", args: ["subject_hash", subjectHash] });
    expect(calls).toContainEqual({ method: "eq", args: ["request_ip_hash", requestIpHash] });
    expect(calls.filter((call) => call.method === "gte"))
      .toEqual([
        { method: "gte", args: ["created_at", since] },
        { method: "gte", args: ["created_at", since] },
      ]);
  });

  test("persists strict snapshots and validates returned scope and identifiers", async () => {
    const estimateNo = "DYYS-20260821-000042";
    const requestPayload = {
      area: 120,
      property_condition: "rough",
      decoration_tier: "comfortable",
      decoration_scope: "whole_house",
      option_codes: [],
    };
    const resultPayload = {
      id: estimateId,
      estimate_no: estimateNo,
      minimum_total: 96_000,
      maximum_total: 120_000,
      categories: [],
      calculation_basis: ["120㎡、舒适档、毛坯房、全屋装修"],
      included_items: ["基础施工"],
      excluded_items: [],
      pricing_version: "7",
      pricing_effective_from: version.effective_from,
      pricing_effective_to: null,
      disclaimer: version.disclaimer,
      ai_status: "pending" as const,
    };
    const row = {
      id: estimateId,
      estimate_no: estimateNo,
      tenant_id: tenantId,
      douyin_miniapp_installation_id: installationId,
      pricing_version_id: pricingVersionId,
      ai_status: "pending" as const,
    };
    const { client, calls } = clientWith([{ data: row, error: null }]);

    await expect(new Repository(client as never).insertEstimate({
      id: estimateId,
      tenantId,
      installationId,
      subjectHash: "a".repeat(64),
      requestIpHash: "b".repeat(64),
      pricingVersionId,
      estimateNo,
      requestPayload,
      resultPayload,
      expiresAt: "2026-09-20T03:04:05.000Z",
      createdAt: now,
    })).resolves.toEqual(row);

    const insertedRows = calls.find((call) => call.method === "insert")?.args[0] as
      ReadonlyArray<Record<string, unknown>>;
    const inserted = insertedRows[0];
    expect(inserted).toEqual({
      id: estimateId,
      tenant_id: tenantId,
      douyin_miniapp_installation_id: installationId,
      subject_hash: "a".repeat(64),
      request_ip_hash: "b".repeat(64),
      pricing_version_id: pricingVersionId,
      estimate_no: estimateNo,
      request_payload: requestPayload,
      result_payload: resultPayload,
      ai_status: "pending",
      expires_at: "2026-09-20T03:04:05.000Z",
      created_at: now,
    });
    expect(JSON.stringify(inserted)).not.toContain("192.0.2.10");
    expect(calls).toContainEqual({
      method: "select",
      args: [
        "id,estimate_no,tenant_id,douyin_miniapp_installation_id,"
          + "pricing_version_id,ai_status",
      ],
    });
  });

  test("rejects wrong-scope responses and maps database failures without details", async () => {
    const estimateNo = "DYYS-20260821-000042";
    const input = {
      id: estimateId,
      tenantId,
      installationId,
      subjectHash: "a".repeat(64),
      requestIpHash: "b".repeat(64),
      pricingVersionId,
      estimateNo,
      requestPayload: {},
      resultPayload: {},
      expiresAt: "2026-09-20T03:04:05.000Z",
      createdAt: now,
    };
    const wrongScope = clientWith([{ data: {
      id: estimateId,
      estimate_no: estimateNo,
      tenant_id: "99999999-9999-4999-8999-999999999999",
      douyin_miniapp_installation_id: installationId,
      pricing_version_id: pricingVersionId,
      ai_status: "pending",
    }, error: null }]);
    await expect(new Repository(wrongScope.client as never).insertEstimate(input))
      .rejects.toMatchObject({
        statusCode: 500,
        code: "DOUYIN_BUDGET_REPOSITORY_RESPONSE_INVALID",
      });

    const sensitive = "duplicate raw request IP 192.0.2.10";
    const rejected = clientWith([{ data: null, error: {
      code: "08006",
      message: sensitive,
      details: sensitive,
      hint: sensitive,
    } }]);
    let caught: unknown;
    try {
      await new Repository(rejected.client as never).insertEstimate(input);
    } catch (error) {
      caught = error;
    }
    expect(caught).toMatchObject({
      statusCode: 500,
      code: "DOUYIN_BUDGET_REPOSITORY_ERROR",
    });
    expect(JSON.stringify(caught)).not.toContain(sensitive);
  });

  test("maps only the estimate number unique constraint to a retryable collision", async () => {
    const estimateNo = "DYYS-20260821-000042";
    const collision = clientWith([{ data: null, error: {
      code: "23505",
      message: "duplicate key",
      details: "Key (estimate_no) already exists",
      hint: null,
    } }]);
    await expect(new Repository(collision.client as never).insertEstimate({
      id: estimateId,
      tenantId,
      installationId,
      subjectHash: "a".repeat(64),
      requestIpHash: "b".repeat(64),
      pricingVersionId,
      estimateNo,
      requestPayload: {},
      resultPayload: {},
      expiresAt: "2026-09-20T03:04:05.000Z",
      createdAt: now,
    })).rejects.toMatchObject({
      statusCode: 409,
      code: "DOUYIN_BUDGET_ESTIMATE_NUMBER_CONFLICT",
    });
  });
});
