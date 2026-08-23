import { describe, expect, test } from "bun:test";

import {
  TenantPrivateSupplierUpdateSchema,
  TenantSupplierCodeAllocationSchema,
  TenantSupplierDirectoryQuerySchema,
  TenantSupplierListQuerySchema,
  TenantSupplierPrivateCreateSchema,
  TenantSupplierSharedCreateSchema,
} from "./tenant-suppliers";

const supplierId = "10000000-0000-4000-8000-000000000001";
const allocationId = "10000000-0000-4000-8000-000000000002";

describe("tenant supplier internal code contracts", () => {
  test("accepts an empty explicit code allocation command", () => {
    expect(TenantSupplierCodeAllocationSchema.parse({})).toEqual({});
    expect(TenantSupplierCodeAllocationSchema.safeParse({ unexpected: true }).success)
      .toBe(false);
  });

  test("normalizes generated internal codes and requires their allocation", () => {
    expect(TenantSupplierPrivateCreateSchema.parse({
      code_source: "generated",
      internal_supplier_code: " sup-000001 ",
      allocation_id: allocationId,
      name: "甲方材料",
      legal_name: "甲方材料有限公司",
      supplier_type: "manufacturer",
    })).toMatchObject({
      code_source: "generated",
      internal_supplier_code: "SUP-000001",
      allocation_id: allocationId,
    });

    expect(TenantSupplierPrivateCreateSchema.safeParse({
      code_source: "generated",
      internal_supplier_code: "SUP-000001",
      name: "甲方材料",
      legal_name: "甲方材料有限公司",
      supplier_type: "manufacturer",
    }).success).toBe(false);
  });

  test("normalizes manual internal codes and forbids an allocation id", () => {
    expect(TenantSupplierPrivateCreateSchema.parse({
      code_source: "manual",
      internal_supplier_code: " hz_supplier-02 ",
      name: "乙方材料",
      legal_name: "乙方材料有限公司",
      supplier_type: "distributor",
    })).toMatchObject({ internal_supplier_code: "HZ_SUPPLIER-02" });

    expect(TenantSupplierPrivateCreateSchema.safeParse({
      code_source: "manual",
      internal_supplier_code: "SUP-000002",
      allocation_id: allocationId,
      name: "乙方材料",
      legal_name: "乙方材料有限公司",
      supplier_type: "distributor",
    }).success).toBe(false);
  });

  test("allows only bounded uppercase internal code characters", () => {
    const privateSupplier = {
      code_source: "manual",
      name: "甲方材料",
      legal_name: "甲方材料有限公司",
      supplier_type: "manufacturer",
    } as const;

    for (const internal_supplier_code of [
      "A",
      "A B",
      "供应商-01",
      "A".repeat(65),
    ]) {
      expect(TenantSupplierPrivateCreateSchema.safeParse({
        ...privateSupplier,
        internal_supplier_code,
      }).success).toBe(false);
    }

    expect(TenantSupplierPrivateCreateSchema.parse({
      ...privateSupplier,
      internal_supplier_code: "a1",
    })).toMatchObject({ internal_supplier_code: "A1" });
    expect(TenantSupplierPrivateCreateSchema.parse({
      ...privateSupplier,
      internal_supplier_code: "a".repeat(64),
    })).toMatchObject({ internal_supplier_code: "A".repeat(64) });
  });

  test("requires the same generated or manual code contract for shared suppliers", () => {
    expect(TenantSupplierSharedCreateSchema.parse({
      supplier_id: supplierId,
      code_source: "manual",
      internal_supplier_code: " shared-01 ",
    })).toEqual({
      supplier_id: supplierId,
      code_source: "manual",
      internal_supplier_code: "SHARED-01",
    });
    expect(TenantSupplierSharedCreateSchema.parse({
      supplier_id: supplierId,
      code_source: "generated",
      internal_supplier_code: "sup-000003",
      allocation_id: allocationId,
    })).toMatchObject({
      code_source: "generated",
      internal_supplier_code: "SUP-000003",
      allocation_id: allocationId,
    });
    expect(TenantSupplierSharedCreateSchema.safeParse({
      supplier_id: supplierId,
    }).success).toBe(false);
  });
});

