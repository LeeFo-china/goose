import { beforeAll, describe, expect, mock, test } from "bun:test";
import type {
  DouyinBudgetEstimateResult,
  DouyinBudgetPublicConfig,
} from "@gooes/domain";

import { Errors } from "@/errors/error-factory";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

let Controller: typeof import(".").DouyinBudgetController;

beforeAll(async () => {
  ({ DouyinBudgetController: Controller } = await import("."));
});

const tenantId = "11111111-1111-4111-8111-111111111111";
const installationId = "22222222-2222-4222-8222-222222222222";
const subjectHash = "a".repeat(64);
const user = {
  sub: subjectHash,
  token_type: "douyin_miniapp",
  tenant_id: tenantId,
  douyin_installation_id: installationId,
  douyin_app_id: "tt-authorizer-1",
  subject_hash: subjectHash,
};
const body = {
  area: 100,
  property_condition: "rough",
  decoration_tier: "comfortable",
  decoration_scope: "whole_house",
  layout: "三室两厅",
  style: "现代简约",
  option_codes: ["custom_cabinet"],
  demand: "需要更多收纳",
};
const config: DouyinBudgetPublicConfig = {
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
};
const estimate: DouyinBudgetEstimateResult = {
  id: "44444444-4444-4444-8444-444444444444",
  estimate_no: "DYYS-20260821-000042",
  minimum_total: 105_000,
  maximum_total: 155_000,
  categories: [],
  calculation_basis: ["100㎡、舒适档、毛坯房、全屋装修"],
  included_items: ["舒适档毛坯基础施工"],
  excluded_items: [],
  pricing_version: "7",
  pricing_effective_from: "2026-08-20T00:00:00.000Z",
  pricing_effective_to: null,
  disclaimer: "初步估算，不构成最终报价",
  ai_status: "pending",
};

describe("DouyinBudgetController", () => {
  test("registers the two exact routes in the root registry", async () => {
    const getConfig = mock(async () => config);
    const createEstimate = mock(async () => estimate);
    const controller = new Controller({ getConfig, createEstimate } as never);
    const routes: Array<{ method: string; path: string }> = [];
    controller.registerExtraRoutes({
      get: (path: string) => routes.push({ method: "GET", path }),
      post: (path: string) => routes.push({ method: "POST", path }),
    } as never);
    expect(routes).toEqual([
      { method: "GET", path: "/douyin-mini/budget-config" },
      { method: "POST", path: "/douyin-mini/budget-estimates" },
    ]);

    const source = await Bun.file(
      new URL("../../routes/index.ts", import.meta.url),
    ).text();
    expect(source).toContain(
      'import DouyinBudgetController from "@/controllers/douyin-budget";',
    );
    expect(source).toContain("DouyinBudgetController.registerExtraRoutes(app);");
  });

  test("delegates config with the authenticated session and wraps success", async () => {
    const getConfig = mock(async () => config);
    const controller = new Controller({
      getConfig,
      createEstimate: mock(async () => estimate),
    } as never);
    await expect(controller.getConfig({
      user,
      params: {},
      query: {},
    } as never)).resolves.toEqual({ data: config, message: "success" });
    expect(getConfig).toHaveBeenCalledWith(user);
  });

  test("strictly parses estimate input before passing session and trusted IP", async () => {
    const createEstimate = mock(async () => estimate);
    const controller = new Controller({
      getConfig: mock(async () => config),
      createEstimate,
    } as never);
    await expect(controller.createEstimate({
      user,
      params: {},
      query: {},
      body,
      ip: "192.0.2.10",
      headers: {},
    } as never)).resolves.toEqual({ data: estimate, message: "success" });
    expect(createEstimate).toHaveBeenCalledWith(user, body, "192.0.2.10");

    for (const invalidBody of [
      { ...body, tenant_id: tenantId },
      { ...body, douyin_miniapp_installation_id: installationId },
      { ...body, phone: "13800138000" },
      { ...body, area: 9 },
    ]) {
      await expect(controller.createEstimate({
        user,
        params: {},
        query: {},
        body: invalidBody,
        ip: "192.0.2.10",
        headers: {},
      } as never)).rejects.toMatchObject({
        statusCode: 400,
        code: "VALIDATION_ERROR",
      });
    }
    expect(createEstimate).toHaveBeenCalledTimes(1);
  });

  test("rejects unexpected params or query before service dispatch", async () => {
    const getConfig = mock(async () => config);
    const createEstimate = mock(async () => estimate);
    const controller = new Controller({ getConfig, createEstimate } as never);

    await expect(controller.getConfig({
      user,
      params: { id: "forged" },
      query: {},
    } as never)).rejects.toMatchObject({ statusCode: 400 });
    await expect(controller.getConfig({
      user,
      params: {},
      query: { tenant_id: tenantId },
    } as never)).rejects.toMatchObject({ statusCode: 400 });
    await expect(controller.createEstimate({
      user,
      params: {},
      query: { tenant_id: tenantId },
      body,
      ip: "192.0.2.10",
      headers: {},
    } as never)).rejects.toMatchObject({ statusCode: 400 });
    expect(getConfig).not.toHaveBeenCalled();
    expect(createEstimate).not.toHaveBeenCalled();
  });

  test("preserves session authorization status and rejects invalid signed IP headers", async () => {
    const getConfig = mock(async () => {
      throw Errors.unauthorized("请使用抖音小程序会话");
    });
    const createEstimate = mock(async () => estimate);
    const controller = new Controller({ getConfig, createEstimate } as never);
    await expect(controller.getConfig({
      params: {},
      query: {},
    } as never)).rejects.toMatchObject({ statusCode: 401, code: "UNAUTHORIZED" });

    await expect(controller.createEstimate({
      user,
      params: {},
      query: {},
      body,
      ip: "127.0.0.1",
      headers: { "x-gooes-client-ip": "192.0.2.10" },
    } as never)).rejects.toMatchObject({
      statusCode: 400,
      code: "INVALID_INTERNAL_CLIENT_IP_SIGNATURE",
    });
    expect(createEstimate).not.toHaveBeenCalled();
  });
});
