import { expect, test } from "bun:test";
import { mapSupplierCommandDatabaseError, mapSupplierPurchaseFulfillmentEnvelopeError } from "./supplier-command-errors";

test.each([
  ["WAREHOUSE_PROCUREMENT_NOT_ENABLED", "仓库采购尚未开放"],
  ["WAREHOUSE_NOT_FOUND", "仓库不存在"],
  ["WAREHOUSE_INACTIVE", "仓库已停用"],
  ["PROCUREMENT_DESTINATION_INVALID", "采购目的地无效"],
  ["INVENTORY_SOURCE_CONFLICT", "库存入账来源冲突"],
])("maps destination error %s to Chinese business response", (code, message) => {
  expect(mapSupplierCommandDatabaseError({ message: code })).toMatchObject({ code, message });
});

test("warehouse receipt error envelope preserves business code", () => {
  expect(mapSupplierPurchaseFulfillmentEnvelopeError("state_conflict", "INVENTORY_SOURCE_CONFLICT"))
    .toMatchObject({ code: "INVENTORY_SOURCE_CONFLICT", statusCode: 409 });
});
