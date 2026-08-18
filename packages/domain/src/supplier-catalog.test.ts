import { describe, expect, test } from "bun:test";

import { CATALOG_SPEC_VALUE_TYPE_VALUES } from "./index";
import type {
  CatalogSpecValue,
  CatalogSpecValueMap,
  SupplierOwnershipRef,
  UnitConversionEdge,
} from "./index";

const textValue: CatalogSpecValue = "800×800×10mm";
const numberValue: CatalogSpecValue = 10.5;
const booleanValue: CatalogSpecValue = true;
const enumValue: CatalogSpecValue = ["柔光", "防滑"];
const specValues: CatalogSpecValueMap = {
  size: textValue,
  thickness: numberValue,
  antiSlip: booleanValue,
  finishes: enumValue,
};

const conversion: UnitConversionEdge = {
  fromUnitId: "box",
  toUnitId: "piece",
  factor: "8.0000",
};

const invalidConversion: UnitConversionEdge = {
  fromUnitId: "box",
  toUnitId: "piece",
  // @ts-expect-error Unit conversion factors must use decimal strings.
  factor: 8,
};

const platformOwnership: SupplierOwnershipRef = {
  ownershipScope: "platform",
  ownerTenantId: null,
};
const tenantOwnership: SupplierOwnershipRef = {
  ownershipScope: "tenant",
  ownerTenantId: "tenant-1",
};

void invalidConversion;

describe("supplier catalog domain contract", () => {
  test("keeps the six structured specification types stable", () => {
    expect(CATALOG_SPEC_VALUE_TYPE_VALUES).toEqual([
      "text",
      "number",
      "boolean",
      "single_enum",
      "multi_enum",
      "date",
    ]);
  });

  test("represents structured specification values and maps", () => {
    expect(specValues).toEqual({
      size: "800×800×10mm",
      thickness: 10.5,
      antiSlip: true,
      finishes: ["柔光", "防滑"],
    });
  });

  test("keeps unit conversion factors as decimal strings", () => {
    expect(conversion.factor).toBe("8.0000");
  });

  test("reuses the platform and tenant ownership union", () => {
    expect(platformOwnership).toEqual({
      ownershipScope: "platform",
      ownerTenantId: null,
    });
    expect(tenantOwnership).toEqual({
      ownershipScope: "tenant",
      ownerTenantId: "tenant-1",
    });
  });
});
