import { describe, expect, mock, test } from "bun:test";

import type { AuthContext } from "@/services/authorization";
import type { SupplierPurchaseFulfillmentsService } from "./supplier-purchase-fulfillments";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

const TENANT_ID = "63000000-0000-4000-8000-000000000001";
const ORDER_ID = "63000000-0000-4000-8000-000000000002";
const PROJECT_ID = "63000000-0000-4000-8000-000000000003";
const USER_ID = "63000000-0000-4000-8000-000000000004";
const EMPLOYEE_ID = "63000000-0000-4000-8000-000000000005";
const SHIPMENT_ID = "63000000-0000-4000-8000-000000000006";
const RECEIPT_ID = "63000000-0000-4000-8000-000000000007";
const ITEM_ID = "63000000-0000-4000-8000-000000000008";

const auth = {
  authUserId: USER_ID,
  employeeId: EMPLOYEE_ID,
  tenantId: TENANT_ID,
  permissions: [],
} as unknown as AuthContext;

function dependencies(options: { orderExists?: boolean } = {}) {
  const calls: string[] = [];
  const scope = {
    tenantId: TENANT_ID,
    authUserId: USER_ID,
    employeeId: EMPLOYEE_ID,
  };
  const order = options.orderExists === false
    ? null
    : {
      id: ORDER_ID,
      tenant_id: TENANT_ID,
      project_id: PROJECT_ID,
    };
  return {
    calls,
    access: {
      requireRead: mock(async () => {
        calls.push("requireRead");
        return scope;
      }),
      requireManage: mock(async () => {
        calls.push("requireManage");
        return scope;
      }),
      assertProjectRead: mock(async () => {
        calls.push("assertProjectRead");
      }),
      assertProjectUpdate: mock(async () => {
        calls.push("assertProjectUpdate");
      }),
    },
    orders: {
      findOrder: mock(async () => {
        calls.push("findOrder");
        return order;
      }),
    },
    fulfillment: {
      getDetail: mock(async (input: unknown) => {
        calls.push("getDetail");
        return { input };
      }),
      listShipments: mock(async (input: unknown) => {
        calls.push("listShipments");
        return { input };
      }),
      listReceipts: mock(async (input: unknown) => {
        calls.push("listReceipts");
        return { input };
      }),
      confirm: mock(async (input: unknown) => {
        calls.push("confirm");
        return { input };
      }),
      createShipment: mock(async (input: unknown) => {
        calls.push("createShipment");
        return { input };
      }),
      createReceipt: mock(async (input: unknown) => {
        calls.push("createReceipt");
        return { input };
      }),
    },
  };
}

async function serviceFor(
  deps: ReturnType<typeof dependencies>,
) {
  const { SupplierPurchaseFulfillmentsService } = await import(
    "./supplier-purchase-fulfillments"
  );
  return new SupplierPurchaseFulfillmentsService(deps as never);
}

