import { describe, expect, test } from "bun:test";

import { generateSupplierSkuCode } from "./supplier-sku-codes";

describe("generateSupplierSkuCode", () => {
  test("uses the complete UUID token so constructible ids cannot collide", () => {
    const first = "11111111-2222-4333-8444-555555555555";
    const second = "11111111-2222-4333-8aaa-666666666666";

    expect(generateSupplierSkuCode("tenant", first))
      .toBe("TS-11111111222243338444555555555555");
    expect(generateSupplierSkuCode("platform", first))
      .toBe("PS-11111111222243338444555555555555");
    expect(generateSupplierSkuCode("tenant", first))
      .not.toBe(generateSupplierSkuCode("tenant", second));
  });
});
