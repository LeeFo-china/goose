import { describe, expect, test } from "bun:test";

import { SUPPLIER_PURCHASABLE_PRODUCT_STATUS_VALUES } from "./index";

describe("supplier procurement domain contract", () => {
  test("keeps purchasable product command statuses stable", () => {
    expect(SUPPLIER_PURCHASABLE_PRODUCT_STATUS_VALUES).toEqual([
      "created",
      "validation_error",
      "state_conflict",
    ]);
  });
});
