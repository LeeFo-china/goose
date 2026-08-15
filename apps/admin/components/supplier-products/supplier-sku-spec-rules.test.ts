import { describe, expect, test } from "bun:test";

import {
  collectSpecValues,
  suggestedSkuName,
  type SupplierSkuSpecDefinition,
} from "./supplier-sku-spec-rules";

const specs: SupplierSkuSpecDefinition[] = [
  {
    id: "spec-1",
    code: "size",
    name: "规格",
    value_type: "text",
    required: true,
    enum_options: [],
    unit_dimension: null,
    participates_in_sku_name: true,
  },
  {
    id: "spec-2",
    code: "finish",
    name: "表面",
    value_type: "single_enum",
    required: true,
    enum_options: ["柔光", "亮光"],
    unit_dimension: null,
    participates_in_sku_name: true,
  },
  {
    id: "spec-3",
    code: "thickness",
    name: "厚度",
    value_type: "number",
    required: true,
    enum_options: [],
    unit_dimension: "mm",
    participates_in_sku_name: false,
  },
];

describe("SKU 规格控件规则", () => {
  test("按参与命名的规格生成建议名称", () => {
    const values = {
      规格: "800×800",
      表面: "柔光",
      厚度: 10,
    };
    expect(suggestedSkuName(specs, values, "东鹏 地砖")).toBe(
      "东鹏 地砖 800×800 柔光",
    );
  });

  test("从模板采集结构化规格值", () => {
    const values = collectSpecValues(specs, {
      规格: "800×800",
      表面: "柔光",
      厚度: "10",
    });
    expect(values).toEqual({
      规格: "800×800",
      表面: "柔光",
      厚度: 10,
    });
  });

  test("忽略空值与多选枚举归组", () => {
    const multi: SupplierSkuSpecDefinition = {
      id: "spec-4",
      code: "tags",
      name: "标签",
      value_type: "multi_enum",
      required: false,
      enum_options: [],
      unit_dimension: null,
      participates_in_sku_name: false,
    };
    const values = collectSpecValues([...specs, multi], {
      规格: "",
      厚度: 10,
      标签: ["耐磨", "防滑"],
    });
    expect(values).toEqual({
      厚度: 10,
      标签: ["耐磨", "防滑"],
    });
  });
});
