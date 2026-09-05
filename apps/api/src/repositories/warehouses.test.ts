import { describe, expect, test } from "bun:test";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

const TENANT_ID = "10000000-0000-4000-8000-000000000001";
const WAREHOUSE_ID = "20000000-0000-4000-8000-000000000001";
const USER_ID = "30000000-0000-4000-8000-000000000001";
const EMPLOYEE_ID = "40000000-0000-4000-8000-000000000001";

const warehouseRow = {
  id: WAREHOUSE_ID,
  tenant_id: TENANT_ID,
  warehouse_code: "WH-000001",
  name: "公司仓库",
  address: null,
  contact_name: null,
  contact_phone: null,
  manager_employee_id: null,
  is_default: true,
  status: "active",
  version: 1,
  created_at: "2026-09-05T00:00:00.000Z",
  updated_at: "2026-09-05T00:00:00.000Z",
} as const;
const warehouseRpcRow = {
  ...warehouseRow,
  created_by_employee_id: EMPLOYEE_ID,
  updated_by_employee_id: EMPLOYEE_ID,
};

type Call = { method: string; args: unknown[] };

function queryBuilder(rows: unknown[], count = rows.length, error: unknown = null) {
  const calls: Call[] = [];
  const response = { data: rows, error, count };
  const builder = {
    select: (...args: unknown[]) => {
      calls.push({ method: "select", args });
      return builder;
    },
    eq: (...args: unknown[]) => {
      calls.push({ method: "eq", args });
      return builder;
    },
    or: (...args: unknown[]) => {
      calls.push({ method: "or", args });
      return builder;
    },
    order: (...args: unknown[]) => {
      calls.push({ method: "order", args });
      return builder;
    },
    range: (...args: unknown[]) => {
      calls.push({ method: "range", args });
      return builder;
    },
    maybeSingle: async () => ({
      data: rows[0] ?? null,
      error,
    }),
    then: Promise.resolve(response).then.bind(Promise.resolve(response)),
    calls,
  };
  return builder;
}

function repositoryWith(builder: ReturnType<typeof queryBuilder>) {
  return import("./warehouses").then(({ WarehousesRepository }) =>
    new WarehousesRepository({
      from: () => builder,
      rpc: async () => ({ data: warehouseRow, error: null }),
    } as never)
  );
}

describe("WarehousesRepository", () => {
  test("lists tenant warehouses with bounded pagination and keyword filter", async () => {
    const builder = queryBuilder([warehouseRow], 28);
    const repository = await repositoryWith(builder);

    const result = await repository.list({
      tenant_id: TENANT_ID,
      page: 1,
      pageSize: 20,
      keyword: ' 公司%仓库_" ',
      status: "active",
    });

    expect(result.pagination).toEqual({
      page: 1,
      pageSize: 20,
      total: 28,
      totalPages: 2,
    });
    expect(result.list[0]?.warehouse_code).toBe("WH-000001");
    expect(builder.calls).toContainEqual({
      method: "eq",
      args: ["tenant_id", TENANT_ID],
    });
    expect(builder.calls).toContainEqual({
      method: "eq",
      args: ["status", "active"],
    });
    expect(builder.calls).toContainEqual({
      method: "order",
      args: ["updated_at", { ascending: false }],
    });
    expect(builder.calls).toContainEqual({
      method: "order",
      args: ["id", { ascending: false }],
    });
    expect(builder.calls).toContainEqual({
      method: "range",
      args: [0, 19],
    });
    expect(builder.calls).toContainEqual({
      method: "select",
      args: [expect.not.stringContaining("*"), { count: "exact" }],
    });
    expect(builder.calls).toContainEqual({
      method: "or",
      args: [
        'warehouse_code.ilike."%公司\\\\%仓库\\\\_\\"%",' +
        'name.ilike."%公司\\\\%仓库\\\\_\\"%",' +
        'contact_name.ilike."%公司\\\\%仓库\\\\_\\"%",' +
        'contact_phone.ilike."%公司\\\\%仓库\\\\_\\"%"',
      ],
    });
  });

  test("caps page size at 100 and wraps malformed rows", async () => {
    const builder = queryBuilder([{ ...warehouseRow, status: "archived" }], 1);
    const repository = await repositoryWith(builder);

    await expect(repository.list({
      tenant_id: TENANT_ID,
      page: 1,
      pageSize: 200,
    })).rejects.toMatchObject({
      statusCode: 500,
      message: "查询仓库失败",
    });
    expect(builder.calls).toContainEqual({
      method: "range",
      args: [0, 99],
    });
  });

  test("finds one warehouse inside tenant scope", async () => {
    const builder = queryBuilder([warehouseRow]);
    const repository = await repositoryWith(builder);

    const result = await repository.findById(TENANT_ID, WAREHOUSE_ID);

    expect(result?.id).toBe(WAREHOUSE_ID);
    expect(builder.calls).toContainEqual({
      method: "eq",
      args: ["tenant_id", TENANT_ID],
    });
    expect(builder.calls).toContainEqual({
      method: "eq",
      args: ["id", WAREHOUSE_ID],
    });
  });

  test("creates and updates through warehouse RPCs with explicit nullable field markers", async () => {
    const calls: Call[] = [];
    const { WarehousesRepository } = await import("./warehouses");
    const repository = new WarehousesRepository({
      from: () => queryBuilder([]),
      rpc: async (...args: unknown[]) => {
        calls.push({ method: "rpc", args });
        return { data: warehouseRpcRow, error: null };
      },
    } as never);

    await repository.create({
      warehouse_id: WAREHOUSE_ID,
      tenant_id: TENANT_ID,
      name: "公司仓库",
      address: null,
      contact_name: null,
      contact_phone: null,
      manager_employee_id: null,
      is_default: true,
      actor_user_id: USER_ID,
      actor_employee_id: EMPLOYEE_ID,
      idempotency_key: "create-key",
    });
    const updateResult = await repository.update({
      warehouse_id: WAREHOUSE_ID,
      tenant_id: TENANT_ID,
      expected_version: 1,
      address: null,
      contact_phone: undefined,
      contact_name: "仓管",
      actor_user_id: USER_ID,
      actor_employee_id: EMPLOYEE_ID,
      idempotency_key: "update-key",
    });

    expect(updateResult).toEqual(warehouseRow);
    expect(JSON.stringify(updateResult)).not.toContain("created_by_employee_id");
    expect(calls).toContainEqual({
      method: "rpc",
      args: ["create_tenant_warehouse", expect.any(Object)],
    });
    expect(calls).toContainEqual({
      method: "rpc",
      args: ["update_tenant_warehouse", expect.objectContaining({
        p_address: null,
        p_address_set: true,
        p_contact_name: "仓管",
        p_contact_name_set: true,
        p_contact_phone: null,
        p_contact_phone_set: false,
        p_manager_employee_id: null,
        p_manager_employee_id_set: false,
      })],
    });
  });
});
