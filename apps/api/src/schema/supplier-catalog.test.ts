import { describe, expect, test } from "bun:test";
import type { z } from "zod";

import * as catalogSchemas from "./supplier-catalog";

type Schema = z.ZodType<unknown>;

function schema(name: string): Schema {
  const value = (catalogSchemas as Record<string, unknown>)[name];
  expect(value).toBeDefined();
  return value as Schema;
}

describe("supplier catalog tenant schemas", () => {
  test("defaults every new list to page one and twenty rows with a maximum of 100", () => {
    for (const name of [
      "CatalogSpecDefinitionListQuerySchema",
      "CatalogUnitSuggestionListQuerySchema",
    ]) {
      expect(schema(name).parse({})).toMatchObject({ page: 1, pageSize: 20 });
      expect(schema(name).safeParse({ pageSize: 101 }).success).toBe(false);
    }
  });

  test("tenant mapping lists accept only the controlled platform scope", () => {
    for (const name of [
      "TenantCatalogCategoryListQuerySchema",
      "TenantCatalogBrandListQuerySchema",
    ]) {
      expect(schema(name).parse({ scope: "platform" })).toMatchObject({
        page: 1,
        pageSize: 20,
        scope: "platform",
      });
      expect(schema(name).safeParse({ scope: "tenant" }).success).toBe(false);
    }
  });

  test("category lists parse the optional leaf-only query flag", () => {
    const categoryList = schema("CatalogCategoryListQuerySchema");

    expect(categoryList.parse({ is_leaf: "true" })).toMatchObject({
      is_leaf: true,
    });
    expect(categoryList.parse({ is_leaf: "false" })).toMatchObject({
      is_leaf: false,
    });
    expect(categoryList.safeParse({ is_leaf: "1" }).success).toBe(false);
  });

  test("tenant category and brand payloads cannot provide ownership", () => {
    const category = schema("TenantCatalogCategoryCreateSchema");
    const brand = schema("TenantCatalogBrandCreateSchema");

    expect(category.safeParse({
      code: "CAT-PRIVATE",
      name: "租户分类",
      ownership_scope: "platform",
      owner_tenant_id: crypto.randomUUID(),
    }).success).toBe(false);
    expect(brand.safeParse({
      code: "BR-PRIVATE",
      name: "租户品牌",
      ownership_scope: "tenant",
      owner_tenant_id: crypto.randomUUID(),
    }).success).toBe(false);
  });

  test("tenant category creates only require user-facing fields", () => {
    const category = schema("TenantCatalogCategoryCreateSchema");

    expect(category.parse({
      name: "租户分类",
    })).toEqual({
      parent_id: null,
      name: "租户分类",
      status: "active",
    });
    expect(category.parse({
      parent_id: crypto.randomUUID(),
      name: "子分类",
    })).toMatchObject({
      name: "子分类",
      status: "active",
    });
  });

  test("tenant category updates reject system-managed fields", () => {
    const category = schema("TenantCatalogCategoryUpdateSchema");

    expect(category.parse({
      expected_version: 2,
      name: "更新名称",
    })).toEqual({
      expected_version: 2,
      name: "更新名称",
    });
    for (const field of [
      { code: "MANUAL" },
      { sort_order: 10 },
      { mapped_platform_category_id: crypto.randomUUID() },
    ]) {
      expect(category.safeParse({
        expected_version: 2,
        name: "更新名称",
        ...field,
      }).success).toBe(false);
    }
  });

  test("validates spec value types and enum contracts", () => {
    const create = schema("CatalogSpecDefinitionCreateSchema");
    const common = { code: "COLOR", name: "颜色" };

    for (const valueType of [
      "text", "number", "boolean", "single_enum", "multi_enum", "date",
    ]) {
      const enumOptions = valueType.includes("enum") ? ["红", "蓝"] : [];
      expect(create.safeParse({
        ...common,
        value_type: valueType,
        enum_options: enumOptions,
      }).success).toBe(true);
    }
    expect(create.safeParse({
      ...common,
      value_type: "single_enum",
      enum_options: [],
    }).success).toBe(false);
    expect(create.safeParse({
      ...common,
      value_type: "text",
      enum_options: ["非法"],
    }).success).toBe(false);
    expect(create.safeParse({
      ...common,
      value_type: "single_enum",
      enum_options: ["重复", "重复"],
    }).success).toBe(false);
  });

  test("requires expected versions for update, copy, and review contracts", () => {
    expect(schema("CatalogSpecDefinitionUpdateSchema").safeParse({
      name: "新名称",
    }).success).toBe(false);
    expect(schema("CopyPlatformSpecDefinitionsSchema").safeParse({
      platform_category_id: crypto.randomUUID(),
    }).success).toBe(false);
    expect(schema("CatalogUnitSuggestionReviewSchema").safeParse({
      action: "rejected",
      review_remark: "不符合标准",
    }).success).toBe(false);
  });

  test("accepts spec patches whose validity depends on the persisted state", () => {
    const update = schema("CatalogSpecDefinitionUpdateSchema");

    expect(update.safeParse({
      expected_version: 2,
      enum_options: ["红", "蓝", "绿"],
    }).success).toBe(true);
    expect(update.safeParse({
      expected_version: 2,
      unit_dimension: "length",
    }).success).toBe(true);
  });

  test("enforces suggestion review action fields", () => {
    const review = schema("CatalogUnitSuggestionReviewSchema");
    expect(review.safeParse({
      action: "approved",
      approved_catalog_unit_id: crypto.randomUUID(),
      expected_version: 1,
    }).success).toBe(true);
    expect(review.safeParse({
      action: "approved",
      expected_version: 1,
    }).success).toBe(false);
    expect(review.safeParse({
      action: "rejected",
      review_remark: "与已有单位重复",
      expected_version: 1,
    }).success).toBe(true);
  });
});

describe("supplier catalog unit schema", () => {
  test("requires and preserves a canonical unit dimension", () => {
    const create = catalogSchemas.CatalogUnitCreateSchema;
    const input = {
      code: "UNIT-BOX",
      name: "箱",
      symbol: "箱",
      base_unit_id: null,
      conversion_factor: "1",
      unit_dimension: "quantity",
    };

    expect(create.parse(input)).toMatchObject(input);
    expect(create.safeParse({
      ...input,
      unit_dimension: "legacy_unclassified",
    }).success).toBe(false);
    const { unit_dimension: _dimension, ...missing } = input;
    expect(create.safeParse(missing).success).toBe(false);
  });
});
