import { beforeAll, describe, expect, mock, test } from "bun:test";

import { AppError } from "@/errors/app-error";
import type {
  TenantDouyinBudgetCommandResult,
  TenantDouyinBudgetRawItem,
  TenantDouyinBudgetRawVersion,
} from "./tenant-douyin-budget";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

let Repository: typeof import("./tenant-douyin-budget")
  .TenantDouyinBudgetRepository;

beforeAll(async () => {
  ({ TenantDouyinBudgetRepository: Repository } = await import(
    "./tenant-douyin-budget"
  ));
});

const TENANT_ID = "11111111-1111-4111-8111-111111111111";
const EMPLOYEE_ID = "22222222-2222-4222-8222-222222222222";
const VERSION_ID = "33333333-3333-4333-8333-333333333333";
const UPDATED_AT = "2026-08-21T08:00:00.123456+00:00";
const NOW = "2026-08-21T08:30:00.000Z";
const rawItem = {
  id: "44444444-4444-4444-8444-444444444444",
  pricing_version_id: VERSION_ID,
  category_code: "base",
  item_code: "base.comfortable.rough",
  label: "舒适档毛坯基础施工",
  unit: "sqm",
  minimum_amount: 90_000,
  maximum_amount: 120_000,
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
  status: "active",
  created_at: UPDATED_AT,
  updated_at: UPDATED_AT,
} satisfies TenantDouyinBudgetRawItem;
const rawVersion = {
  id: VERSION_ID,
  tenant_id: TENANT_ID,
  version_no: 2,
  status: "draft",
  effective_from: "2026-08-21T00:00:00+00:00",
  effective_to: null,
  currency: "CNY",
  disclaimer: "初步估算，不构成最终报价",
  created_by_employee_id: EMPLOYEE_ID,
  created_at: UPDATED_AT,
  updated_at: UPDATED_AT,
} satisfies TenantDouyinBudgetRawVersion;

type Result = { data: unknown; error: unknown; count?: number | null };
type Call = { method: string; args: unknown[] };

function clientWith(results: Result[]) {
  const calls: Call[] = [];
  let resultIndex = 0;
  class Query implements PromiseLike<Result> {
    constructor(private readonly result: Result) {}
    private chain(method: string, args: unknown[]) {
      calls.push({ method, args });
      return this;
    }
    select(...args: unknown[]) { return this.chain("select", args); }
    eq(...args: unknown[]) { return this.chain("eq", args); }
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
        return new Query(results[resultIndex++] ?? { data: null, error: null });
      }),
      rpc: mock((name: string, args: unknown) => {
        calls.push({ method: "rpc", args: [name, args] });
        return Promise.resolve(
          results[resultIndex++] ?? { data: null, error: null },
        );
      }),
    },
  };
}

