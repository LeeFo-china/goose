import { describe, expect, test } from "bun:test";
import {
  PlatformSupplierIdParamSchema,
  PlatformSupplierListQuerySchema,
  PlatformSupplierUpdateSchema,
  PlatformTenantSupplierSettingsCommandSchema,
  SupplierAddressCreateSchema,
  SupplierAddressUpdateSchema,
  SupplierBlacklistCommandSchema,
  SupplierChildListQuerySchema,
  SupplierCommandSchema,
  SupplierContactCreateSchema,
  SupplierContactUpdateSchema,
  SupplierEventListQuerySchema,
  SupplierQualificationCreateSchema,
  SupplierQualificationRejectCommandSchema,
  SupplierQualificationTypeListQuerySchema,
  SupplierQualificationTypeUpdateSchema,
  SupplierQualificationUpdateSchema,
  SupplierRejectCommandSchema,
  SupplierServiceRegionCreateSchema,
  SupplierServiceRegionUpdateSchema,
  SupplierSuspendCommandSchema,
} from "./platform-suppliers";
import {
  SupplierContractCreateSchema,
  SupplierContractTerminateCommandSchema,
  SupplierContractUpdateSchema,
  TenantSupplierBlacklistCommandSchema,
  TenantSupplierChildListQuerySchema,
  TenantSupplierContractPolicySchema,
  TenantSupplierDirectoryQuerySchema,
  TenantSupplierEligibilityParamSchema,
  TenantSupplierEventListQuerySchema,
  TenantSupplierListQuerySchema,
  TenantSupplierSuspendCommandSchema,
  TenantSupplierTerminateCommandSchema,
  TenantSupplierUpdateSchema,
} from "./tenant-suppliers";
import {
  CatalogBrandListQuerySchema,
  CatalogBrandUpdateSchema,
  CatalogCategoryCreateSchema,
  CatalogCategoryListQuerySchema,
  CatalogCategoryUpdateSchema,
  CatalogUnitCreateSchema,
  CatalogUnitListQuerySchema,
  CatalogUnitUpdateSchema,
} from "./supplier-catalog";
import type { CatalogUnitUpdateRecord } from "./supplier-catalog";
import type {
  PlatformSupplierCreateCommand,
  PlatformSupplierLifecycleCommand,
  SupplierCommandContext,
  SupplierCreateAuditContext,
  SupplierQualificationCreateRecord,
  SupplierQualificationReviewCommand,
  SupplierUpdateAuditContext,
} from "./platform-suppliers";
import type { SupplierContractLifecycleCommand, TenantSupplierCreateCommand } from "./tenant-suppliers";

const uuid = "11111111-1111-4111-8111-111111111111";
const actorContext = {
  actor_user_id: uuid, actor_employee_id: uuid,
  idempotency_key: "supplier-test-key",
} satisfies SupplierCommandContext;
const createAuditContext = { created_by_employee_id: uuid,
  updated_by_employee_id: uuid } satisfies SupplierCreateAuditContext;
const updateAuditContext = { updated_by_employee_id: uuid } satisfies SupplierUpdateAuditContext;
const commandTypeContracts = [
  {
    supplier_id: uuid, code: "SUP-001", name: "测试供应商",
    legal_name: "测试供应商有限公司",
    supplier_type: "manufacturer",
    ...actorContext,
  } satisfies PlatformSupplierCreateCommand,
  {
    supplier_id: uuid, action: "suspend", expected_version: 1,
    reason: "暂停合作",
    ...actorContext,
  } satisfies PlatformSupplierLifecycleCommand,
  {
    supplier_id: uuid, qualification_id: uuid,
    verification_status: "verified",
    expected_version: 1,
    ...actorContext,
  } satisfies SupplierQualificationReviewCommand,
  {
    tenant_id: uuid, tenant_supplier_id: uuid, supplier_id: uuid,
    ...actorContext,
  } satisfies TenantSupplierCreateCommand,
  {
    tenant_id: uuid, contract_id: uuid, action: "terminate",
    expected_version: 1,
    reason: "合同终止",
    ...actorContext,
  } satisfies SupplierContractLifecycleCommand,
  {
    supplier_id: uuid, qualification_type_id: uuid, document_file_id: uuid,
    ...createAuditContext,
  } satisfies SupplierQualificationCreateRecord,
  {
    unit_id: uuid, expected_version: 1, name: "箱",
    ...updateAuditContext,
  } satisfies CatalogUnitUpdateRecord,
] as const;
void commandTypeContracts;
const expectValid = (
  schema: { safeParse: (input: unknown) => { success: boolean } },
  input: unknown,
  success: boolean,
) => expect(schema.safeParse(input).success).toBe(success);

