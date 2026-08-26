import { describe, expect, mock, test } from "bun:test";

import { Errors } from "@/errors/error-factory";
import type { SupplierPurchasableProductCreatedResult } from "@/repositories/supplier-purchasable-product-records";
import type { SupplierPurchasableProductCreateInput } from "@/schema/supplier-purchasable-products";
import type { AuthContext } from "@/services/authorization";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

const PRODUCT_ID = "10000000-0000-4000-8000-000000000001";
const SKU_ID = "20000000-0000-4000-8000-000000000002";
const TENANT_ID = "30000000-0000-4000-8000-000000000003";
const TENANT_SUPPLIER_ID = "40000000-0000-4000-8000-000000000004";
const SUPPLIER_ID = "50000000-0000-4000-8000-000000000005";
const FOREIGN_SUPPLIER_ID = "50000000-0000-4000-8000-000000000099";
const USER_ID = "60000000-0000-4000-8000-000000000006";
const EMPLOYEE_ID = "70000000-0000-4000-8000-000000000007";
const CATEGORY_ID = "80000000-0000-4000-8000-000000000008";
const BRAND_ID = "90000000-0000-4000-8000-000000000009";
const UNIT_ID = "a0000000-0000-4000-8000-00000000000a";
const MIXED_PRODUCT_ID = "abcdefab-cdef-4abc-8def-abcdefabcdef";
const MIXED_SKU_ID = "fedcbafe-dcba-4fed-8cba-fedcbafedcba";
const MIXED_TENANT_ID = "abcdefab-cdef-4abc-8def-abcdefabcded";
const MIXED_TENANT_SUPPLIER_ID = "abcdefab-cdef-4abc-8def-abcdefabcdec";
const MIXED_SUPPLIER_ID = "abcdefab-cdef-4abc-8def-abcdefabcdeb";
const MIXED_USER_ID = "abcdefab-cdef-4abc-8def-abcdefabcdea";
const MIXED_EMPLOYEE_ID = "abcdefab-cdef-4abc-8def-abcdefabcde9";

const input: SupplierPurchasableProductCreateInput = {
  sku_id: SKU_ID,
  product: {
    name: "耐水腻子粉",
    category_id: CATEGORY_ID,
    brand_id: BRAND_ID,
  },
  sku: {
    name: "20kg/袋",
    purchase_unit_id: UNIT_ID,
    spec_values: { weight: "20kg" },
  },
  price: {
    unit_price: "48.00",
    tax_rate: "0.130000",
    tax_inclusive: true,
  },
};

const auth: AuthContext = {
  authUserId: "client-user-must-not-be-read-directly",
  employeeId: "client-employee-must-not-be-read-directly",
  tenantId: "client-tenant-must-not-be-read-directly",
  tenantName: "测试租户",
  tenantSlug: "test",
  tenantStatus: "active",
  isPlatformAdmin: false,
  employeeName: "采购员",
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
  permissions: [],
};

const scope = {
  tenantId: TENANT_ID,
  tenantSupplierId: TENANT_SUPPLIER_ID,
  supplierId: SUPPLIER_ID,
  authUserId: USER_ID,
  employeeId: EMPLOYEE_ID,
};

const replay = {
  status: "created" as const,
  idempotent: true,
  product: { id: PRODUCT_ID },
  sku: { id: SKU_ID },
  price: { unit_price: "48.00", tax_rate: "0.130000" },
  catalog_item: { supplier_sku_id: SKU_ID },
} as unknown as SupplierPurchasableProductCreatedResult;

async function setup(options: {
  accessResult?: typeof scope;
  accessError?: unknown;
  repositoryResult?: unknown;
  idFactoryResult?: string;
  idFactory?: () => string;
} = {}) {
  const access = {
    requirePurchasableProductWrite: mock(async () => {
      if (options.accessError) throw options.accessError;
      return options.accessResult ?? scope;
    }),
  };
  const repository = {
    create: mock(async () => options.repositoryResult ?? replay),
  };
  const idFactorySource = options.idFactory ??
    (() => options.idFactoryResult ?? PRODUCT_ID);
  const idFactory = mock(() => idFactorySource());
  const { SupplierPurchasableProductsService } = await import(
    "./supplier-purchasable-products"
  );
  return {
    access,
    repository,
    idFactory,
    service: new SupplierPurchasableProductsService({
      access,
      repository,
      idFactory,
    } as never),
  };
}

