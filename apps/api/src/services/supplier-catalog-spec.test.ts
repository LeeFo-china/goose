import { describe, expect, mock, test } from "bun:test";

import {
  auth,
  createDependencies,
  TENANT_ID,
  CATEGORY_ID,
} from "./supplier-catalog-test-support";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

async function createSpecService(overrides: Record<string, unknown> = {}) {
  const dependencies = createDependencies(overrides);
  const { SupplierCatalogSpecService } = await import(
    "./supplier-catalog-spec"
  );
  return {
    service: new SupplierCatalogSpecService(dependencies as never),
    dependencies,
  };
}

describe("SupplierCatalogSpecService boundaries", () => {
  test("copy platform specs requires catalog.manage and private writes", async () => {
    const missingPermission = await createSpecService({
      getTenantSupplierSettings: mock(async () => ({
        private_catalog_writes_enabled: true,
      })),
    });
    await expect(Promise.resolve().then(() =>
      missingPermission.service.copyPlatformSpecs(
        auth([], TENANT_ID, false),
        CATEGORY_ID,
        "copy-specs",
      )
    )).rejects.toMatchObject({ code: "FORBIDDEN" });

    const disabledFlag = await createSpecService({
      getTenantSupplierSettings: mock(async () => ({
        private_catalog_writes_enabled: false,
      })),
    });
    await expect(Promise.resolve().then(() =>
      disabledFlag.service.copyPlatformSpecs(
        auth(["supplier.catalog.manage"], TENANT_ID, false),
        CATEGORY_ID,
        "copy-specs",
      )
    )).rejects.toMatchObject({ code: "SUPPLIER_PRIVATE_WRITES_DISABLED" });
  });

  test("submit unit suggestion requires a tenant actor", async () => {
    const { service } = await createSpecService();
    await expect(Promise.resolve().then(() =>
      service.submitUnitSuggestion(
        auth(["supplier.catalog.manage"], null, false),
        { name: "平方英尺", symbol: "ft²", dimension: "面积", note: null },
        "unit-suggestion",
      )
    )).rejects.toMatchObject({ code: "TENANT_CONTEXT_REQUIRED" });
  });

  test("submit unit suggestion delegates to the repository", async () => {
    const { service, dependencies } = await createSpecService();
    await service.submitUnitSuggestion(
      auth(["supplier.catalog.manage"], TENANT_ID, false),
      { name: "平方英尺", symbol: "ft²", dimension: "面积", note: null },
      "unit-suggestion",
    );
    expect(dependencies.repository.submitUnitSuggestion).toHaveBeenCalledWith(
      expect.objectContaining({
        tenant_id: TENANT_ID,
        name: "平方英尺",
        idempotency_key: "unit-suggestion",
      }),
    );
  });
});