describe("supplier foundation list schemas", () => {
  const listSchemas = [
    PlatformSupplierListQuerySchema,
    SupplierQualificationTypeListQuerySchema,
    SupplierChildListQuerySchema,
    SupplierEventListQuerySchema,
    TenantSupplierListQuerySchema,
    TenantSupplierDirectoryQuerySchema,
    TenantSupplierChildListQuerySchema,
    TenantSupplierEventListQuerySchema,
    CatalogCategoryListQuerySchema,
    CatalogBrandListQuerySchema,
    CatalogUnitListQuerySchema,
  ] as const;

  test("defaults every list to page 1 and pageSize 20", () => {
    for (const schema of listSchemas) {
      expect(schema.parse({})).toMatchObject({ page: 1, pageSize: 20 });
    }
  });

  test("rejects pageSize above 100 for every list", () => {
    for (const schema of listSchemas) {
      expect(schema.safeParse({ pageSize: "101" }).success).toBe(false);
    }
  });

  test("trims list keywords and limits them to 80 characters", () => {
    const platform = PlatformSupplierListQuerySchema.parse({
      keyword: "  晴天建材  ",
    });
    const directory = TenantSupplierDirectoryQuerySchema.parse({
      keyword: "  水泥  ",
    });

    expect(platform.keyword).toBe("晴天建材");
    expect(directory.keyword).toBe("水泥");
    expectValid(PlatformSupplierListQuerySchema, { keyword: "供".repeat(81) }, false);
  });

  test("parses eligible as an explicit boolean query", () => {
    expect(TenantSupplierListQuerySchema.parse({ eligible: "false" }).eligible)
      .toBe(false);
    expect(TenantSupplierListQuerySchema.parse({ eligible: "true" }).eligible)
      .toBe(true);

    for (const eligible of ["0", "1", "yes", "arbitrary"]) {
      expectValid(TenantSupplierListQuerySchema, { eligible }, false);
    }
  });
});

describe("supplier foundation identity and strict updates", () => {
  test("rejects invalid UUID params", () => {
    expectValid(PlatformSupplierIdParamSchema, { id: "supplier-1" }, false);
    expectValid(TenantSupplierEligibilityParamSchema, { id: "relationship-1" }, false);
    expect(PlatformSupplierIdParamSchema.parse({ id: uuid })).toEqual({ id: uuid });
  });

  test("rejects lifecycle fields in generic PATCH schemas", () => {
    expectValid(PlatformSupplierUpdateSchema,
      { expected_version: 1, onboarding_status: "approved" }, false);
    expectValid(PlatformSupplierUpdateSchema,
      { expected_version: 1, operational_status: "blacklisted" }, false);
    expectValid(TenantSupplierUpdateSchema,
      { expected_version: 1, relationship_status: "active" }, false);
    expectValid(SupplierContractUpdateSchema,
      { expected_version: 1, lifecycle_status: "active" }, false);
  });

  test("requires a defined PATCH field without injecting create defaults", () => {
    const cases = [
      [PlatformSupplierUpdateSchema, { name: "测试供应商" }],
      [SupplierQualificationTypeUpdateSchema, { name: "营业执照" }],
      [SupplierQualificationUpdateSchema, { certificate_no: "CERT-001" }],
      [SupplierServiceRegionUpdateSchema, { region_code: "411525" }],
      [SupplierAddressUpdateSchema, { address_detail: "蓼城大道 1 号" }],
      [SupplierContactUpdateSchema, { name: "张三" }],
      [TenantSupplierUpdateSchema, { remark: "重点合作" }],
      [SupplierContractUpdateSchema, { name: "年度合同" }],
      [CatalogCategoryUpdateSchema, { name: "主材" }],
      [CatalogBrandUpdateSchema, { name: "晴天" }],
      [CatalogUnitUpdateSchema, { name: "箱" }],
    ] as const;

    for (const [schema, patch] of cases) {
      expectValid(schema, { expected_version: 1 }, false);
      const key = Object.keys(patch)[0] ?? "";
      expectValid(schema, { expected_version: 1, [key]: undefined }, false);
      expect(schema.parse({ expected_version: 1, ...patch }))
        .toEqual({ expected_version: 1, ...patch });
    }
  });

  test("never accepts tenant_id in tenant request bodies", () => {
    expectValid(TenantSupplierContractPolicySchema, {
      tenant_id: uuid, expected_version: 1,
      require_active_contract_for_new_order: true,
    }, false);
    expectValid(TenantSupplierUpdateSchema,
      { tenant_id: uuid, expected_version: 1, remark: "重点合作" }, false);
  });

  test("rejects unknown fields on child writes and platform settings", () => {
    expectValid(SupplierServiceRegionCreateSchema,
      { region_code: "411525", region_level: "district", unexpected: true },
      false);
    expectValid(SupplierAddressCreateSchema, {
      address_type: "shipping", region_code: "411525",
      address_detail: "蓼城大道 1 号", unexpected: true,
    }, false);
    expectValid(SupplierContactCreateSchema,
      { contact_type: "sales", name: "张三", unexpected: true }, false);
    expectValid(PlatformTenantSupplierSettingsCommandSchema, {
      module_enabled: true, require_active_contract_for_new_order: false,
      expected_version: 1, tenant_id: uuid,
    }, false);
  });
});

