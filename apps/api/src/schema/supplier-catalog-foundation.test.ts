import { describe, expect, test } from "bun:test";

import {
  CatalogCategoryCreateSchema,
  CatalogCategoryUpdateSchema,
  CatalogUnitCreateSchema,
  CatalogUnitUpdateSchema,
} from "./supplier-catalog";

const uuid = "11111111-1111-4111-8111-111111111111";

describe("supplier catalog foundation fields", () => {
  test("validates category level between 1 and 6", () => {
    const input = {
      parent_id: null,
      code: "material",
      name: "主材",
      level: 1,
    };

    expect(CatalogCategoryCreateSchema.safeParse(input).success).toBe(true);
    expect(
      CatalogCategoryCreateSchema.safeParse({ ...input, level: 0 }).success,
    ).toBe(false);
    expect(
      CatalogCategoryUpdateSchema.safeParse({
        expected_version: 1,
        level: 7,
      }).success,
    ).toBe(false);
  });

  test("validates positive unit factors and base-unit semantics", () => {
    const baseUnit = {
      code: "m",
      name: "米",
      symbol: "m",
      base_unit_id: null,
      conversion_factor: 1,
      unit_dimension: "length",
    };
    const derivedUnit = {
      code: "cm",
      name: "厘米",
      symbol: "cm",
      base_unit_id: uuid,
      conversion_factor: 0.01,
      unit_dimension: "length",
    };

    expect(CatalogUnitCreateSchema.safeParse(baseUnit).success).toBe(true);
    expect(CatalogUnitCreateSchema.safeParse(derivedUnit).success).toBe(true);
    expect(CatalogUnitCreateSchema.safeParse({
      ...baseUnit,
      conversion_factor: 2,
    }).success).toBe(false);
    expect(CatalogUnitCreateSchema.safeParse({
      ...derivedUnit,
      conversion_factor: 0,
    }).success).toBe(false);
    expect(CatalogUnitUpdateSchema.safeParse({
      expected_version: 1,
      base_unit_id: null,
      conversion_factor: 2,
    }).success).toBe(false);
  });

  test("rejects unsafe numeric coercion and numeric(18,6) overflow", () => {
    expect(CatalogCategoryCreateSchema.safeParse({
      parent_id: null,
      code: "material",
      name: "主材",
      level: true,
    }).success).toBe(false);
    for (const conversion_factor of [true, 0.0000001, 1.1234567, 1e12]) {
      expect(CatalogUnitCreateSchema.safeParse({
        code: "box",
        name: "箱",
        symbol: "箱",
        base_unit_id: uuid,
        conversion_factor,
        unit_dimension: "quantity",
      }).success).toBe(false);
    }
    for (const exact of ["999999999999.123456", "123456789012.123456"]) {
      const parsed = CatalogUnitCreateSchema.parse({
        code: "box",
        name: "箱",
        symbol: "箱",
        base_unit_id: uuid,
        conversion_factor: exact,
        unit_dimension: "quantity",
      }).conversion_factor;
      expect(parsed).toBe(exact);
    }
    for (const conversion_factor of [
      "1.1234567",
      999999999999.123456,
      123456789012.123456,
    ]) {
      expect(CatalogUnitCreateSchema.safeParse({
        code: "box",
        name: "箱",
        symbol: "箱",
        base_unit_id: uuid,
        conversion_factor,
        unit_dimension: "quantity",
      }).success).toBe(false);
    }
  });
});
