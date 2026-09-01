import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

import { SupplierSkuPriceFields } from "./supplier-sku-price-fields";

describe("SupplierSkuPriceFields", () => {
  test("SSR 输出无外框采购价格字段、动态单位后缀和状态提示", () => {
    const activeMarkup = renderToStaticMarkup(
      <SupplierSkuPriceFields
        idPrefix="active-price-test"
        value={{ unitPrice: "318.00", taxRate: "0.13", taxInclusive: false }}
        purchaseUnitSymbol="箱"
        disabled={false}
        effectiveUntilNotice="本次价格有效至 2026/9/2 08:30"
        unitPriceError={null}
        onChange={() => undefined}
      />,
    );
    const inactiveMarkup = renderToStaticMarkup(
      <SupplierSkuPriceFields
        idPrefix="inactive-price-test"
        value={{ unitPrice: "318.00", taxRate: "0.13", taxInclusive: false }}
        purchaseUnitSymbol="箱"
        disabled
        effectiveUntilNotice={null}
        unitPriceError={null}
        onChange={() => undefined}
      />,
    );
    const invalidMarkup = renderToStaticMarkup(
      <SupplierSkuPriceFields
        idPrefix="invalid-price-test"
        value={{ unitPrice: "", taxRate: "", taxInclusive: false }}
        purchaseUnitSymbol="箱"
        disabled={false}
        effectiveUntilNotice={null}
        unitPriceError="请输入大于 0 且最多两位小数的基础供货价"
        onChange={() => undefined}
      />,
    );

    expect(activeMarkup).toContain("采购价格");
    expect(activeMarkup).toContain("元 / 箱");
    expect(activeMarkup).toContain("本次价格有效至 2026/9/2 08:30");
    expect(inactiveMarkup).toContain("启用 SKU 后可调整供货价");
    expect(activeMarkup).not.toContain("data-slot=\"card\"");
    expect(invalidMarkup).toContain("required=\"\"");
    expect(invalidMarkup).toContain("aria-required=\"true\"");
    expect(invalidMarkup).toMatch(
      /<input[^>]*id="invalid-price-test-unit-price"[^>]*required=""[^>]*aria-required="true"/,
    );
    expect(invalidMarkup).toMatch(
      /<button(?=[^>]*role="combobox")(?=[^>]*id="invalid-price-test-tax-rate")(?=[^>]*aria-required="true")[^>]*>/,
    );
    expect(invalidMarkup).toContain("aria-invalid=\"true\"");
    expect(invalidMarkup).toContain(
      "aria-describedby=\"invalid-price-test-unit-price-requirement invalid-price-test-unit-price-error\"",
    );
    expect(invalidMarkup).toContain("id=\"invalid-price-test-unit-price-error\"");
    expect(invalidMarkup).toContain("请输入大于 0 且最多两位小数的基础供货价");
    expect(invalidMarkup).toContain("基础供货价<span aria-hidden=\"true\"");
    expect(invalidMarkup).toContain("税率<span aria-hidden=\"true\"");
  });
});
