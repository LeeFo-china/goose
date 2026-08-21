import { beforeAll, describe, expect, mock, test } from "bun:test";

import type { AuthContext } from "@/services/authorization";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

let Service: typeof import("./tenant-douyin-budget")
  .TenantDouyinBudgetService;

beforeAll(async () => {
  ({ TenantDouyinBudgetService: Service } = await import(
    "./tenant-douyin-budget"
  ));
});

const TENANT_ID = "11111111-1111-4111-8111-111111111111";
const EMPLOYEE_ID = "22222222-2222-4222-8222-222222222222";
const VERSION_ID = "33333333-3333-4333-8333-333333333333";
const UPDATED_AT = "2026-08-21T08:00:00.123456+00:00";
const rawVersion = {
  id: VERSION_ID,
  tenant_id: TENANT_ID,
  version_no: 2,
  status: "draft" as const,
  effective_from: "2026-08-21T00:00:00+00:00",
  effective_to: null,
  currency: "CNY" as const,
  disclaimer: "初步估算，不构成最终报价",
  created_by_employee_id: EMPLOYEE_ID,
  created_at: UPDATED_AT,
  updated_at: UPDATED_AT,
  items: [{
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
  }],
};
const wireBaseItem = {
  role: "base" as const,
  category_code: "base" as const,
  item_code: "base.comfortable.rough",
  label: "舒适档毛坯基础施工",
  unit: "sqm" as const,
  minimum_amount_fen: 90_000,
  maximum_amount_fen: 120_000,
  property_condition: "rough" as const,
  decoration_tier: "comfortable" as const,
  property_condition_coefficient_bps: 10_000,
  whole_house_coefficient_bps: 10_000,
  partial_coefficient_bps: 6_000,
  sort_order: 0,
  status: "active" as const,
};

function authContext(
  permissions = ["douyin_miniapp.manage"],
  tenantId: string | null = TENANT_ID,
  employeeId: string | null = EMPLOYEE_ID,
): AuthContext {
  return {
    tenantId,
    employeeId,
    permissions: permissions.map((code) => ({ code, scope: "all" })),
  } as AuthContext;
}

function fixture(overrides: Record<string, unknown> = {}) {
  const repository = {
    listVersions: mock(async () => ({
      activeVersion: { ...rawVersion, status: "active" as const },
      rows: [rawVersion],
      total: 1,
    })),
    createDraft: mock(async () => ({ ok: true as const, data: rawVersion })),
    replaceItems: mock(async () => ({ ok: true as const, data: rawVersion })),
    activate: mock(async () => ({ ok: true as const, data: {
      ...rawVersion, status: "active" as const,
    } })),
    archive: mock(async () => ({ ok: true as const, data: {
      ...rawVersion, status: "archived" as const,
    } })),
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
  };
  const dependencies = { repository, accessPolicy, ...overrides };
  return {
    service: new Service(dependencies as never),
    repository,
    accessPolicy,
  };
}

