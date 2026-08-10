import { beforeEach, describe, expect, mock, test } from "bun:test";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

const TENANT_ID = "10000000-0000-4000-8000-000000000001";
const NOW = "2026-08-10T08:00:00.000Z";

type TableName =
  | "tenants"
  | "tenant_service_contracts"
  | "tenant_service_orders"
  | "tenant_billing_subscriptions";

type QueryCall = {
  table: TableName;
  operation: string;
  args: unknown[];
};

const rowsByTable: Record<TableName, unknown[]> = {
  tenants: [{ status: "active" }],
  tenant_service_contracts: [],
  tenant_service_orders: [{ id: "order-1", paid_at: NOW }],
  tenant_billing_subscriptions: [{ status: "locked" }],
};
const errorsByTable: Partial<Record<TableName, unknown>> = {};
const fromCalls: TableName[] = [];
const queryCalls: QueryCall[] = [];

class TableQuery {
  constructor(private readonly table: TableName) {}

  select(columns: string) {
    return this.record("select", columns);
  }

  eq(column: string, value: unknown) {
    return this.record("eq", column, value);
  }

  in(column: string, values: readonly unknown[]) {
    return this.record("in", column, values);
  }

  not(column: string, operator: string, value: unknown) {
    return this.record("not", column, operator, value);
  }

  is(column: string, value: unknown) {
    return this.record("is", column, value);
  }

  lte(column: string, value: unknown) {
    return this.record("lte", column, value);
  }

  gt(column: string, value: unknown) {
    return this.record("gt", column, value);
  }

  order(column: string, options: unknown) {
    return this.record("order", column, options);
  }

  limit(value: number) {
    return this.record("limit", value);
  }

  then<TResult1 = { data: unknown; error: unknown }, TResult2 = never>(
    onfulfilled?: ((value: { data: unknown; error: unknown }) =>
      TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    return Promise.resolve({
      data: rowsByTable[this.table],
      error: errorsByTable[this.table] ?? null,
    }).then(onfulfilled, onrejected);
  }

  private record(operation: string, ...args: unknown[]) {
    queryCalls.push({ table: this.table, operation, args });
    return this;
  }
}

mock.module("@/utils/supabase/index", () => ({
  SupabaseDB: {
    getAdminClient: () => ({
      from: (table: TableName) => {
        fromCalls.push(table);
        return new TableQuery(table);
      },
    }),
  },
}));

describe("TenantServiceAccessRepository", () => {
  beforeEach(() => {
    rowsByTable.tenants = [{ status: "active" }];
    rowsByTable.tenant_service_contracts = [];
    rowsByTable.tenant_service_orders = [{ id: "order-1", paid_at: NOW }];
    rowsByTable.tenant_billing_subscriptions = [{ status: "locked" }];
    for (const table of Object.keys(errorsByTable) as TableName[]) {
      delete errorsByTable[table];
    }
    fromCalls.length = 0;
    queryCalls.length = 0;
  });

  test("loads the four bounded tenant access facts without N+1 queries", async () => {
    const { TenantServiceAccessRepository } =
      await import("./tenant-service-access");
    const repository = new TenantServiceAccessRepository();

    const result = await repository.getAccessFacts({
      tenantId: TENANT_ID,
      now: new Date(NOW),
    });

    expect(result).toEqual({
      tenantStatus: "active",
      contract: null,
      paidOnboardingOrder: { id: "order-1", paid_at: NOW },
      legacySubscriptionStatus: "locked",
    });
    expect(fromCalls).toEqual([
      "tenants",
      "tenant_service_contracts",
      "tenant_service_orders",
      "tenant_billing_subscriptions",
    ]);

    for (const table of fromCalls) {
      expect(callsFor(table, "limit")).toEqual([[1]]);
      expect(callsFor(table, "eq")).toContainEqual([
        table === "tenants" ? "id" : "tenant_id",
        TENANT_ID,
      ]);
    }

    expect(callsFor("tenants", "select")).toEqual([["status"]]);
    expect(callsFor("tenant_service_contracts", "select")).toEqual([
      ["id,service_start_at,service_end_at"],
    ]);
    expect(callsFor("tenant_service_orders", "select")).toEqual([
      ["id,paid_at"],
    ]);
    expect(callsFor("tenant_billing_subscriptions", "select")).toEqual([
      ["status"],
    ]);
  });

  test("uses the effective contract and exact paid-onboarding boundaries", async () => {
    const contract = {
      id: "contract-1",
      service_start_at: "2026-08-01T00:00:00.000Z",
      service_end_at: "2027-08-01T00:00:00.000Z",
    };
    rowsByTable.tenant_service_contracts = [contract];

    const { TenantServiceAccessRepository } =
      await import("./tenant-service-access");
    const repository = new TenantServiceAccessRepository();
    const result = await repository.getAccessFacts({
      tenantId: TENANT_ID,
      now: new Date(NOW),
    });

    expect(result.contract).toEqual(contract);
    expect(callsFor("tenant_service_contracts", "eq")).toEqual([
      ["tenant_id", TENANT_ID],
      ["service_family", "platform_technical_service"],
      ["status", "active"],
    ]);
    expect(callsFor("tenant_service_contracts", "lte")).toEqual([
      ["service_start_at", NOW],
    ]);
    expect(callsFor("tenant_service_contracts", "gt")).toEqual([
      ["service_end_at", NOW],
    ]);
    expect(callsFor("tenant_service_orders", "in")).toEqual([[
      "payment_status",
      ["paid", "refund_reviewing", "refunding", "partially_refunded"],
    ]]);
    expect(callsFor("tenant_service_orders", "not")).toEqual([[
      "service_status",
      "in",
      "(accepted,active)",
    ]]);
    expect(callsFor("tenant_service_orders", "is")).toEqual([[
      "service_access_terminated_at",
      null,
    ]]);
    expect(callsFor("tenant_service_orders", "order")).toEqual([
      ["paid_at", { ascending: false }],
      ["id", { ascending: false }],
    ]);
  });

  test("wraps every access fact query error with Errors.dbError", async () => {
    errorsByTable.tenant_service_orders = { message: "query failed" };
    const { TenantServiceAccessRepository } =
      await import("./tenant-service-access");

    await expect(new TenantServiceAccessRepository().getAccessFacts({
      tenantId: TENANT_ID,
      now: new Date(NOW),
    })).rejects.toMatchObject({
      statusCode: 500,
      code: "DB_ERROR",
      message: "查询租户服务访问事实失败",
    });
  });
});

function callsFor(table: TableName, operation: string) {
  return queryCalls
    .filter((call) => call.table === table && call.operation === operation)
    .map((call) => call.args);
}
