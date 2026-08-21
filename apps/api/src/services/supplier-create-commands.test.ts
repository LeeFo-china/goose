import { describe, expect, mock, test } from "bun:test";

import type { AuthContext } from "@/services/authorization";
import { deriveSupplierCatalogCommandId } from "./supplier-catalog-command-id";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

const SUPPLIER_ID = "00000000-0000-4000-8000-000000000101";
const FIRST_ID = "00000000-0000-4000-8000-000000000201";
const SECOND_ID = "00000000-0000-4000-8000-000000000202";
const TYPE_ID = "00000000-0000-4000-8000-000000000203";
const USER_ID = "00000000-0000-4000-8000-000000000301";
const EMPLOYEE_ID = "00000000-0000-4000-8000-000000000302";

describe("supplier create command services", () => {
  test("builds five platform command contexts and replays the first resource", async () => {
    const ids = [FIRST_ID, SECOND_ID, FIRST_ID, FIRST_ID, FIRST_ID, FIRST_ID];
    const repository = platformRepository();
    repository.createQualificationType.mockImplementation(async (input) => ({
      status: "created",
      idempotent: input.qualification_type_id === SECOND_ID,
      qualification_type: {
        id: FIRST_ID,
        code: input.code,
      },
      version: 1,
    }));
    const { PlatformSuppliersService } = await import("./platform-suppliers");
    const regions = {
      list: mock(async () => [{
        adcode: "411502",
        name: "浉河区",
        level: "district",
        status: "active",
      }]),
    };
    const service = new PlatformSuppliersService({
      repository,
      accessPolicy: accessPolicy(),
      audit: { recordBestEffort: mock(async () => null) },
      regions,
      idFactory: () => ids.shift() ?? FIRST_ID,
    } as never);
    const context = platformAuth("platform.supplier.manage");
    const qualificationTypeInput = {
      code: "LICENSE",
      name: "营业执照",
      applicable_supplier_types: [],
      warning_days: 30,
      is_required: true,
      blocks_new_orders: true,
      status: "active" as const,
      sort_order: 100,
    };

    const first = await service.createQualificationType(
      context,
      qualificationTypeInput,
      "platform-create-1",
    );
    const replay = await service.createQualificationType(
      context,
      qualificationTypeInput,
      "platform-create-1",
    );
    await service.createQualification(context, {
      supplier_id: SUPPLIER_ID,
      qualification_type_id: TYPE_ID,
      document_file_id: FIRST_ID,
    }, "qualification-create-1");
    await service.createServiceRegion(context, {
      supplier_id: SUPPLIER_ID,
      region_code: "411502",
      region_level: "district",
      status: "active",
    }, "region-create-1");
    await service.createAddress(context, {
      supplier_id: SUPPLIER_ID,
      address_type: "registered",
      region_code: "411502",
      address_detail: "测试路 1 号",
      is_default: true,
      status: "active",
    }, "address-create-1");
    await service.createContact(context, {
      supplier_id: SUPPLIER_ID,
      contact_type: "primary",
      name: "张三",
      is_public: true,
      is_primary: true,
      status: "active",
    }, "contact-create-1");

    expect(first).toMatchObject({
      idempotent: false,
      qualification_type: { id: FIRST_ID },
    });
    expect(replay).toMatchObject({
      idempotent: true,
      qualification_type: { id: FIRST_ID },
    });
    expect(repository.createQualificationType.mock.calls[0]?.[0])
      .toMatchObject(commandContext("platform-create-1", {
        qualification_type_id: FIRST_ID,
      }));
    expect(repository.createQualificationType.mock.calls[1]?.[0])
      .toMatchObject(commandContext("platform-create-1", {
        qualification_type_id: SECOND_ID,
      }));
    expect(repository.createQualification).toHaveBeenCalledWith(
      expect.objectContaining(commandContext("qualification-create-1", {
        qualification_id: FIRST_ID,
        supplier_id: SUPPLIER_ID,
      })),
    );
    expect(repository.createServiceRegion).toHaveBeenCalledWith(
      expect.objectContaining(commandContext("region-create-1", {
        region_id: FIRST_ID,
        supplier_id: SUPPLIER_ID,
      })),
    );
    expect(repository.createAddress).toHaveBeenCalledWith(
      expect.objectContaining(commandContext("address-create-1", {
        address_id: FIRST_ID,
        supplier_id: SUPPLIER_ID,
      })),
    );
    expect(repository.createContact).toHaveBeenCalledWith(
      expect.objectContaining(commandContext("contact-create-1", {
        contact_id: FIRST_ID,
        supplier_id: SUPPLIER_ID,
      })),
    );
    expect(regions.list).not.toHaveBeenCalled();
  });

  test("builds deterministic catalog command contexts and keeps precise unit text", async () => {
    const repository = catalogRepository();
    const { SupplierCatalogService } = await import("./supplier-catalog");
    const service = new SupplierCatalogService({
      repository,
      accessPolicy: accessPolicy(),
    } as never);
    const context = platformAuth("platform.catalog.manage");
    const commandId = (namespace: string, key: string) =>
      deriveSupplierCatalogCommandId(namespace, USER_ID, key);

    await service.createCategory(context, {
      parent_id: null,
      code: "CAT-001",
      name: "主材",
      level: 1,
      status: "active",
      sort_order: 100,
    }, "category-create-1");
    await service.createBrand(context, {
      code: "BR-001",
      name: "雨虹",
      status: "active",
      sort_order: 100,
    }, "brand-create-1");
    await service.createUnit(context, {
      code: "UNIT-BOX",
      name: "箱",
      symbol: "箱",
      base_unit_id: null,
      conversion_factor: "999999999999.123456",
      unit_dimension: "quantity",
      status: "active",
      sort_order: 100,
    }, "unit-create-1");

    expect(repository.createCategory).toHaveBeenCalledWith(
      expect.objectContaining(commandContext("category-create-1", {
        category_id: commandId(
          "platform.catalog.category.create",
          "category-create-1",
        ),
      })),
    );
    expect(repository.createBrand).toHaveBeenCalledWith(
      expect.objectContaining(commandContext("brand-create-1", {
        brand_id: commandId(
          "platform.catalog.brand.create",
          "brand-create-1",
        ),
      })),
    );
    expect(repository.createUnit).toHaveBeenCalledWith(
      expect.objectContaining(commandContext("unit-create-1", {
        unit_id: commandId(
          "platform.catalog.unit.create",
          "unit-create-1",
        ),
        conversion_factor: "999999999999.123456",
        unit_dimension: "quantity",
      })),
    );
  });
});