describe("supplier foundation command schemas", () => {
  test("coerces a positive integer expected_version and trims reason", () => {
    expect(
      SupplierCommandSchema.parse({
        expected_version: "2",
        reason: "  资料已核实  ",
      }),
    ).toEqual({ expected_version: 2, reason: "资料已核实" });

    for (const expectedVersion of [0, -1, 1.5, "not-a-number"]) {
      expectValid(SupplierCommandSchema, { expected_version: expectedVersion }, false);
    }
  });

  test("rejects non numeric expected_version inputs", () => {
    for (const expected_version of [true, [1], "", null]) {
      expectValid(SupplierCommandSchema, { expected_version }, false);
    }
    expect(SupplierCommandSchema.parse({ expected_version: " 3 " }))
      .toEqual({ expected_version: 3 });
  });

  test("requires nonblank reasons for reject, suspend, terminate, and blacklist", () => {
    const reasonRequiredSchemas = [
      SupplierRejectCommandSchema,
      SupplierQualificationRejectCommandSchema,
      SupplierSuspendCommandSchema,
      SupplierBlacklistCommandSchema,
      TenantSupplierSuspendCommandSchema,
      TenantSupplierTerminateCommandSchema,
      TenantSupplierBlacklistCommandSchema,
      SupplierContractTerminateCommandSchema,
    ] as const;

    for (const schema of reasonRequiredSchemas) {
      expectValid(schema, { expected_version: 1, reason: "   " }, false);
      expectValid(schema, { expected_version: 1, reason: "业务原因" }, true);
    }
  });
});

