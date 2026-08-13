import { describe, expect, test } from "bun:test";

import {
  ALLOCATION_ID,
  EMPLOYEE_ID,
  SUPPLIER_ID,
  TENANT_ID,
  USER_ID,
  createRepository,
  privateRelationship,
  relationship,
} from "./tenant-suppliers-test-support";

describe("TenantSuppliersRepository private supplier commands", () => {
  test("allocates an internal code through the strict RPC envelope", async () => {
    const { repository, requests } = await createRepository(() => ({
      body: {
        allocation_id: ALLOCATION_ID,
        code: "SUP-000001",
        idempotent: false,
      },
    }));

    const result = await repository.allocateInternalCode({
      tenant_id: TENANT_ID,
      actor_user_id: USER_ID,
      actor_employee_id: EMPLOYEE_ID,
      idempotency_key: "allocate-code-1",
    });

    expect(result).toEqual({
      allocation_id: ALLOCATION_ID,
      code: "SUP-000001",
      idempotent: false,
    });
    expect(requests[0]!.url).toContain("/rpc/allocate_tenant_supplier_code");
    expect(await requests[0]!.clone().json()).toEqual({
      p_tenant_id: TENANT_ID,
      p_actor_user_id: USER_ID,
      p_actor_employee_id: EMPLOYEE_ID,
      p_idempotency_key: "allocate-code-1",
    });
  });

  test("creates a private supplier with every command parameter", async () => {
    const { repository, requests } = await createRepository(() => ({
      body: {
        status: "created",
        idempotent: false,
        tenant_supplier: privateRelationship,
        version: 1,
      },
    }));

    const result = await repository.createPrivateSupplier({
      tenant_id: TENANT_ID,
      name: "晴天私有建材",
      legal_name: "晴天私有建材有限公司",
      unified_social_credit_code: "91410000PRIVATE",
      supplier_type: "manufacturer",
      code_source: "generated",
      internal_supplier_code: "SUP-000001",
      allocation_id: ALLOCATION_ID,
      primary_contact: {
        name: "张三",
        phone: "13800000000",
        email: "zhangsan@example.com",
      },
      address: {
        province: "河南省",
        city: "郑州市",
        district: "金水区",
        region_code: "410105",
        address_detail: "测试路 1 号",
      },
      actor_user_id: USER_ID,
      actor_employee_id: EMPLOYEE_ID,
      idempotency_key: "create-private-1",
    });

    expect(result).toEqual(privateRelationship);
    expect(requests[0]!.url).toContain("/rpc/create_tenant_private_supplier");
    expect(await requests[0]!.clone().json()).toEqual({
      p_tenant_id: TENANT_ID,
      p_name: "晴天私有建材",
      p_legal_name: "晴天私有建材有限公司",
      p_unified_social_credit_code: "91410000PRIVATE",
      p_supplier_type: "manufacturer",
      p_code_source: "generated",
      p_internal_supplier_code: "SUP-000001",
      p_allocation_id: ALLOCATION_ID,
      p_primary_contact: {
        name: "张三",
        phone: "13800000000",
        email: "zhangsan@example.com",
      },
      p_address: {
        province: "河南省",
        city: "郑州市",
        district: "金水区",
        region_code: "410105",
        address_detail: "测试路 1 号",
      },
      p_actor_user_id: USER_ID,
      p_actor_employee_id: EMPLOYEE_ID,
      p_idempotency_key: "create-private-1",
    });
  });

  test("creates a platform relationship with explicit manual code parameters", async () => {
    const { repository, requests } = await createRepository(() => ({
      body: {
        status: "created",
        idempotent: false,
        tenant_supplier: relationship,
        version: 1,
      },
    }));

    const result = await repository.createSharedRelationship({
      tenant_id: TENANT_ID,
      supplier_id: SUPPLIER_ID,
      code_source: "manual",
      internal_supplier_code: "LOCAL-001",
      actor_user_id: USER_ID,
      actor_employee_id: EMPLOYEE_ID,
      idempotency_key: "create-shared-1",
    });

    expect(result).toEqual(relationship);
    expect(requests[0]!.url).toContain(
      "/rpc/create_tenant_shared_supplier_relationship",
    );
    expect(await requests[0]!.clone().json()).toEqual({
      p_tenant_id: TENANT_ID,
      p_supplier_id: SUPPLIER_ID,
      p_code_source: "manual",
      p_internal_supplier_code: "LOCAL-001",
      p_allocation_id: null,
      p_actor_user_id: USER_ID,
      p_actor_employee_id: EMPLOYEE_ID,
      p_idempotency_key: "create-shared-1",
    });
  });

  test("rejects malformed command envelopes instead of unchecked JSON", async () => {
    const { repository } = await createRepository(() => ({
      body: {
        allocation_id: ALLOCATION_ID,
        code: "SUP-000001",
        idempotent: false,
        unexpected: "unchecked",
      },
    }));

    await expect(repository.allocateInternalCode({
      tenant_id: TENANT_ID,
      actor_user_id: USER_ID,
      actor_employee_id: EMPLOYEE_ID,
      idempotency_key: "allocate-code-invalid",
    })).rejects.toMatchObject({ code: "DB_ERROR" });
  });

  test.each([
    ["SUPPLIER_CODE_ALLOCATION_CONFLICT", 409],
    ["SUPPLIER_CODE_CONFLICT", 409],
    ["SUPPLIER_IDEMPOTENCY_CONFLICT", 409],
    ["SUPPLIER_OWNERSHIP_CONFLICT", 409],
    ["SUPPLIER_MODULE_DISABLED", 409],
    ["TENANT_SUPPLIER_STATE_CONFLICT", 409],
  ])("maps database business error %s", async (businessCode, statusCode) => {
    const { repository } = await createRepository(() => ({
      body: { code: "P0001", details: null, hint: null, message: businessCode },
      status: 400,
    }));

    await expect(repository.allocateInternalCode({
      tenant_id: TENANT_ID,
      actor_user_id: USER_ID,
      actor_employee_id: EMPLOYEE_ID,
      idempotency_key: `error-${businessCode}`,
    })).rejects.toMatchObject({ code: businessCode, statusCode });
  });
});