describe("TenantDouyinBudgetRepository", () => {
  test("lists one tenant page and loads its items in one bounded batch", async () => {
    const { client, calls } = clientWith([
      { data: { ...rawVersion, status: "active" }, error: null },
      { data: [rawVersion], error: null, count: 21 },
      { data: [rawItem], error: null },
    ]);
    const repository = new Repository(client as never);

    await expect(repository.listVersions({
      tenantId: TENANT_ID,
      page: 2,
      pageSize: 20,
      now: NOW,
    })).resolves.toEqual({
      activeVersion: { ...rawVersion, status: "active", items: [rawItem] },
      rows: [{ ...rawVersion, items: [rawItem] }],
      total: 21,
    });

    expect(calls).toContainEqual({ method: "range", args: [20, 39] });
    expect(calls).toContainEqual({
      method: "in",
      args: ["pricing_version_id", [VERSION_ID]],
    });
    expect(calls).toContainEqual({ method: "limit", args: [1_000] });
    expect(calls).toContainEqual({ method: "eq", args: ["status", "active"] });
    expect(calls).toContainEqual({
      method: "lte",
      args: ["effective_from", NOW],
    });
    expect(calls).toContainEqual({
      method: "or",
      args: [`effective_to.is.null,effective_to.gt.${NOW}`],
    });
    expect(calls.filter((call) => call.method === "from")).toHaveLength(3);
    const selects = calls.filter((call) => call.method === "select")
      .map((call) => String(call.args[0]));
    expect(selects.join(",")).not.toMatch(/tenant:name|employee:name|ai_|key/);
  });

  test("does not issue an item query for an empty page", async () => {
    const context = clientWith([
      { data: null, error: null },
      { data: [], error: null, count: 0 },
    ]);
    const repository = new Repository(context.client as never);
    await expect(repository.listVersions({
      tenantId: TENANT_ID,
      page: 1,
      pageSize: 20,
      now: NOW,
    })).resolves.toEqual({ activeVersion: null, rows: [], total: 0 });
    expect(context.calls.filter((call) => call.method === "from")).toHaveLength(2);
  });

  test("chunks item batches below the PostgREST max rows boundary", async () => {
    const versions = Array.from({ length: 20 }, (_, index) => ({
      ...rawVersion,
      id: `33333333-3333-4333-8333-${String(index + 1).padStart(12, "0")}`,
      version_no: index + 1,
    }));
    const active = {
      ...rawVersion,
      id: "55555555-5555-4555-8555-555555555555",
      status: "active" as const,
    };
    const context = clientWith([
      { data: active, error: null },
      { data: versions, error: null, count: 20 },
      { data: [], error: null },
      { data: [], error: null },
      { data: [], error: null },
    ]);
    const repository = new Repository(context.client as never);

    await repository.listVersions({
      tenantId: TENANT_ID,
      page: 1,
      pageSize: 20,
      now: NOW,
    });

    const itemBatches = context.calls
      .filter((call) => call.method === "in")
      .map((call) => call.args[1] as string[]);
    expect(itemBatches.map((ids) => ids.length)).toEqual([10, 10, 1]);
    expect(context.calls.filter((call) =>
      call.method === "limit" && call.args[0] === 1_000
    )).toHaveLength(3);
  });

  test.each([
    ["future", { effective_from: "2026-08-22T00:00:00.000Z" }],
    ["expired", { effective_to: "2026-08-21T08:29:59.999Z" }],
  ])("does not expose a status-active but %s version as current", async (
    _case,
    validity,
  ) => {
    const active = { ...rawVersion, ...validity, status: "active" as const };
    const context = clientWith([
      { data: active, error: null },
      { data: [], error: null, count: 0 },
    ]);
    const repository = new Repository(context.client as never);

    await expect(repository.listVersions({
      tenantId: TENANT_ID,
      page: 1,
      pageSize: 20,
      now: NOW,
    })).resolves.toEqual({ activeVersion: null, rows: [], total: 0 });
    expect(context.calls.filter((call) =>
      call.method === "from" && call.args[0] === "douyin_budget_pricing_items"
    )).toHaveLength(0);
  });

  test("uses only atomic write commands with server-scoped arguments", async () => {
    const results = Array.from({ length: 4 }, () => ({
      data: { data: { ...rawVersion, items: [rawItem] } },
      error: null,
    }));
    const context = clientWith(results);
    const repository = new Repository(context.client as never);
    const rawItems = [rawItem].map(({ id: _id, pricing_version_id: _version,
      created_at: _created, updated_at: _updated, ...item }) => item);

    await repository.createDraft({
      tenantId: TENANT_ID,
      employeeId: EMPLOYEE_ID,
      effectiveFrom: rawVersion.effective_from,
      effectiveTo: null,
      disclaimer: rawVersion.disclaimer,
    });
    await repository.replaceItems({
      tenantId: TENANT_ID,
      versionId: VERSION_ID,
      expectedUpdatedAt: UPDATED_AT,
      items: rawItems,
    });
    await repository.activate({
      tenantId: TENANT_ID,
      versionId: VERSION_ID,
      expectedUpdatedAt: UPDATED_AT,
    });
    await repository.archive({
      tenantId: TENANT_ID,
      versionId: VERSION_ID,
      expectedUpdatedAt: UPDATED_AT,
    });

    expect(context.calls.filter((call) => call.method === "from")).toEqual([]);
    expect(context.calls.map((call) => call.args[0])).toEqual([
      "create_douyin_budget_pricing_draft",
      "replace_douyin_budget_pricing_items",
      "activate_douyin_budget_pricing_version",
      "archive_douyin_budget_pricing_version",
    ]);
    expect(context.calls[1]?.args[1]).toEqual({
      p_tenant_id: TENANT_ID,
      p_pricing_version_id: VERSION_ID,
      p_expected_updated_at: UPDATED_AT,
      p_items: rawItems,
    });
  });

  test("accepts only strict known command envelopes and sanitizes failures", async () => {
    const knownError: Extract<
      TenantDouyinBudgetCommandResult,
      { readonly ok: false }
    >["error"] = {
      status_code: 409,
      code: "DOUYIN_BUDGET_PRICING_STALE",
      message: "报价版本已更新，请刷新后重试",
    };
    const business = new Repository(clientWith([{
      data: { error: knownError }, error: null,
    }]).client as never);
    await expect(business.activate({
      tenantId: TENANT_ID,
      versionId: VERSION_ID,
      expectedUpdatedAt: UPDATED_AT,
    })).resolves.toEqual({ ok: false, error: knownError });

    for (const result of [
      { data: { error: { ...knownError, raw_detail: "secret" } }, error: null },
      { data: { data: { ...rawVersion, tenant_id: "bad", items: [] } }, error: null },
      { data: null, error: { message: "connection secret" } },
    ]) {
      const repository = new Repository(clientWith([result]).client as never);
      try {
        await repository.activate({
          tenantId: TENANT_ID,
          versionId: VERSION_ID,
          expectedUpdatedAt: UPDATED_AT,
        });
        throw new TypeError("expected rejection");
      } catch (error) {
        expect(error).toBeInstanceOf(AppError);
        expect(error).toMatchObject({
          statusCode: 500,
          code: "DB_ERROR",
          details: undefined,
        });
        expect(String((error as Error).message)).not.toContain("secret");
      }
    }
  });
});
