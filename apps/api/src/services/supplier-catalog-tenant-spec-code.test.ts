import { describe, expect, mock, test } from "bun:test";
import type { AuthContext } from "@/services/authorization";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

const TENANT_ID = "00000000-0000-4000-8000-000000000101";
const USER_ID = "00000000-0000-4000-8000-000000000102";
const EMPLOYEE_ID = "00000000-0000-4000-8000-000000000103";
const CATEGORY_ID = "00000000-0000-4000-8000-000000000201";

const auth = {
  tenantId: TENANT_ID,
  authUserId: USER_ID,
  employeeId: EMPLOYEE_ID,
  permissions: [{ code: "supplier.catalog.manage", scope: "all" }],
} as AuthContext;

describe("SupplierCatalogTenantService spec code generation", () => {
  test("generates tenant spec codes when simplified creates omit internal codes", async () => {
    const { SupplierCatalogService } = await import("./supplier-catalog");
    const repository = {
      findVisibleCategory: mock(async () => ({
        id: CATEGORY_ID,
        ownership_scope: "tenant",
        owner_tenant_id: TENANT_ID,
      })),
      createSpecDefinition: mock(async (input: unknown) => input),
    };
    const service = new SupplierCatalogService({
      repository,
      settingsRepository: { getSettings: mock(async () => ({
        module_enabled: true,
        ownership_reads_enabled: true,
        private_supplier_writes_enabled: true,
        private_catalog_writes_enabled: true,
        procurement_snapshot_v1_enabled: false,
        purchase_batch_workflow_enabled: false,
      })) },
      accessPolicy: {
        assertTenantContext: mock(() => TENANT_ID),
        assertPermission: mock(() => "all"),
      },
      commandIdFactory: () => "00000000-0000-4000-8000-000000000301",
    } as never);

    await service.createTenantSpecDefinition(auth, CATEGORY_ID, {
      name: "颜色",
      value_type: "single_enum",
      enum_options: ["红", "蓝"],
      unit_dimension: null,
      is_required: true,
      participates_in_sku_name: true,
      is_filterable: true,
      sort_order: 100,
      status: "active",
    }, "spec-create-system-code");

    expect(repository.createSpecDefinition).toHaveBeenCalledWith(
      expect.objectContaining({
        spec_definition_id: "00000000-0000-4000-8000-000000000301",
        category_id: CATEGORY_ID,
        code: "TS-00000000000040008000000000000301",
      }),
    );
  });
});