describe("TenantDouyinBudgetService", () => {
  test("requires tenant manage permission and returns pagination echo", async () => {
    const context = fixture();
    await expect(context.service.list(authContext(), { page: 1, pageSize: 20 }))
      .resolves.toMatchObject({
        active_version: { status: "active", tenant_id: TENANT_ID },
        list: [{ tenant_id: TENANT_ID, items: [wireBaseItem] }],
        pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
      });
    expect(context.accessPolicy.assertPermission).toHaveBeenCalledWith(
      expect.anything(),
      "douyin_miniapp.manage",
    );

    for (const contextValue of [
      authContext([], TENANT_ID),
      authContext(["douyin_miniapp.manage"], null),
    ]) {
      await expect(fixture().service.list(contextValue, {
        page: 1,
        pageSize: 20,
      })).rejects.toMatchObject({ statusCode: 403 });
    }
  });

  test("creates a tenant-scoped draft using the authenticated employee", async () => {
    const context = fixture();
    const input = {
      effective_from: "2026-08-21T00:00:00.000Z",
      effective_to: null,
      disclaimer: "初步估算，不构成最终报价",
    };
    await expect(context.service.createDraft(authContext(), input))
      .resolves.toMatchObject({ id: VERSION_ID, items: [wireBaseItem] });
    expect(context.repository.createDraft).toHaveBeenCalledWith({
      tenantId: TENANT_ID,
      employeeId: EMPLOYEE_ID,
      effectiveFrom: input.effective_from,
      effectiveTo: null,
      disclaimer: input.disclaimer,
    });

    await expect(context.service.createDraft(
      authContext(["douyin_miniapp.manage"], TENANT_ID, null),
      input,
    )).rejects.toMatchObject({
      statusCode: 403,
      code: "DOUYIN_BUDGET_PRICING_EMPLOYEE_REQUIRED",
    });
  });

  test("maps human admin fields to the exact calculator persistence adapter", async () => {
    const context = fixture();
    await context.service.replaceItems(authContext(), VERSION_ID, {
      expected_updated_at: UPDATED_AT,
      items: [wireBaseItem, {
        role: "option",
        category_code: "custom",
        item_code: "custom_cabinet",
        label: "定制柜体",
        unit: "fixed",
        minimum_amount_fen: 2_000_000,
        maximum_amount_fen: 3_000_000,
        property_conditions: [],
        decoration_tiers: ["comfortable"],
        decoration_scopes: ["whole_house", "partial"],
        sort_order: 1,
        status: "active",
      }],
    });

    expect(context.repository.replaceItems).toHaveBeenCalledWith({
      tenantId: TENANT_ID,
      versionId: VERSION_ID,
      expectedUpdatedAt: UPDATED_AT,
      items: [{
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
      }, {
        category_code: "custom",
        item_code: "custom_cabinet",
        label: "定制柜体",
        unit: "fixed",
        minimum_amount: 2_000_000,
        maximum_amount: 3_000_000,
        condition_payload: {
          role: "option",
          decoration_tiers: ["comfortable"],
          decoration_scopes: ["whole_house", "partial"],
        },
        sort_order: 1,
        status: "active",
      }],
    });
  });

  test("delegates optimistic activation/archive and maps only known errors", async () => {
    const context = fixture();
    await context.service.activate(authContext(), VERSION_ID, {
      expected_updated_at: UPDATED_AT,
    });
    await context.service.archive(authContext(), VERSION_ID, {
      expected_updated_at: UPDATED_AT,
    });
    expect(context.repository.activate).toHaveBeenCalledWith({
      tenantId: TENANT_ID,
      versionId: VERSION_ID,
      expectedUpdatedAt: UPDATED_AT,
    });
    expect(context.repository.archive).toHaveBeenCalledWith({
      tenantId: TENANT_ID,
      versionId: VERSION_ID,
      expectedUpdatedAt: UPDATED_AT,
    });

    const stale = fixture({
      repository: {
        ...context.repository,
        activate: mock(async () => ({ ok: false as const, error: {
          status_code: 409 as const,
          code: "DOUYIN_BUDGET_PRICING_STALE" as const,
          message: "报价版本已更新，请刷新后重试",
        } })),
      },
    });
    await expect(stale.service.activate(authContext(), VERSION_ID, {
      expected_updated_at: UPDATED_AT,
    })).rejects.toMatchObject({
      statusCode: 409,
      code: "DOUYIN_BUDGET_PRICING_STALE",
    });
  });

  test("rejects cross-tenant command success and invalid stored conditions", async () => {
    const otherTenant = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const crossTenant = fixture({
      repository: {
        ...fixture().repository,
        activate: mock(async () => ({ ok: true as const, data: {
          ...rawVersion,
          tenant_id: otherTenant,
        } })),
      },
    });
    await expect(crossTenant.service.activate(authContext(), VERSION_ID, {
      expected_updated_at: UPDATED_AT,
    })).rejects.toMatchObject({
      statusCode: 500,
      code: "DOUYIN_BUDGET_PRICING_RESPONSE_INVALID",
    });

    const invalidStored = fixture({
      repository: {
        ...fixture().repository,
        listVersions: mock(async () => ({ activeVersion: null, rows: [{
          ...rawVersion,
          items: [{
            ...rawVersion.items[0],
            condition_payload: { role: "base", expression: "unsafe" },
          }],
        }], total: 1 })),
      },
    });
    await expect(invalidStored.service.list(authContext(), {
      page: 1,
      pageSize: 20,
    })).rejects.toMatchObject({
      statusCode: 500,
      code: "DOUYIN_BUDGET_PRICING_RESPONSE_INVALID",
    });
  });
});