describe("SupplierPurchasableProductsService", () => {
  test("does not call the repository when combined permission access is denied", async () => {
    const context = await setup({ accessError: Errors.forbidden() });

    await expect(context.service.create(
      auth,
      TENANT_SUPPLIER_ID,
      SUPPLIER_ID,
      input,
      "idem-key",
    )).rejects.toMatchObject({ code: "FORBIDDEN", statusCode: 403 });
    expect(context.access.requirePurchasableProductWrite)
      .toHaveBeenCalledWith(auth, TENANT_SUPPLIER_ID);
    expect(context.repository.create).not.toHaveBeenCalled();
    expect(context.idFactory).not.toHaveBeenCalled();
  });

  test("rejects a path supplier outside the authorized relationship scope", async () => {
    const context = await setup();

    await expect(context.service.create(
      auth,
      TENANT_SUPPLIER_ID,
      FOREIGN_SUPPLIER_ID,
      input,
      "idem-key",
    )).rejects.toMatchObject({
      code: "SUPPLIER_NOT_FOUND",
      statusCode: 404,
    });
    expect(context.repository.create).not.toHaveBeenCalled();
    expect(context.idFactory).not.toHaveBeenCalled();
  });

  test("maps an ID factory exception to a stable create failure", async () => {
    const context = await setup({
      idFactory: () => {
        throw new Error("secret-id-factory-diagnostic");
      },
    });
    let caught: unknown;

    try {
      await context.service.create(
        auth,
        TENANT_SUPPLIER_ID,
        SUPPLIER_ID,
        input,
        "factory-throws-key",
      );
    } catch (error) {
      caught = error;
    }

    expect(caught).toMatchObject({
      statusCode: 500,
      code: "SUPPLIER_PURCHASABLE_PRODUCT_CREATE_FAILED",
      message: "创建可采购商品失败",
    });
    expect(String(caught)).not.toContain("secret-id-factory-diagnostic");
    expect(context.idFactory).toHaveBeenCalledTimes(1);
    expect(context.repository.create).not.toHaveBeenCalled();
  });

  test("maps an invalid generated UUID to a stable create failure", async () => {
    const context = await setup({ idFactoryResult: "invalid-secret-uuid" });

    await expect(context.service.create(
      auth,
      TENANT_SUPPLIER_ID,
      SUPPLIER_ID,
      input,
      "invalid-uuid-key",
    )).rejects.toMatchObject({
      statusCode: 500,
      code: "SUPPLIER_PURCHASABLE_PRODUCT_CREATE_FAILED",
      message: "创建可采购商品失败",
    });
    expect(context.idFactory).toHaveBeenCalledTimes(1);
    expect(context.repository.create).not.toHaveBeenCalled();
  });

  test("generates one product UUID and authoritative codes while preserving decimals", async () => {
    const context = await setup();
    const untrustedInput = {
      ...input,
      tenant_id: "untrusted-tenant",
      supplier_id: "untrusted-supplier",
      actor_user_id: "untrusted-user",
      actor_employee_id: "untrusted-employee",
    } as SupplierPurchasableProductCreateInput;

    await context.service.create(
      auth,
      TENANT_SUPPLIER_ID,
      SUPPLIER_ID,
      untrustedInput,
      "idem-key",
    );

    expect(context.idFactory).toHaveBeenCalledTimes(1);
    expect(context.repository.create).toHaveBeenCalledTimes(1);
    expect(context.repository.create).toHaveBeenCalledWith({
      product_id: PRODUCT_ID,
      sku_id: SKU_ID,
      tenant_id: TENANT_ID,
      tenant_supplier_id: TENANT_SUPPLIER_ID,
      supplier_id: SUPPLIER_ID,
      product: {
        ...input.product,
        product_code: "TP-1000000000004000",
      },
      sku: {
        ...input.sku,
        sku_code: "TS-2000000000004000",
      },
      price: {
        unit_price: "48.00",
        tax_rate: "0.130000",
        tax_inclusive: true,
      },
      actor_user_id: USER_ID,
      actor_employee_id: EMPLOYEE_ID,
      idempotency_key: "idem-key",
    });
  });

  test("canonicalizes uppercase path, body, generated, and scope UUIDs", async () => {
    const uppercaseScope = {
      tenantId: MIXED_TENANT_ID.toUpperCase(),
      tenantSupplierId: MIXED_TENANT_SUPPLIER_ID.toUpperCase(),
      supplierId: MIXED_SUPPLIER_ID.toUpperCase(),
      authUserId: MIXED_USER_ID.toUpperCase(),
      employeeId: MIXED_EMPLOYEE_ID.toUpperCase(),
    };
    const context = await setup({
      accessResult: uppercaseScope,
      idFactoryResult: MIXED_PRODUCT_ID.toUpperCase(),
    });

    await context.service.create(
      auth,
      MIXED_TENANT_SUPPLIER_ID.toUpperCase(),
      MIXED_SUPPLIER_ID.toUpperCase(),
      {
        ...input,
        sku_id: MIXED_SKU_ID.toUpperCase(),
        product: {
          ...input.product,
          category_id: CATEGORY_ID.toUpperCase(),
          brand_id: BRAND_ID.toUpperCase(),
        },
        sku: {
          ...input.sku,
          purchase_unit_id: UNIT_ID.toUpperCase(),
        },
      },
      "uppercase-key",
    );

    expect(context.access.requirePurchasableProductWrite).toHaveBeenCalledWith(
      auth,
      MIXED_TENANT_SUPPLIER_ID,
    );
    expect(context.idFactory).toHaveBeenCalledTimes(1);
    expect(context.repository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        product_id: MIXED_PRODUCT_ID,
        sku_id: MIXED_SKU_ID,
        tenant_id: MIXED_TENANT_ID,
        tenant_supplier_id: MIXED_TENANT_SUPPLIER_ID,
        supplier_id: MIXED_SUPPLIER_ID,
        actor_user_id: MIXED_USER_ID,
        actor_employee_id: MIXED_EMPLOYEE_ID,
        product: expect.objectContaining({
          product_code: "TP-abcdefabcdef4abc",
          category_id: CATEGORY_ID,
          brand_id: BRAND_ID,
        }),
        sku: expect.objectContaining({
          sku_code: "TS-fedcbafedcba4fed",
          purchase_unit_id: UNIT_ID,
        }),
      }),
    );
  });

  test("returns a created replay unchanged", async () => {
    const context = await setup({ repositoryResult: replay });

    await expect(context.service.create(
      auth,
      TENANT_SUPPLIER_ID,
      SUPPLIER_ID,
      input,
      "idem-key",
    )).resolves.toBe(replay);
  });

  test("maps validation and state envelopes to stable business errors", async () => {
    const validation = await setup({
      repositoryResult: {
        status: "validation_error",
        idempotent: false,
        error_code: "SUPPLIER_PURCHASABLE_PRODUCT_CREATE_FAILED",
        reason: "invalid_price",
      },
    });
    const state = await setup({
      repositoryResult: {
        status: "state_conflict",
        idempotent: false,
        error_code: "SUPPLIER_PURCHASABLE_PRODUCT_CREATE_FAILED",
        reason: "SUPPLIER_PRICE_LIST_VERSION_CONFLICT",
      },
    });

    await expect(validation.service.create(
      auth,
      TENANT_SUPPLIER_ID,
      SUPPLIER_ID,
      input,
      "validation-key",
    )).rejects.toMatchObject({
      statusCode: 400,
      code: "SUPPLIER_PURCHASABLE_PRODUCT_CREATE_FAILED",
      message: "可采购商品参数校验失败",
    });
    await expect(state.service.create(
      auth,
      TENANT_SUPPLIER_ID,
      SUPPLIER_ID,
      input,
      "state-key",
    )).rejects.toMatchObject({
      statusCode: 409,
      code: "SUPPLIER_PRICE_LIST_VERSION_CONFLICT",
      message: "供应商价格簿版本已变化，请刷新后重试",
    });
  });

  test("preserves mapped actor and supplier state failures", async () => {
    const actor = await setup({
      repositoryResult: {
        status: "validation_error",
        idempotent: false,
        error_code: "SUPPLIER_PROXY_ACTOR_INVALID",
        reason: "actor_invalid",
      },
    });
    const supplier = await setup({
      repositoryResult: {
        status: "state_conflict",
        idempotent: false,
        error_code: "SUPPLIER_ORDER_NOT_ELIGIBLE",
        reason: "tenant_supplier_unavailable",
      },
    });

    await expect(actor.service.create(
      auth,
      TENANT_SUPPLIER_ID,
      SUPPLIER_ID,
      input,
      "actor-key",
    )).rejects.toMatchObject({
      statusCode: 403,
      code: "SUPPLIER_PROXY_ACTOR_INVALID",
      message: "供应商代录身份无效",
    });
    await expect(supplier.service.create(
      auth,
      TENANT_SUPPLIER_ID,
      SUPPLIER_ID,
      input,
      "supplier-key",
    )).rejects.toMatchObject({
      statusCode: 409,
      code: "SUPPLIER_ORDER_NOT_ELIGIBLE",
      message: "当前供应商关系不允许继续该操作",
    });
  });

  test("maps an ordered eligibility reason list to a stable 409", async () => {
    const context = await setup({
      repositoryResult: {
        status: "state_conflict",
        idempotent: false,
        error_code: "SUPPLIER_ORDER_NOT_ELIGIBLE",
        reason: "required_qualification_missing,active_contract_required",
      },
    });

    await expect(context.service.create(
      auth,
      TENANT_SUPPLIER_ID,
      SUPPLIER_ID,
      input,
      "eligibility-key",
    )).rejects.toMatchObject({
      statusCode: 409,
      code: "SUPPLIER_ORDER_NOT_ELIGIBLE",
      message: "当前供应商关系不允许继续该操作",
    });
  });
});
