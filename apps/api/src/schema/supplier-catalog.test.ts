import { describe, expect, test } from "bun:test";

import {
  TenantCatalogBrandCreateSchema,
  TenantCatalogBrandUpdateSchema,
  TenantCatalogCategoryCreateSchema,
  TenantCatalogCategoryUpdateSchema,
} from "./supplier-catalog";

describe("tenant catalog schemas", () => {
  test("create category defaults parent and platform mapping to null", () => {
    const result = TenantCatalogCategoryCreateSchema.parse({
      code: "T-CAT-001",
      name: "主材",
    });

    expect(result).toEqual({
      parent_id: null,
      code: "T-CAT-001",
      name: "主材",
      mapped_platform_category_id: null,
    });
  });

  test("create category rejects client-supplied ownership", () => {
    expect(() => TenantCatalogCategoryCreateSchema.parse({
      code: "T-CAT-001",
      name: "主材",
      ownership_scope: "tenant",
    })).toThrow();
  });

  test("update category requires expected_version and a real change", () => {
    expect(TenantCatalogCategoryUpdateSchema.parse({
      expected_version: 2,
      name: "改名",
    })).toEqual({
      expected_version: 2,
      name: "改名",
    });

    expect(() => TenantCatalogCategoryUpdateSchema.parse({
      expected_version: 2,
    })).toThrow();
  });

  test("create and update brand normalize mapping and reject ownership", () => {
    expect(TenantCatalogBrandCreateSchema.parse({
      code: "T-BR-001",
      name: "私有品牌",
    })).toEqual({
      code: "T-BR-001",
      name: "私有品牌",
      mapped_platform_brand_id: null,
    });

    expect(() => TenantCatalogBrandCreateSchema.parse({
      code: "T-BR-001",
      name: "私有品牌",
      ownership_scope: "platform",
    })).toThrow();

    expect(TenantCatalogBrandUpdateSchema.parse({
      expected_version: 1,
      name: "新名",
    })).toEqual({
      expected_version: 1,
      name: "新名",
    });
  });
});