describe("SupplierPurchaseFulfillmentsService", () => {
  test("authorizes tenant and project before every fulfillment read", async () => {
    const deps = dependencies();
    const service = await serviceFor(deps);

    await service.getDetail(auth, ORDER_ID);
    expect(deps.calls).toEqual([
      "requireRead",
      "findOrder",
      "assertProjectRead",
      "getDetail",
    ]);
    expect(deps.orders.findOrder).toHaveBeenLastCalledWith(
      TENANT_ID,
      ORDER_ID,
    );
    expect(deps.access.assertProjectRead).toHaveBeenLastCalledWith(
      auth,
      PROJECT_ID,
    );
    expect(deps.fulfillment.getDetail).toHaveBeenCalledWith({
      tenant_id: TENANT_ID,
      order_id: ORDER_ID,
    });

    deps.calls.length = 0;
    await service.listShipments(auth, ORDER_ID, {
      page: 2,
      pageSize: 10,
    });
    expect(deps.calls).toEqual([
      "requireRead",
      "findOrder",
      "assertProjectRead",
      "listShipments",
    ]);
    expect(deps.fulfillment.listShipments).toHaveBeenCalledWith({
      tenant_id: TENANT_ID,
      order_id: ORDER_ID,
      page: 2,
      pageSize: 10,
    });

    deps.calls.length = 0;
    await service.listReceipts(auth, ORDER_ID, {
      page: 3,
      pageSize: 20,
    });
    expect(deps.calls).toEqual([
      "requireRead",
      "findOrder",
      "assertProjectRead",
      "listReceipts",
    ]);
    expect(deps.fulfillment.listReceipts).toHaveBeenCalledWith({
      tenant_id: TENANT_ID,
      order_id: ORDER_ID,
      page: 3,
      pageSize: 20,
    });
  });

  test("authorizes tenant and project before forwarding every command", async () => {
    const deps = dependencies();
    const service = await serviceFor(deps);

    await service.confirm(auth, ORDER_ID, {
      expected_version: 2,
      confirmed_at: "2026-07-30T02:00:00.000Z",
      remark: "供应商已确认",
    }, "fulfillment:confirm");
    expect(deps.calls).toEqual([
      "requireManage",
      "findOrder",
      "assertProjectUpdate",
      "confirm",
    ]);
    expect(deps.fulfillment.confirm).toHaveBeenCalledWith({
      tenant_id: TENANT_ID,
      order_id: ORDER_ID,
      expected_version: 2,
      confirmed_at: "2026-07-30T02:00:00.000Z",
      remark: "供应商已确认",
      actor_user_id: USER_ID,
      actor_employee_id: EMPLOYEE_ID,
      idempotency_key: "fulfillment:confirm",
    });

    deps.calls.length = 0;
    await service.createShipment(auth, ORDER_ID, {
      id: SHIPMENT_ID,
      expected_fulfillment_version: 1,
      shipment_no: "SHIP-001",
      shipped_at: "2026-07-30T03:00:00.000Z",
      items: [{ purchase_order_item_id: ITEM_ID, quantity: 6 }],
    }, "fulfillment:shipment");
    expect(deps.calls).toEqual([
      "requireManage",
      "findOrder",
      "assertProjectUpdate",
      "createShipment",
    ]);
    expect(deps.fulfillment.createShipment).toHaveBeenCalledWith({
      tenant_id: TENANT_ID,
      order_id: ORDER_ID,
      id: SHIPMENT_ID,
      expected_fulfillment_version: 1,
      shipment_no: "SHIP-001",
      shipped_at: "2026-07-30T03:00:00.000Z",
      items: [{ purchase_order_item_id: ITEM_ID, quantity: 6 }],
      actor_user_id: USER_ID,
      actor_employee_id: EMPLOYEE_ID,
      idempotency_key: "fulfillment:shipment",
    });

    deps.calls.length = 0;
    await service.createReceipt(auth, ORDER_ID, {
      id: RECEIPT_ID,
      expected_fulfillment_version: 2,
      receipt_no: "RCV-001",
      received_at: "2026-07-30T04:00:00.000Z",
      items: [{
        purchase_order_item_id: ITEM_ID,
        accepted_quantity: 5,
        rejected_quantity: 1,
        variance_reason: "破损",
      }],
    }, "fulfillment:receipt");
    expect(deps.calls).toEqual([
      "requireManage",
      "findOrder",
      "assertProjectUpdate",
      "createReceipt",
    ]);
    expect(deps.fulfillment.createReceipt).toHaveBeenCalledWith({
      tenant_id: TENANT_ID,
      order_id: ORDER_ID,
      id: RECEIPT_ID,
      expected_fulfillment_version: 2,
      receipt_no: "RCV-001",
      received_at: "2026-07-30T04:00:00.000Z",
      items: [{
        purchase_order_item_id: ITEM_ID,
        accepted_quantity: 5,
        rejected_quantity: 1,
        variance_reason: "破损",
      }],
      actor_user_id: USER_ID,
      actor_employee_id: EMPLOYEE_ID,
      idempotency_key: "fulfillment:receipt",
    });
  });

  test.each([
    ["getDetail", (service: SupplierPurchaseFulfillmentsService) =>
      service.getDetail(auth, ORDER_ID)],
    ["listShipments", (service: SupplierPurchaseFulfillmentsService) =>
      service.listShipments(auth, ORDER_ID, { page: 1, pageSize: 20 })],
    ["listReceipts", (service: SupplierPurchaseFulfillmentsService) =>
      service.listReceipts(auth, ORDER_ID, { page: 1, pageSize: 20 })],
  ] as const)("returns stable not-found before project and %s repository reads", async (
    repositoryMethod,
    invoke,
  ) => {
    const deps = dependencies({ orderExists: false });
    const service = await serviceFor(deps);

    await expect(invoke(service)).rejects.toMatchObject({
      statusCode: 404,
      code: "SUPPLIER_PURCHASE_ORDER_NOT_FOUND",
    });
    expect(deps.calls).toEqual(["requireRead", "findOrder"]);
    expect(deps.access.assertProjectRead).not.toHaveBeenCalled();
    expect(deps.fulfillment[repositoryMethod]).not.toHaveBeenCalled();
  });

  test.each([
    ["confirm", (service: SupplierPurchaseFulfillmentsService) =>
      service.confirm(auth, ORDER_ID, {
        expected_version: 2,
        confirmed_at: "2026-07-30T02:00:00.000Z",
      }, "fulfillment:key")],
    ["createShipment", (service: SupplierPurchaseFulfillmentsService) =>
      service.createShipment(auth, ORDER_ID, {
        id: SHIPMENT_ID,
        expected_fulfillment_version: 1,
        shipment_no: "SHIP-001",
        shipped_at: "2026-07-30T03:00:00.000Z",
        items: [{ purchase_order_item_id: ITEM_ID, quantity: 6 }],
      }, "fulfillment:key")],
    ["createReceipt", (service: SupplierPurchaseFulfillmentsService) =>
      service.createReceipt(auth, ORDER_ID, {
        id: RECEIPT_ID,
        expected_fulfillment_version: 2,
        receipt_no: "RCV-001",
        received_at: "2026-07-30T04:00:00.000Z",
        items: [{
          purchase_order_item_id: ITEM_ID,
          accepted_quantity: 5,
          rejected_quantity: 1,
          variance_reason: "破损",
        }],
      }, "fulfillment:key")],
  ] as const)("returns stable not-found before project and %s repository commands", async (
    repositoryMethod,
    invoke,
  ) => {
    const deps = dependencies({ orderExists: false });
    const service = await serviceFor(deps);

    await expect(invoke(service)).rejects.toMatchObject({
      statusCode: 404,
      code: "SUPPLIER_PURCHASE_ORDER_NOT_FOUND",
    });
    expect(deps.calls).toEqual(["requireManage", "findOrder"]);
    expect(deps.access.assertProjectUpdate).not.toHaveBeenCalled();
    expect(deps.fulfillment[repositoryMethod]).not.toHaveBeenCalled();
  });
});
