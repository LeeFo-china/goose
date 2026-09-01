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

    expect(activeMarkup).toContain("采购价格");
    expect(activeMarkup).toContain("元 / 箱");
    expect(activeMarkup).toContain("本次价格有效至 2026/9/2 08:30");
    expect(inactiveMarkup).toContain("启用 SKU 后可调整供货价");
    expect(activeMarkup).not.toContain("data-slot=\"card\"");
  });
});