function commandContext(
  key: string,
  fields: Record<string, unknown>,
) {
  return {
    ...fields,
    actor_user_id: USER_ID,
    actor_employee_id: EMPLOYEE_ID,
    idempotency_key: key,
  };
}

function platformAuth(permission: string): AuthContext {
  return {
    authUserId: USER_ID,
    employeeId: EMPLOYEE_ID,
    tenantId: null,
    tenantName: null,
    tenantSlug: null,
    tenantStatus: null,
    isPlatformAdmin: true,
    employeeName: "平台管理员",
    employeeStatus: "active",
    departmentId: null,
    tenantDepartmentId: null,
    departmentCode: null,
    departmentName: null,
    postId: null,
    postName: null,
    avatar: null,
    roleCodes: [],
    roles: [],
    permissions: [{ code: permission, scope: "all" }],
  };
}

function accessPolicy() {
  return {
    assertPermission: mock(() => "all"),
    assertTenantContext: mock(() => {
      throw new Error("tenant context not expected");
    }),
  };
}

function platformRepository() {
  return {
    createQualificationType: mock(async (_input: Record<string, unknown>) => ({
      status: "created",
      idempotent: false,
      qualification_type: { id: FIRST_ID },
      version: 1,
    })),
    createQualification: mock(async (_input: Record<string, unknown>) => ({
      status: "created",
      idempotent: false,
      qualification: { id: FIRST_ID },
      version: 1,
    })),
    createServiceRegion: mock(async (_input: Record<string, unknown>) => ({
      status: "created",
      idempotent: false,
      service_region: { id: FIRST_ID },
      version: 1,
    })),
    createAddress: mock(async (_input: Record<string, unknown>) => ({
      status: "created",
      idempotent: false,
      address: { id: FIRST_ID },
      version: 1,
    })),
    createContact: mock(async (_input: Record<string, unknown>) => ({
      status: "created",
      idempotent: false,
      contact: { id: FIRST_ID },
      version: 1,
    })),
  };
}

function catalogRepository() {
  return {
    createCategory: mock(async (_input: Record<string, unknown>) => ({
      status: "created",
      idempotent: false,
      category: { id: FIRST_ID },
      version: 1,
    })),
    createBrand: mock(async (_input: Record<string, unknown>) => ({
      status: "created",
      idempotent: false,
      brand: { id: FIRST_ID },
      version: 1,
    })),
    createUnit: mock(async (_input: Record<string, unknown>) => ({
      status: "created",
      idempotent: false,
      unit: { id: FIRST_ID, conversion_factor: "999999999999.123456" },
      version: 1,
    })),
  };
}
