import { beforeEach, describe, expect, mock, test } from "bun:test";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

const ORDER_ID = "63300000-0000-4000-8000-000000000001";
const auth = {
  tenantId: "63300000-0000-4000-8000-000000000002",
  authUserId: "63300000-0000-4000-8000-000000000003",
  employeeId: "63300000-0000-4000-8000-000000000004",
};
const getFinancialSummary = mock(async () => ({ purchase_order_id: ORDER_ID }));

mock.module("@/services/supplier-purchase-orders", () => ({
  supplierPurchaseOrdersService: new Proxy({ getFinancialSummary }, {
    get(target, property) {
      if (property in target) return Reflect.get(target, property);
      return mock(async () => ({}));
    },
  }),
}));
mock.module("@/services/supplier-purchase-fulfillments", () => ({
  supplierPurchaseFulfillmentsService: new Proxy({}, {
    get: () => mock(async () => ({})),
  }),
}));

async function controller() {
  const { default: value } = await import(".");
  Object.defineProperty(value, "getRequiredTenantContext", {
    configurable: true,
    value: mock(async () => auth),
  });
  return value;
}

describe("supplier purchase-order financial-summary route", () => {
  beforeEach(() => getFinancialSummary.mockClear());

  test("registers the GET route exactly once and passes auth plus parsed id", async () => {
    const value = await controller();
    const routes: Array<{ method: string; path: string }> = [];
    value.registerExtraRoutes({
      get: (path: string) => routes.push({ method: "GET", path }),
      post: (path: string) => routes.push({ method: "POST", path }),
    } as never);
    expect(routes.filter((route) =>
      route.path === "/supplier-purchase-orders/:id/financial-summary"
    )).toEqual([{
      method: "GET",
      path: "/supplier-purchase-orders/:id/financial-summary",
    }]);

    const handler = Reflect.get(value, "getFinancialSummary") as
      ((request: unknown) => Promise<unknown>) | undefined;
    expect(handler).toBeFunction();
    await handler?.call(value, { params: { id: ORDER_ID } });
    expect(getFinancialSummary).toHaveBeenCalledWith(auth, ORDER_ID);
  });

  test("rejects an invalid id before invoking the service", async () => {
    const value = await controller();
    const handler = Reflect.get(value, "getFinancialSummary") as
      ((request: unknown) => Promise<unknown>) | undefined;
    await expect(handler?.call(value, { params: { id: "bad" } }))
      .rejects.toMatchObject({ statusCode: 400 });
    expect(getFinancialSummary).not.toHaveBeenCalled();
  });
});
