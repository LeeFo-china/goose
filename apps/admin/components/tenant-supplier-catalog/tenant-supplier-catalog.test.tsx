import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

import * as display from "./tenant-catalog-display";
import * as requests from "./tenant-catalog-requests";
import * as rules from "./tenant-catalog-rules";

const PLATFORM_CATEGORY_ID = "11111111-1111-4111-8111-111111111111";
const TENANT_CATEGORY_ID = "22222222-2222-4222-8222-222222222222";
const TENANT_CHILD_ID = "33333333-3333-4333-8333-333333333333";

describe("租户供应商目录", () => {
  test("builds bounded tenant list requests without platform write paths", () => {
    expect(requests.buildTenantCatalogListPath({
      view: "categories",
      page: 2,
      pageSize: 200,
      keyword: "瓷砖",
      status: "inactive",
      parentId: TENANT_CATEGORY_ID,
    })).toBe(
      `/catalog/categories?page=2&pageSize=100&keyword=${encodeURIComponent("瓷砖")}&status=inactive&parent_id=${TENANT_CATEGORY_ID}`,
    );
    expect(requests.buildTenantCatalogListPath({
      view: "unit-suggestions",
      page: 1,
      pageSize: 20,
      keyword: "ignored",
      status: "approved",
      parentId: null,
    })).toBe("/catalog/unit-suggestions?page=1&pageSize=20&status=approved");
    expect(requests.buildTenantCategoryCommand({
      id: TENANT_CATEGORY_ID,
      payload: { name: "私有瓷砖", expected_version: 2 },
      idempotencyKey: "tenant-category:update-1",
    })).toEqual({
      path: `/catalog/categories/${TENANT_CATEGORY_ID}`,
      init: {
        method: "PATCH",
        headers: { "Idempotency-Key": "tenant-category:update-1" },
        body: JSON.stringify({ name: "私有瓷砖", expected_version: 2 }),
      },
    });
    expect(requests.buildTenantSpecListPath(TENANT_CATEGORY_ID, 3, 20, "active"))
      .toBe(`/catalog/categories/${TENANT_CATEGORY_ID}/spec-definitions?page=3&pageSize=20&status=active`);
    expect(requests.buildTenantUnitSuggestionCommand({
      suggested_code: "BOX",
      suggested_name: "箱",
      suggested_symbol: "箱",
      unit_dimension: "quantity",
      reason: "行业常用包装单位",
    }, "unit-suggestion:create-1").path).toBe("/catalog/unit-suggestions");
    expect(JSON.stringify(requests)).not.toContain("/platform/catalog");
  });

  test("derives read-only actions from permanent ownership", () => {
    expect(rules.getTenantCatalogCapabilities({
      ownership_scope: "platform",
      mapped_platform_category_id: null,
    })).toEqual({ canEdit: false, canChangeStatus: false, canCopySpecs: false });
    expect(rules.getTenantCatalogCapabilities({
      ownership_scope: "tenant",
      mapped_platform_category_id: PLATFORM_CATEGORY_ID,
    })).toEqual({ canEdit: true, canChangeStatus: true, canCopySpecs: true });
  });

  test("builds tenant brand, spec copy and spec edit commands", () => {
    expect(requests.buildTenantBrandCommand({
      payload: {
        code: "TENANT-BRAND",
        name: "租户品牌",
        mapped_platform_brand_id: null,
      },
      idempotencyKey: "tenant-brand:create-1",
    }).path).toBe("/catalog/brands");
    expect(requests.buildTenantSpecCommand({
      categoryId: TENANT_CATEGORY_ID,
      definitionId: PLATFORM_CATEGORY_ID,
      payload: { expected_version: 2, name: "长度" },
      idempotencyKey: "tenant-spec:update-1",
    }).path).toBe(
      `/catalog/categories/${TENANT_CATEGORY_ID}/spec-definitions/${PLATFORM_CATEGORY_ID}`,
    );
    expect(requests.buildTenantCopySpecsCommand({
      categoryId: TENANT_CATEGORY_ID,
      platformCategoryId: PLATFORM_CATEGORY_ID,
      expectedVersion: 3,
      idempotencyKey: "tenant-spec:copy-1",
    })).toMatchObject({
      path: `/catalog/categories/${TENANT_CATEGORY_ID}/spec-definitions:copy-platform`,
      init: { method: "POST" },
    });
  });

  test("navigates tenant category trails and restores parent list state", () => {
    const rootState = {
      page: 3,
      pageSize: 20,
      keyword: "辅料",
      status: "active" as const,
    };
    const trail = [{
      id: TENANT_CATEGORY_ID,
      name: "租户辅料",
      ownershipScope: "tenant" as const,
      level: 1,
      returnState: rootState,
    }];
    const childHref = rules.tenantCategoryTrailHref([
      ...trail,
      {
        id: TENANT_CHILD_ID,
        name: "胶粘剂",
        ownershipScope: "tenant",
        level: 2,
        returnState: { page: 1, pageSize: 20, keyword: "", status: "" },
      },
    ]);

    expect(rules.decodeTenantCategoryTrail(
      new URL(childHref, "http://admin.local").searchParams.get("categoryPath") ?? "",
    )).toHaveLength(2);
    expect(rules.currentTenantCategoryParent(trail)).toBe(TENANT_CATEGORY_ID);
    expect(rules.tenantParentCategoryHref(trail)).toBe(
      "/supplier-catalog?page=3&pageSize=20&keyword=%E8%BE%85%E6%96%99&status=active",
    );
    expect(rules.canCreateTenantCategoryAtTrail(trail)).toBe(true);
    expect(rules.canCreateTenantCategoryAtTrail([{
      ...trail[0],
      ownershipScope: "platform",
    }])).toBe(false);
    expect(requests.buildTenantCatalogListPath({
      view: "categories",
      page: 1,
      pageSize: 20,
      keyword: "",
      status: "active",
      parentId: TENANT_CATEGORY_ID,
    })).toContain(`parent_id=${TENANT_CATEGORY_ID}`);
  });

  test("builds independent tenant-only mapping option pages and pins selections", () => {
    expect(requests.buildTenantPlatformCategoryOptionsPath({
      page: 2,
      pageSize: 20,
      keyword: "瓷砖",
      parentId: PLATFORM_CATEGORY_ID,
    })).toBe(
      `/catalog/categories?page=2&pageSize=20&status=active&scope=platform&keyword=${encodeURIComponent("瓷砖")}&parent_id=${PLATFORM_CATEGORY_ID}`,
    );
    expect(requests.buildTenantPlatformBrandOptionsPath({
      page: 3,
      pageSize: 20,
      keyword: "品牌",
    })).toBe(
      `/catalog/brands?page=3&pageSize=20&status=active&scope=platform&keyword=${encodeURIComponent("品牌")}`,
    );
    const pinned = { id: PLATFORM_CATEGORY_ID, code: "TILE", name: "地砖" };
    const candidate = { id: TENANT_CHILD_ID, code: "WOOD", name: "木地板" };
    expect(rules.mergePinnedCatalogOption([candidate], pinned)).toEqual([
      pinned,
      candidate,
    ]);
    expect(JSON.stringify(requests)).not.toContain("/platform/catalog");
  });

  test("renders source badges, full category path and platform mapping", () => {
    const platformBadge = renderToStaticMarkup(
      <display.TenantCatalogSourceBadge ownershipScope="platform" />,
    );
    const tenantSummary = renderToStaticMarkup(
      <display.TenantCategoryIdentity
        fullName="主材 / 瓷砖 / 地砖"
        mappedPlatformName="平台标准：地砖"
      />,
    );

    expect(platformBadge).toContain("平台共享");
    expect(platformBadge).toContain("inline-flex items-center");
    expect(tenantSummary).toContain("主材 / 瓷砖 / 地砖");
    expect(tenantSummary).toContain("平台标准：地砖");
  });

  test("renders unit dimensions and suggestion lifecycle badges", () => {
    expect(renderToStaticMarkup(
      <display.CatalogUnitDimension value="quantity" />,
    )).toContain("数量");
    expect(renderToStaticMarkup(
      <display.UnitSuggestionStatusBadge status="submitted" />,
    )).toContain("待审核");
    expect(renderToStaticMarkup(
      <display.UnitSuggestionStatusBadge status="rejected" />,
    )).toContain("已拒绝");
  });
});
