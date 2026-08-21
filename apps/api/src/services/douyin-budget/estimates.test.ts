import { createHash } from "node:crypto";

import { beforeAll, describe, expect, mock, test } from "bun:test";
import type { DouyinBudgetEstimateRequest } from "@gooes/domain";

import { Errors } from "@/errors/error-factory";
import type { JwtPayload } from "@/utils/jwt";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

let Service: typeof import("./estimates").DouyinBudgetEstimatesService;

beforeAll(async () => {
  ({ DouyinBudgetEstimatesService: Service } = await import("./estimates"));
});

const tenantId = "11111111-1111-4111-8111-111111111111";
const installationId = "22222222-2222-4222-8222-222222222222";
const pricingVersionId = "33333333-3333-4333-8333-333333333333";
const estimateId = "44444444-4444-4444-8444-444444444444";
const subjectHash = "a".repeat(64);
const now = new Date("2026-08-21T03:04:05.000Z");
const user: JwtPayload = {
  sub: subjectHash,
  token_type: "douyin_miniapp",
  login_channel: "douyin",
  roles: ["douyin_miniapp"],
  tenant_id: tenantId,
  douyin_installation_id: installationId,
  douyin_app_id: "tt-authorizer-1",
  subject_hash: subjectHash,
};
const installation = {
  id: installationId,
  tenant_id: tenantId,
  authorizer_appid: "tt-authorizer-1",
  installation_kind: "merchant",
  authorization_status: "active",
  template_version: "1.0.0",
  runtime_config: {},
  tenant: { id: tenantId, status: "active" },
};
const version = {
  id: pricingVersionId,
  tenant_id: tenantId,
  version_no: 7,
  effective_from: "2026-08-20T00:00:00.000000Z",
  effective_to: null,
  currency: "CNY",
  disclaimer: "初步估算，不构成最终报价",
};
const baseItem = {
  id: "55555555-5555-4555-8555-555555555555",
  pricing_version_id: pricingVersionId,
  category_code: "base",
  item_code: "base.comfortable.rough",
  label: "舒适档毛坯基础施工",
  unit: "sqm",
  minimum_amount: 100_000,
  maximum_amount: 150_000,
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
const optionItem = {
  id: "66666666-6666-4666-8666-666666666666",
  pricing_version_id: pricingVersionId,
  category_code: "custom",
  item_code: "custom_cabinet",
  label: "定制柜体",
  unit: "fixed",
  minimum_amount: 500_000,
  maximum_amount: 500_000,
  condition_payload: {
    role: "option",
    property_conditions: ["rough", "old_house"],
    decoration_tiers: ["economy", "comfortable", "quality"],
    decoration_scopes: ["whole_house", "partial"],
  },
  sort_order: 1,
};
const input: DouyinBudgetEstimateRequest = {
  area: 100,
  property_condition: "rough",
  decoration_tier: "comfortable",
  decoration_scope: "whole_house",
  layout: "三室两厅",
  style: "现代简约",
  option_codes: ["custom_cabinet"],
  demand: "需要更多收纳",
};

function dependencies(overrides: Record<string, unknown> = {}) {
  const contextRepository = {
    findActiveInstallation: mock(async () => installation),
  };
  const inserts: Array<Record<string, unknown>> = [];
  const budgetRepository = {
    loadActivePricing: mock(async () => ({
      version,
      items: [baseItem, optionItem],
    })),
    createEstimateAtomic: mock(async (value: Record<string, unknown>) => {
      inserts.push(value);
      return {
        id: estimateId,
        estimate_no: value.estimateNo,
        tenant_id: value.tenantId,
        douyin_miniapp_installation_id: value.installationId,
        pricing_version_id: value.pricingVersionId,
        ai_status: "pending",
      };
    }),
  };
  return {
    values: {
      contextRepository,
      budgetRepository,
      now: () => now,
      randomInt: () => 42,
      ...overrides,
    },
    contextRepository,
    budgetRepository,
    inserts,
  };
}

describe("DouyinBudgetEstimatesService public configuration", () => {
  test("resolves the authenticated installation and exposes only safe labels", async () => {
    const deps = dependencies();
    const service = new Service(deps.values as never);

    await expect(service.getConfig(user)).resolves.toEqual({
      property_conditions: [
        { value: "rough", label: "毛坯" },
        { value: "old_house", label: "旧房翻新" },
      ],
      decoration_tiers: [
        { value: "economy", label: "经济" },
        { value: "comfortable", label: "舒适" },
        { value: "quality", label: "品质" },
      ],
      decoration_scopes: [
        { value: "whole_house", label: "全屋" },
        { value: "partial", label: "局部" },
      ],
      options: [{ code: "custom_cabinet", label: "定制柜体" }],
      pricing_version: "7",
      effective_from: "2026-08-20T00:00:00.000Z",
      effective_to: null,
      disclaimer: "初步估算，不构成最终报价",
    });
    expect(deps.contextRepository.findActiveInstallation).toHaveBeenCalledWith({
      installationId,
      tenantId,
      appId: "tt-authorizer-1",
    });
    expect(deps.budgetRepository.loadActivePricing).toHaveBeenCalledWith({
      tenantId,
      now: now.toISOString(),
    });
    const serialized = JSON.stringify(await service.getConfig(user));
    expect(serialized).not.toMatch(/amount|condition_payload|tenant_id|installation_id|unit/);
  });

  test("returns a stable not-configured error when no effective version exists", async () => {
    const deps = dependencies({
      budgetRepository: {
        loadActivePricing: mock(async () => null),
        createEstimateAtomic: mock(async () => ({})),
      },
    });
    await expect(new Service(deps.values as never).getConfig(user)).rejects.toMatchObject({
      statusCode: 404,
      code: "DOUYIN_BUDGET_NOT_CONFIGURED",
    });
  });

  test("rejects unknown or ambiguous persisted condition keys", async () => {
    for (const conditionPayload of [
      { ...baseItem.condition_payload, expression: "area * price" },
      {
        ...baseItem.condition_payload,
        property_conditions: ["rough", "old_house"],
      },
      {
        ...optionItem.condition_payload,
        property_condition_coefficient_bps: 10_000,
      },
    ]) {
      const item = "expression" in conditionPayload
        || "property_condition_coefficient_bps" in conditionPayload
        && conditionPayload.role === "base"
        ? { ...baseItem, condition_payload: conditionPayload }
        : { ...optionItem, condition_payload: conditionPayload };
      const deps = dependencies({
        budgetRepository: {
          loadActivePricing: mock(async () => ({ version, items: [item] })),
          createEstimateAtomic: mock(async () => ({})),
        },
      });
      await expect(new Service(deps.values as never).getConfig(user))
        .rejects.toMatchObject({
          statusCode: 422,
          code: "DOUYIN_BUDGET_RULE_CONDITION_INVALID",
      });
    }
  });

  test("rejects template-development installations consistently before budget access", async () => {
    const deps = dependencies({
      contextRepository: {
        findActiveInstallation: mock(async () => ({
          ...installation,
          installation_kind: "template_development",
        })),
      },
    });
    const service = new Service(deps.values as never);
    await expect(service.getConfig(user)).rejects.toMatchObject({
      statusCode: 409,
      code: "DOUYIN_BUDGET_INSTALLATION_UNSUPPORTED",
    });
    await expect(service.createEstimate(user, input, "192.0.2.10"))
      .rejects.toMatchObject({
        statusCode: 409,
        code: "DOUYIN_BUDGET_INSTALLATION_UNSUPPORTED",
      });
    expect(deps.budgetRepository.loadActivePricing).not.toHaveBeenCalled();
    expect(deps.budgetRepository.createEstimateAtomic).not.toHaveBeenCalled();
  });
});

describe("DouyinBudgetEstimatesService synchronous estimates", () => {
  test("uses the exact calculator adapter, public projection and strict snapshots", async () => {
    const deps = dependencies();
    const result = await new Service(deps.values as never).createEstimate(
      user,
      input,
      "192.0.2.10",
    );

    expect(result).toEqual(expect.objectContaining({
      id: estimateId,
      estimate_no: "DYYS-20260821-000042",
      minimum_total: 105_000,
      maximum_total: 155_000,
      categories: [
        {
          category_code: "base",
          label: "基础施工",
          minimum_amount: 100_000,
          maximum_amount: 150_000,
        },
        {
          category_code: "custom",
          label: "定制",
          minimum_amount: 5_000,
          maximum_amount: 5_000,
        },
      ],
      pricing_version: "7",
      pricing_effective_from: "2026-08-20T00:00:00.000Z",
      pricing_effective_to: null,
      ai_status: "pending",
      disclaimer: "初步估算，不构成最终报价",
    }));
    expect(deps.inserts).toHaveLength(1);
    const resultSnapshot = Object.fromEntries(
      Object.entries(result).filter(([key]) =>
        key !== "id" && key !== "estimate_no"),
    );
    expect(deps.inserts[0]).toMatchObject({
      tenantId,
      installationId,
      pricingVersionId,
      estimateNo: "DYYS-20260821-000042",
      requestPayload: input,
      resultPayload: resultSnapshot,
      expiresAt: "2026-09-20T03:04:05.000Z",
    });
    expect(deps.inserts[0]).not.toHaveProperty("id");
    expect(deps.inserts[0]?.resultPayload).not.toHaveProperty("id");
    expect(deps.inserts[0]?.resultPayload).not.toHaveProperty("estimate_no");
  });

  test("keeps monetary output consistent for identical pricing and input", async () => {
    let suffix = 40;
    const deps = dependencies({ randomInt: () => suffix++ });
    const service = new Service(deps.values as never);
    const first = await service.createEstimate(user, input, "192.0.2.10");
    const second = await service.createEstimate(user, input, "192.0.2.10");
    expect({
      minimum_total: first.minimum_total,
      maximum_total: first.maximum_total,
      categories: first.categories,
    }).toEqual({
      minimum_total: second.minimum_total,
      maximum_total: second.maximum_total,
      categories: second.categories,
    });
  });

  test("hashes a normalized trusted IP with tenant scope and never persists raw IP", async () => {
    const deps = dependencies();
    await new Service(deps.values as never).createEstimate(
      user,
      input,
      "::ffff:192.0.2.10",
    );
    const expectedHash = createHash("sha256")
      .update(`${tenantId}:192.0.2.10`)
      .digest("hex");
    expect(deps.inserts[0]).toMatchObject({ requestIpHash: expectedHash });
    expect(JSON.stringify(deps.inserts[0])).not.toContain("192.0.2.10");
  });

  test("fails closed before the atomic command when trusted client IP is missing", async () => {
    const deps = dependencies();
    await expect(new Service(deps.values as never).createEstimate(
      user,
      input,
      null,
    )).rejects.toMatchObject({
      statusCode: 400,
      code: "DOUYIN_BUDGET_CLIENT_IP_INVALID",
    });
    expect(deps.budgetRepository.createEstimateAtomic).not.toHaveBeenCalled();
  });

  test("propagates the atomic command rate rejection without a fallback write", async () => {
    const deps = dependencies();
    deps.budgetRepository.createEstimateAtomic.mockImplementation(async () => {
      throw Errors.business(
        429,
        "预算试算过于频繁，请稍后再试",
        "DOUYIN_BUDGET_RATE_LIMITED",
      );
    });
    await expect(new Service(deps.values as never).createEstimate(
      user,
      input,
      "192.0.2.10",
    )).rejects.toMatchObject({
      statusCode: 429,
      code: "DOUYIN_BUDGET_RATE_LIMITED",
    });
    expect(deps.budgetRepository.createEstimateAtomic).toHaveBeenCalledTimes(1);
  });

  test("does not accept tenant or installation ownership from the request body", async () => {
    const deps = dependencies();
    await expect(new Service(deps.values as never).createEstimate(
      user,
      { ...input, tenant_id: "99999999-9999-4999-8999-999999999999" } as never,
      "192.0.2.10",
    )).rejects.toMatchObject({ statusCode: 400, code: "VALIDATION_ERROR" });
    expect(deps.budgetRepository.createEstimateAtomic).not.toHaveBeenCalled();
  });

  test("retries a bounded estimate-number collision with a fresh random suffix", async () => {
    let randomValue = 41;
    let attempt = 0;
    const deps = dependencies({ randomInt: () => randomValue++ });
    deps.budgetRepository.createEstimateAtomic.mockImplementation(
      async (value: Record<string, unknown>) => {
        deps.inserts.push(value);
        attempt += 1;
        if (attempt === 1) {
          throw Errors.business(
            409,
            "预算编号冲突",
            "DOUYIN_BUDGET_ESTIMATE_NUMBER_CONFLICT",
          );
        }
        return {
          id: estimateId,
          estimate_no: value.estimateNo,
          tenant_id: value.tenantId,
          douyin_miniapp_installation_id: value.installationId,
          pricing_version_id: value.pricingVersionId,
          ai_status: "pending",
        };
      },
    );

    await expect(new Service(deps.values as never).createEstimate(
      user,
      input,
      "192.0.2.10",
    )).resolves.toMatchObject({ estimate_no: "DYYS-20260821-000042" });
    expect(deps.inserts.map((item) => item.estimateNo)).toEqual([
      "DYYS-20260821-000041",
      "DYYS-20260821-000042",
    ]);
  });

  test("maps typed calculator failures to stable 422 responses", async () => {
    const deps = dependencies({
      budgetRepository: {
        loadActivePricing: mock(async () => ({
          version,
          items: [{
            ...baseItem,
            item_code: "base.economy.rough",
            condition_payload: {
              ...baseItem.condition_payload,
              decoration_tiers: ["economy"],
            },
          }],
        })),
        createEstimateAtomic: mock(async () => ({})),
      },
    });
    await expect(new Service(deps.values as never).createEstimate(
      user,
      input,
      "192.0.2.10",
    )).rejects.toMatchObject({
      statusCode: 422,
      code: "DOUYIN_BUDGET_BASE_MISSING",
    });
  });

  test("rejects forged sessions and wrong-scope repository responses", async () => {
    const deps = dependencies();
    await expect(new Service(deps.values as never).getConfig({
      ...user,
      sub: "b".repeat(64),
    })).rejects.toMatchObject({ statusCode: 401 });

    deps.budgetRepository.createEstimateAtomic.mockImplementation(
      async (value: Record<string, unknown>) => ({
        id: estimateId,
        estimate_no: value.estimateNo,
        tenant_id: "99999999-9999-4999-8999-999999999999",
        douyin_miniapp_installation_id: value.installationId,
        pricing_version_id: value.pricingVersionId,
        ai_status: "pending",
      }),
    );
    await expect(new Service(deps.values as never).createEstimate(
      user,
      input,
      "192.0.2.10",
    )).rejects.toMatchObject({
      statusCode: 500,
      code: "DOUYIN_BUDGET_REPOSITORY_RESPONSE_INVALID",
    });
  });
});
