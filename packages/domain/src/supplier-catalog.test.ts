import { describe, expect, test } from "bun:test";

import {
  CATALOG_SPEC_VALUE_TYPE_VALUES,
  type CatalogSpecValue,
  type CatalogSpecValueMap,
  type UnitConversionEdge,
} from "./supplier-catalog";
import type { SupplierOwnershipRef } from "./supplier-ownership";

const textValue: CatalogSpecValue = "800×800×10mm";
const numberValue: CatalogSpecValue = 10.5;
const booleanValue: CatalogSpecValue = true;
const multiEnumValue: CatalogSpecValue = ["柔光", "防滑"];

const specValues: CatalogSpecValueMap = {
  size: "800×800×10mm",
  finish: "柔光",
  color: "灰色",
  anti_slip: true,
  tags: ["耐磨", "防滑"],
};

const conversion: UnitConversionEdge = {
  fromUnitId: "box",
  toUnitId: "piece",
  factor: "8",
};

void textValue;
void numberValue;
void booleanValue;
void multiEnumValue;
void specValues;
void conversion;

const platformCatalog: SupplierOwnershipRef = {
  ownershipScope: "platform",
  ownerTenantId: null,
};

const tenantCatalog: SupplierOwnershipRef = {
  ownershipScope: "tenant",
  ownerTenantId: "tenant-1",
};

describe("supplier catalog domain contract", () => {
  test("keeps structured spec value types stable", () => {
    expect(CATALOG_SPEC_VALUE_TYPE_VALUES).toEqual([
      "text",
      "number",
      "boolean",
      "single_enum",
      "multi_enum",
      "date",
    ]);
  });

  test("accepts text, number, boolean, and multi-enum spec values", () => {
    expect(textValue).toBe("800×800×10mm");
    expect(numberValue).toBe(10.5);
    expect(booleanValue).toBe(true);
    expect(multiEnumValue).toEqual(["柔光", "防滑"]);
  });

  test("keeps unit conversion factors as decimal strings", () => {
    expect(conversion).toEqual({
      fromUnitId: "box",
      toUnitId: "piece",
      factor: "8",
    });
  });

  test("supports platform and tenant catalog ownership", () => {
    expect(platformCatalog.ownershipScope).toBe("platform");
    expect(platformCatalog.ownerTenantId).toBeNull();
    expect(tenantCatalog.ownershipScope).toBe("tenant");
    expect(tenantCatalog.ownerTenantId).toBe("tenant-1");
  });
});
