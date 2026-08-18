import { describe, expect, test } from "bun:test";

import { deriveSupplierCatalogCommandId } from "./supplier-catalog-command-id";

const USER_ID = "00000000-0000-4000-8000-000000000501";

describe("supplier catalog command resource ids", () => {
  test("are restart-stable and separate command and key identities", () => {
    const first = deriveSupplierCatalogCommandId(
      "catalog.unit.create",
      USER_ID,
      "same-key",
    );

    expect(deriveSupplierCatalogCommandId(
      "catalog.unit.create",
      USER_ID,
      "same-key",
    )).toBe(first);
    expect(deriveSupplierCatalogCommandId(
      "catalog.unit.create",
      USER_ID,
      "different-key",
    )).not.toBe(first);
    expect(deriveSupplierCatalogCommandId(
      "catalog.brand.create",
      USER_ID,
      "same-key",
    )).not.toBe(first);
    expect(first).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });
});