describe("supplier foundation domain fields", () => {
  test("validates qualification ISO dates and allows no expiry date", () => {
    const baseInput = {
      qualification_type_id: uuid,
      document_file_id: uuid,
      valid_from: "2026-07-01",
      valid_until: null,
    };

    expectValid(SupplierQualificationCreateSchema, baseInput, true);
    expectValid(SupplierQualificationCreateSchema,
      { ...baseInput, valid_from: "2026-02-30" }, false);
    expectValid(SupplierQualificationCreateSchema,
      { ...baseInput, valid_until: "2026-06-30" }, false);
  });

  test("validates contract ISO date order", () => {
    const baseInput = {
      contract_no: "HT-2026-001",
      name: "年度合作合同",
      valid_from: "2026-07-01",
      valid_until: "2027-06-30",
      settlement_term_days: 30,
      invoice_required_before_payment: true,
      document_file_id: uuid,
    };

    expect(SupplierContractCreateSchema.safeParse(baseInput).success).toBe(true);
    expect(
      SupplierContractCreateSchema.safeParse({
        ...baseInput,
        valid_until: "2026-06-30",
      }).success,
    ).toBe(false);
    expect(
      SupplierContractCreateSchema.safeParse({
        ...baseInput,
        valid_until: "2026-13-01",
      }).success,
    ).toBe(false);
  });

  test("validates uppercase currency and nonnegative safe credit limits", () => {
    const baseUpdate = {
      expected_version: 1,
      default_currency: "CNY",
      credit_limit_minor: "9007199254740991",
    };

    expect(TenantSupplierUpdateSchema.safeParse(baseUpdate).success).toBe(true);
    expect(
      TenantSupplierUpdateSchema.safeParse({
        ...baseUpdate,
        default_currency: "cny",
      }).success,
    ).toBe(false);
    expect(
      TenantSupplierUpdateSchema.safeParse({
        ...baseUpdate,
        credit_limit_minor: -1,
      }).success,
    ).toBe(false);
    expect(
      TenantSupplierUpdateSchema.safeParse({
        ...baseUpdate,
        credit_limit_minor: "9007199254740992",
      }).success,
    ).toBe(false);
  });

  test("only coerces explicit optional numeric values", () => {
    expect(TenantSupplierUpdateSchema.safeParse({
      expected_version: 1,
      settlement_term_days: "",
    }).success).toBe(false);
    for (const settlement_term_days of [false, null, [], {}]) {
      expect(TenantSupplierUpdateSchema.safeParse({
        expected_version: 1,
        settlement_term_days,
      }).success).toBe(false);
    }
    expect(TenantSupplierUpdateSchema.parse({
      expected_version: 1,
      settlement_term_days: "30",
    }).settlement_term_days).toBe(30);

    const addressInput = {
      address_type: "shipping",
      region_code: "411525",
      address_detail: "蓼城大道 1 号",
    };
    expect(SupplierAddressCreateSchema.parse({
      ...addressInput,
      longitude: "",
    }).longitude).toBeUndefined();
    expect(SupplierAddressCreateSchema.parse({
      ...addressInput,
      longitude: null,
    }).longitude).toBeNull();
    expect(SupplierAddressUpdateSchema.parse({
      expected_version: 1,
      latitude: null,
    }).latitude).toBeNull();
    expect(SupplierAddressUpdateSchema.parse({
      expected_version: 1,
      longitude: "113.5",
    }).longitude).toBe(113.5);
    for (const longitude of [false, []]) {
      expect(SupplierAddressCreateSchema.safeParse({
        ...addressInput,
        longitude,
      }).success).toBe(false);
    }
  });

  test("validates category level between 1 and 6", () => {
    const input = {
      parent_id: null,
      code: "material",
      name: "主材",
      level: 1,
    };

    expect(CatalogCategoryCreateSchema.safeParse(input).success).toBe(true);
    expect(
      CatalogCategoryCreateSchema.safeParse({ ...input, level: 0 }).success,
    ).toBe(false);
    expect(
      CatalogCategoryUpdateSchema.safeParse({
        expected_version: 1,
        level: 7,
      }).success,
    ).toBe(false);
  });

  test("validates positive unit factors and base-unit semantics", () => {
    const baseUnit = {
      code: "m",
      name: "米",
      symbol: "m",
      base_unit_id: null,
      conversion_factor: 1,
    };
    const derivedUnit = {
      code: "cm",
      name: "厘米",
      symbol: "cm",
      base_unit_id: uuid,
      conversion_factor: 0.01,
    };

    expect(CatalogUnitCreateSchema.safeParse(baseUnit).success).toBe(true);
    expect(CatalogUnitCreateSchema.safeParse(derivedUnit).success).toBe(true);
    expect(
      CatalogUnitCreateSchema.safeParse({
        ...baseUnit,
        conversion_factor: 2,
      }).success,
    ).toBe(false);
    expect(
      CatalogUnitCreateSchema.safeParse({
        ...derivedUnit,
        conversion_factor: 0,
      }).success,
    ).toBe(false);
    expect(
      CatalogUnitUpdateSchema.safeParse({
        expected_version: 1,
        base_unit_id: null,
        conversion_factor: 2,
      }).success,
    ).toBe(false);
  });

  test("rejects unsafe catalog numeric coercion and numeric(18,6) overflow", () => {
    expect(CatalogCategoryCreateSchema.safeParse({
      parent_id: null,
      code: "material",
      name: "主材",
      level: true,
    }).success).toBe(false);
    for (const conversion_factor of [true, 0.0000001, 1.1234567, 1e12]) {
      expect(CatalogUnitCreateSchema.safeParse({
        code: "box",
        name: "箱",
        symbol: "箱",
        base_unit_id: uuid,
        conversion_factor,
      }).success).toBe(false);
    }
    for (const exact of ["999999999999.123456", "123456789012.123456"]) {
      const parsed: string = CatalogUnitCreateSchema.parse({
        code: "box", name: "箱", symbol: "箱",
        base_unit_id: uuid, conversion_factor: exact,
      }).conversion_factor;
      expect(parsed).toBe(exact);
    }
    for (const conversion_factor of [
      "1.1234567", 999999999999.123456, 123456789012.123456,
    ]) {
      expect(CatalogUnitCreateSchema.safeParse({
        code: "box", name: "箱", symbol: "箱",
        base_unit_id: uuid, conversion_factor,
      }).success).toBe(false);
    }
  });
});