describe("tenant private supplier master contracts", () => {
  const validPrivateSupplier = {
    code_source: "manual",
    internal_supplier_code: "PRIVATE-01",
    name: "甲方材料",
    legal_name: "甲方材料有限公司",
    supplier_type: "manufacturer",
  } as const;

  test("accepts tenant private supplier creation with only a supplier name", () => {
    expect(TenantSupplierPrivateCreateSchema.parse({
      name: "固始晴天装饰工程有限公司",
    })).toEqual({
      name: "固始晴天装饰工程有限公司",
    });
  });

  test("keeps accepting legacy explicit private supplier code payloads", () => {
    expect(TenantSupplierPrivateCreateSchema.parse({
      name: "晴天建材",
      legal_name: "晴天建材有限公司",
      supplier_type: "manufacturer",
      code_source: "manual",
      internal_supplier_code: "SUNNY-01",
    })).toMatchObject({
      name: "晴天建材",
      legal_name: "晴天建材有限公司",
      supplier_type: "manufacturer",
      code_source: "manual",
      internal_supplier_code: "SUNNY-01",
    });
  });

  test("accepts bounded primary contact and address details", () => {
    expect(TenantSupplierPrivateCreateSchema.parse({
      ...validPrivateSupplier,
      primary_contact: {
        name: "张三",
        phone: "13800000000",
        email: "buyer@example.com",
      },
      address: {
        province: "浙江省",
        city: "杭州市",
        district: "西湖区",
        region_code: "330106",
        address_detail: "文三路 1 号",
      },
    })).toMatchObject({
      primary_contact: { name: "张三", phone: "13800000000" },
      address: { region_code: "330106", address_detail: "文三路 1 号" },
    });
  });

  test("normalizes optional unified social credit codes on create and update", () => {
    expect(TenantSupplierPrivateCreateSchema.parse({
      ...validPrivateSupplier,
      unified_social_credit_code: " 91330100abc123xyz0 ",
    })).toMatchObject({
      unified_social_credit_code: "91330100ABC123XYZ0",
    });

    expect(TenantPrivateSupplierUpdateSchema.parse({
      expected_version: 2,
      unified_social_credit_code: " 91330100def456uvw0 ",
    })).toEqual({
      expected_version: 2,
      unified_social_credit_code: "91330100DEF456UVW0",
    });
    expect(TenantPrivateSupplierUpdateSchema.parse({
      expected_version: 2,
      unified_social_credit_code: null,
    }).unified_social_credit_code).toBeNull();

    for (const unified_social_credit_code of ["   ", "A".repeat(65)]) {
      expect(TenantSupplierPrivateCreateSchema.safeParse({
        ...validPrivateSupplier,
        unified_social_credit_code,
      }).success).toBe(false);
    }
  });

  test("rejects ownership and tenant field injection on private and shared create", () => {
    const createCases = [
      {
        schema: TenantSupplierPrivateCreateSchema,
        input: validPrivateSupplier,
      },
      {
        schema: TenantSupplierSharedCreateSchema,
        input: {
          supplier_id: supplierId,
          code_source: "manual",
          internal_supplier_code: "SHARED-01",
        },
      },
    ] as const;

    for (const { schema, input } of createCases) {
      for (const forbidden of [
        { ownership_scope: "tenant" },
        { owner_tenant_id: supplierId },
        { code: "FORBIDDEN" },
        { tenant_id: supplierId },
      ]) {
        expect(schema.safeParse({ ...input, ...forbidden }).success).toBe(false);
      }
    }
  });

  test("rejects oversized master, contact, and address fields", () => {
    const cases = [
      { name: "供".repeat(121) },
      { legal_name: "供".repeat(161) },
      { primary_contact: { name: "人".repeat(81) } },
      { primary_contact: { name: "张三", phone: "1".repeat(41) } },
      {
        primary_contact: {
          name: "张三",
          email: `${"a".repeat(149)}@example.com`,
        },
      },
      {
        address: {
          province: "省".repeat(61),
          region_code: "330106",
          address_detail: "文三路 1 号",
        },
      },
      {
        address: {
          region_code: "3".repeat(21),
          address_detail: "文三路 1 号",
        },
      },
      {
        address: {
          region_code: "330106",
          address_detail: "路".repeat(301),
        },
      },
    ];

    for (const patch of cases) {
      expect(TenantSupplierPrivateCreateSchema.safeParse({
        ...validPrivateSupplier,
        ...patch,
      }).success).toBe(false);
    }
  });

  test("updates only mutable private supplier master fields", () => {
    expect(TenantPrivateSupplierUpdateSchema.parse({
      expected_version: "2",
      name: "甲方新材料",
      supplier_type: "distributor",
    })).toEqual({
      expected_version: 2,
      name: "甲方新材料",
      supplier_type: "distributor",
    });

    for (const forbidden of [
      { ownership_scope: "platform" },
      { owner_tenant_id: supplierId },
      { code: "PRIVATE-02" },
      { internal_supplier_code: "PRIVATE-02" },
      { code_source: "manual" },
      { allocation_id: allocationId },
    ]) {
      expect(TenantPrivateSupplierUpdateSchema.safeParse({
        expected_version: 1,
        name: "甲方新材料",
        ...forbidden,
      }).success).toBe(false);
    }
    expect(TenantPrivateSupplierUpdateSchema.safeParse({
      expected_version: 1,
    }).success).toBe(false);
  });
});

describe("tenant supplier pagination contracts", () => {
  test("reuses the default 1/20 pagination and rejects pageSize above 100", () => {
    for (const schema of [
      TenantSupplierListQuerySchema,
      TenantSupplierDirectoryQuerySchema,
    ]) {
      expect(schema.parse({})).toMatchObject({ page: 1, pageSize: 20 });
      expect(schema.safeParse({ pageSize: "101" }).success).toBe(false);
    }
  });
});
