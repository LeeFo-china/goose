import { describe, expect, mock, test } from "bun:test";

import type { AuthContext } from "@/services/authorization";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

const TENANT_ID = "63200000-0000-4000-8000-000000000001";
const ORDER_ID = "63200000-0000-4000-8000-000000000002";
const PROJECT_ID = "63200000-0000-4000-8000-000000000003";
const auth = {
  authUserId: "63200000-0000-4000-8000-000000000004",
  employeeId: "63200000-0000-4000-8000-000000000005",
  tenantId: TENANT_ID,
  permissions: [],
} as unknown as AuthContext;

function dependencies(order: { project_id: string } | null = {
  project_id: PROJECT_ID,
}) {
  const summary = { purchase_order_id: ORDER_ID };
  return {
    summary,
    access: {
      requireRead: mock(async () => ({
        tenantId: TENANT_ID,
        authUserId: auth.authUserId,
        employeeId: auth.employeeId,
      })),
      requireManage: mock(async () => ({})),
      getVisibleProjectIds: mock(async () => [PROJECT_ID]),
      assertProjectRead: mock(async () => undefined),
      assertProjectUpdate: mock(async () => undefined),
    },
    repository: {
      listOrders: mock(async () => ({})),
      findOrder: mock(async () => order),
      listItems: mock(async () => ({})),
      listCatalog: mock(async () => ({})),
      listProjectOptions: mock(async () => ({})),
      listSupplierOptions: mock(async () => ({})),
      saveDraft: mock(async () => ({})),
      submit: mock(async () => ({})),
      cancel: mock(async () => ({})),
      getFinancialSummary: mock(async () => summary),
    },
    tenantSuppliers: {
      assertCanCreatePurchaseOrderForTenant: mock(async () => undefined),
    },
  };
}

describe("SupplierPurchaseOrdersService financial summary", () => {
  test("checks read and project scope before loading the tenant summary", async () => {
    const deps = dependencies();
    const { SupplierPurchaseOrdersService } = await import(
      "./supplier-purchase-orders"
    );
    const service = new SupplierPurchaseOrdersService(deps as never) as
      unknown as {
        getFinancialSummary(auth: AuthContext, orderId: string): Promise<unknown>;
      };

    expect(await service.getFinancialSummary(auth, ORDER_ID)).toEqual(
      deps.summary,
    );
    expect(deps.access.requireRead).toHaveBeenCalledWith(auth);
    expect(deps.repository.findOrder).toHaveBeenCalledWith(TENANT_ID, ORDER_ID);
    expect(deps.access.assertProjectRead).toHaveBeenCalledWith(auth, PROJECT_ID);
    expect(deps.repository.getFinancialSummary).toHaveBeenCalledWith(
      TENANT_ID,
      ORDER_ID,
    );
  });

  test("preserves the purchase-order not-found contract and skips the RPC", async () => {
    const deps = dependencies(null);
    const { SupplierPurchaseOrdersService } = await import(
      "./supplier-purchase-orders"
    );
    const service = new SupplierPurchaseOrdersService(deps as never) as
      unknown as {
        getFinancialSummary(auth: AuthContext, orderId: string): Promise<unknown>;
      };

    await expect(service.getFinancialSummary(auth, ORDER_ID)).rejects
      .toMatchObject({
        statusCode: 404,
        code: "SUPPLIER_PURCHASE_ORDER_NOT_FOUND",
      });
    expect(deps.repository.getFinancialSummary).not.toHaveBeenCalled();
  });
});
