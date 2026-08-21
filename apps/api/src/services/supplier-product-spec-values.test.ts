import { describe, expect, test } from "bun:test";

import { validateSupplierSkuSpecValues } from "./supplier-product-spec-values";

const definitions = [
  definition("title", "text", true),
  definition("weight", "number"),
  definition("fragile", "boolean"),
  definition("color", "single_enum", false, ["灰色", "白色"]),
  definition("features", "multi_enum", false, ["防滑", "耐磨"]),
  definition("release_date", "date"),
];

describe("validateSupplierSkuSpecValues", () => {
  test("accepts every structured specification type", () => {
    expect(() => validateSupplierSkuSpecValues({
      title: "防滑砖",
      weight: 12.5,
      fragile: false,
      color: "灰色",
      features: ["防滑", "耐磨"],
      release_date: "2026-08-19",
    }, definitions)).not.toThrow();
  });

  test("rejects missing required, unknown, enum and invalid date values", () => {
    const invalidValues: Array<Record<
      string,
      string | number | boolean | string[]
    >> = [
      {},
      { title: "   " },
      { title: "砖", unknown: "value" },
      { title: "砖", color: "红色" },
      { title: "砖", features: ["防滑", "防滑"] },
      { title: "砖", release_date: "2026-02-30" },
    ];
    for (const values of invalidValues) {
      expect(() => validateSupplierSkuSpecValues(values, definitions))
        .toThrow();
    }
  });
});

function definition(
  code: string,
  value_type: string,
  is_required = false,
  enum_options: string[] = [],
) {
  return { code, value_type, is_required, enum_options, unit_dimension: null };
}
