import { describe, expect, test } from "bun:test";
import { createClient } from "@supabase/supabase-js";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

const TENANT_ID = "60000000-0000-4000-8000-000000000001";
const ORDER_ID = "60000000-0000-4000-8000-000000000002";
const FULFILLMENT_ID = "60000000-0000-4000-8000-000000000003";
const ITEM_ID = "60000000-0000-4000-8000-000000000004";
const SHIPMENT_ID = "60000000-0000-4000-8000-000000000005";
const RECEIPT_ID = "60000000-0000-4000-8000-000000000006";
const USER_ID = "60000000-0000-4000-8000-000000000007";
const EMPLOYEE_ID = "60000000-0000-4000-8000-000000000008";
const PROJECT_ID = "60000000-0000-4000-8000-000000000009";
const RELATIONSHIP_ID = "60000000-0000-4000-8000-000000000010";
const SUPPLIER_ID = "60000000-0000-4000-8000-000000000011";

async function repositoryFor(
  responder: (
    request: Request,
    index: number,
  ) => { body: unknown; count?: number; status?: number },
) {
  const requests: Request[] = [];
  const fetchStub = (async (
    input: string | URL | Request,
    init?: RequestInit,
  ) => {
    const request = input instanceof Request
      ? input
      : new Request(input.toString(), init);
    const index = requests.push(request) - 1;
    const response = responder(request, index);
    return new Response(JSON.stringify(response.body), {
      status: response.status ?? 200,
      headers: {
        "content-type": "application/json",
        ...(response.count === undefined
          ? {}
          : { "content-range": `0-0/${response.count}` }),
      },
    });
  }) as typeof fetch;
  const client = createClient("http://127.0.0.1:54321", "test-key", {
    global: { fetch: fetchStub },
  });
  const { SupplierPurchaseFulfillmentsRepository } = await import(
    "./supplier-purchase-fulfillments"
  );
  return {
    repository: new SupplierPurchaseFulfillmentsRepository(
      () => client as never,
    ),
    requests,
  };
}

describe("SupplierPurchaseFulfillmentsRepository", () => {
  test("loads the tenant fulfillment header and cumulative lines in parallel", async () => {
    const { repository, requests } = await repositoryFor((request) =>
      new URL(request.url).pathname.endsWith(
          "/supplier_purchase_order_fulfillments",
        )
        ? { body: fulfillment }
        : { body: [itemFulfillment] }
    );

    expect(await repository.getDetail({
      tenant_id: TENANT_ID,
      order_id: ORDER_ID,
    })).toEqual({
      fulfillment,
      item_fulfillments: [itemFulfillment],
    });
    expect(requests).toHaveLength(2);
    for (const request of requests) {
      const url = new URL(request.url);
      expect(url.searchParams.get("tenant_id")).toBe(`eq.${TENANT_ID}`);
      expect(url.searchParams.get("supplier_purchase_order_id")).toBe(
        `eq.${ORDER_ID}`,
      );
      expect(url.searchParams.get("select")).not.toContain("*");
    }
    const headerRequest = requests.find((request) =>
      new URL(request.url).pathname.endsWith(
        "/supplier_purchase_order_fulfillments",
      )
    )!;
    const itemRequest = requests.find((request) =>
      new URL(request.url).pathname.endsWith(
        "/supplier_purchase_order_item_fulfillments",
      )
    )!;
    expect(new URL(headerRequest.url).searchParams.get("select")).toContain(
      "confirmed_by_employee_id",
    );
    expect(new URL(itemRequest.url).searchParams.get("select")).toContain(
      "accepted_total_amount::text",
    );
    expect(new URL(itemRequest.url).searchParams.get("limit")).toBe("100");
  });

  test("returns an empty detail for an unconfirmed order", async () => {
    const { repository } = await repositoryFor((request) =>
      new URL(request.url).pathname.endsWith(
          "/supplier_purchase_order_fulfillments",
        )
        ? { body: null }
        : { body: [] }
    );

    expect(await repository.getDetail({
      tenant_id: TENANT_ID,
      order_id: ORDER_ID,
    })).toEqual({ fulfillment: null, item_fulfillments: [] });
  });

  test("paginates shipment and receipt events with stable ordering", async () => {
    const { repository, requests } = await repositoryFor((_request, index) =>
      index === 0
        ? { body: [shipment], count: 101 }
        : { body: [receipt], count: 21 }
    );

    const shipments = await repository.listShipments({
      tenant_id: TENANT_ID,
      order_id: ORDER_ID,
      page: 0,
      pageSize: 200,
    });
    const receipts = await repository.listReceipts({
      tenant_id: TENANT_ID,
      order_id: ORDER_ID,
      page: 2,
      pageSize: 20,
    });

    expect(shipments.pagination).toEqual({
      page: 1,
      pageSize: 100,
      total: 101,
      totalPages: 2,
    });
    expect(receipts.pagination).toEqual({
      page: 2,
      pageSize: 20,
      total: 21,
      totalPages: 2,
    });
    const shipmentUrl = new URL(requests[0]!.url);
    expect(shipmentUrl.searchParams.get("offset")).toBe("0");
    expect(shipmentUrl.searchParams.get("limit")).toBe("100");
    expect(shipmentUrl.searchParams.get("order")).toBe(
      "shipped_at.desc,id.desc",
    );
    expect(shipmentUrl.searchParams.get("select")).toContain(
      "items:supplier_purchase_order_shipment_items",
    );
    const receiptUrl = new URL(requests[1]!.url);
    expect(receiptUrl.searchParams.get("offset")).toBe("20");
    expect(receiptUrl.searchParams.get("limit")).toBe("20");
    expect(receiptUrl.searchParams.get("order")).toBe(
      "received_at.desc,id.desc",
    );
    for (const request of requests) {
      const url = new URL(request.url);
      expect(url.searchParams.get("tenant_id")).toBe(`eq.${TENANT_ID}`);
      expect(url.searchParams.get("supplier_purchase_order_id")).toBe(
        `eq.${ORDER_ID}`,
      );
      expect(request.headers.get("prefer")).toContain("count=exact");
    }
  });

  test.each([
    ["listShipments", null],
    ["listShipments", [{ ...shipment, extra: true }]],
    ["listReceipts", null],
    ["listReceipts", [{ ...receipt, extra: true }]],
  ] as const)("strictly rejects malformed %s data", async (method, body) => {
    const { repository } = await repositoryFor(() => ({ body, count: 0 }));

    await expect(repository[method]({
      tenant_id: TENANT_ID,
      order_id: ORDER_ID,
      page: 1,
      pageSize: 20,
    })).rejects.toMatchObject({ statusCode: 500, code: "DB_ERROR" });
  });

  test("uses every SQL p-parameter for fulfillment commands", async () => {
    const statuses = [
      "confirmed",
      "shipment_created",
      "receipt_created",
    ] as const;
    const { repository, requests } = await repositoryFor((_request, index) => ({
      body: commandResult(statuses[index]!, index + 1),
    }));
    await repository.confirm(confirmCommand);
    await repository.createShipment(shipmentCommand);
    await repository.createReceipt(receiptCommand);

    expect(requests.map((request) => new URL(request.url).pathname)).toEqual([
      "/rest/v1/rpc/confirm_supplier_purchase_order_fulfillment",
      "/rest/v1/rpc/create_supplier_purchase_order_shipment",
      "/rest/v1/rpc/create_supplier_purchase_order_receipt",
    ]);
    expect(await requests[0]!.clone().json()).toEqual({
      p_order_id: ORDER_ID,
      p_tenant_id: TENANT_ID,
      p_expected_order_version: 2,
      p_confirmed_at: "2026-07-30T02:00:00.000Z",
      p_remark: null,
      p_actor_user_id: USER_ID,
      p_actor_employee_id: EMPLOYEE_ID,
      p_idempotency_key: "fulfillment:command",
    });
    expect(await requests[1]!.clone().json()).toEqual({
      p_shipment_id: SHIPMENT_ID,
      p_order_id: ORDER_ID,
      p_tenant_id: TENANT_ID,
      p_expected_fulfillment_version: 1,
      p_shipment_no: "SHIP-001",
      p_shipped_at: "2026-07-30T03:00:00.000Z",
      p_carrier_name: "顺丰",
      p_tracking_no: "SF001",
      p_remark: null,
      p_items: [{ purchase_order_item_id: ITEM_ID, quantity: 6 }],
      p_actor_user_id: USER_ID,
      p_actor_employee_id: EMPLOYEE_ID,
      p_idempotency_key: "fulfillment:command",
    });
    expect(await requests[2]!.clone().json()).toEqual({
      p_receipt_id: RECEIPT_ID,
      p_order_id: ORDER_ID,
      p_tenant_id: TENANT_ID,
      p_expected_fulfillment_version: 2,
      p_receipt_no: "RCV-001",
      p_received_at: "2026-07-30T04:00:00.000Z",
      p_remark: null,
      p_items: [{
        purchase_order_item_id: ITEM_ID,
        accepted_quantity: 5,
        rejected_quantity: 1,
        variance_reason: "破损",
      }],
      p_actor_user_id: USER_ID,
      p_actor_employee_id: EMPLOYEE_ID,
      p_idempotency_key: "fulfillment:command",
    });
  });

  test("rejects malformed records and strict command responses", async () => {
    const malformedDetail = await repositoryFor((request) =>
      new URL(request.url).pathname.endsWith(
          "/supplier_purchase_order_fulfillments",
        )
        ? { body: { ...fulfillment, extra: true } }
        : { body: [] }
    );
    await expect(malformedDetail.repository.getDetail({
      tenant_id: TENANT_ID,
      order_id: ORDER_ID,
    })).rejects.toMatchObject({ statusCode: 500, code: "DB_ERROR" });

    const malformedCommand = await repositoryFor(() => ({
      body: { ...commandResult("confirmed", 1), extra: true },
    }));
    await expect(malformedCommand.repository.confirm(confirmCommand))
      .rejects.toMatchObject({ statusCode: 500, code: "DB_ERROR" });

    const wrongSuccess = await repositoryFor(() => ({
      body: commandResult("receipt_created", 1),
    }));
    await expect(wrongSuccess.repository.confirm(confirmCommand))
      .rejects.toMatchObject({ statusCode: 500, code: "DB_ERROR" });
  });

  test.each([
    { status: "state_conflict" },
    { status: "state_conflict", error_code: "UNKNOWN_COMMAND_ERROR" },
    { status: "state_conflict", error_code: "OVER_SHIPPED" },
  ] as const)("rejects invalid error envelopes as DB failures", async (body) => {
    const { repository } = await repositoryFor(() => ({ body }));
    await expect(repository.confirm(confirmCommand)).rejects.toMatchObject({
      statusCode: 500,
      code: "DB_ERROR",
    });
  });

  test("maps command envelopes and RPC failures through stable errors", async () => {
    const envelopeFailure = await repositoryFor(() => ({
      body: {
        status: "over_shipped",
        error_code: "OVER_SHIPPED",
      },
    }));
    await expect(envelopeFailure.repository.createShipment(shipmentCommand))
      .rejects.toMatchObject({
      statusCode: 409,
      code: "SUPPLIER_PURCHASE_ORDER_OVER_SHIPPED",
    });

    const databaseFailure = await repositoryFor(() => ({
      body: {
        code: "P0001",
        message: "SUPPLIER_PURCHASE_ORDER_FULFILLMENT_STARTED",
      },
      status: 400,
    }));
    await expect(databaseFailure.repository.confirm(confirmCommand))
      .rejects.toMatchObject({
      statusCode: 409,
      code: "SUPPLIER_PURCHASE_ORDER_FULFILLMENT_STARTED",
    });

    const unknownDatabaseFailure = await repositoryFor(() => ({
      body: { code: "XX000", message: "internal database error" },
      status: 500,
    }));
    await expect(unknownDatabaseFailure.repository.confirm(confirmCommand))
      .rejects.toMatchObject({ statusCode: 500, code: "DB_ERROR" });
  });
});

const fulfillment = {
  id: FULFILLMENT_ID,
  tenant_id: TENANT_ID,
  supplier_purchase_order_id: ORDER_ID,
  status: "confirmed",
  confirmed_at: "2026-07-30T02:00:00.000Z",
  confirmed_by_employee_id: EMPLOYEE_ID,
  confirmation_remark: null,
  version: 1,
  created_at: "2026-07-30T02:00:00.000Z",
  updated_at: "2026-07-30T02:00:00.000Z",
} as const;
const itemFulfillment = {
  tenant_id: TENANT_ID,
  supplier_purchase_order_fulfillment_id: FULFILLMENT_ID,
  supplier_purchase_order_item_id: ITEM_ID,
  ordered_quantity: "10.0000",
  shipped_quantity: "0.0000",
  received_quantity: "0.0000",
  accepted_quantity: "0.0000",
  rejected_quantity: "0.0000",
  accepted_subtotal_amount: "0.00",
  accepted_tax_amount: "0.00",
  accepted_total_amount: "0.00",
  updated_at: "2026-07-30T02:00:00.000Z",
} as const;
const shipment = {
  id: SHIPMENT_ID,
  tenant_id: TENANT_ID,
  supplier_purchase_order_id: ORDER_ID,
  shipment_no: "SHIP-001",
  carrier_name: null,
  tracking_no: null,
  shipped_at: "2026-07-30T03:00:00.000Z",
  remark: null,
  created_by_employee_id: EMPLOYEE_ID,
  created_at: "2026-07-30T03:00:00.000Z",
  items: [{
    tenant_id: TENANT_ID,
    shipment_id: SHIPMENT_ID,
    supplier_purchase_order_item_id: ITEM_ID,
    quantity: "6.0000",
  }],
} as const;
const receipt = {
  id: RECEIPT_ID,
  tenant_id: TENANT_ID,
  supplier_purchase_order_id: ORDER_ID,
  receipt_no: "RCV-001",
  received_at: "2026-07-30T04:00:00.000Z",
  remark: null,
  received_by_employee_id: EMPLOYEE_ID,
  created_at: "2026-07-30T04:00:00.000Z",
  items: [{
    tenant_id: TENANT_ID,
    receipt_id: RECEIPT_ID,
    supplier_purchase_order_item_id: ITEM_ID,
    accepted_quantity: "5.0000",
    rejected_quantity: "1.0000",
    variance_reason: "破损",
  }],
} as const;
const purchaseOrder = {
  id: ORDER_ID,
  tenant_id: TENANT_ID,
  project_id: PROJECT_ID,
  tenant_supplier_id: RELATIONSHIP_ID,
  supplier_id: SUPPLIER_ID,
  order_no: "PO-20260730-00000001",
  status: "submitted",
  currency: "CNY",
  expected_delivery_date: null,
  remark: null,
  priced_at: "2026-07-30T01:00:00.000Z",
  subtotal_amount: "100.00",
  tax_amount: "13.00",
  total_amount: "113.00",
  purchase_requisition_id: null,
  purchase_batch_id: null,
  version: 2,
  created_by_employee_id: EMPLOYEE_ID,
  updated_by_employee_id: EMPLOYEE_ID,
  submitted_by_employee_id: EMPLOYEE_ID,
  submitted_at: "2026-07-30T01:30:00.000Z",
  cancelled_by_employee_id: null,
  cancelled_at: null,
  cancel_reason: null,
  created_at: "2026-07-30T01:00:00.000Z",
  updated_at: "2026-07-30T01:30:00.000Z",
} as const;
const commandContext = {
  tenant_id: TENANT_ID, order_id: ORDER_ID,
  actor_user_id: USER_ID, actor_employee_id: EMPLOYEE_ID,
  idempotency_key: "fulfillment:command",
};
const confirmCommand = {
  ...commandContext,
  expected_version: 2, confirmed_at: "2026-07-30T02:00:00.000Z",
  remark: null,
};
const shipmentCommand = {
  ...commandContext,
  id: SHIPMENT_ID, expected_fulfillment_version: 1,
  shipment_no: "SHIP-001", shipped_at: "2026-07-30T03:00:00.000Z",
  carrier_name: "顺丰", tracking_no: "SF001", remark: null,
  items: [{ purchase_order_item_id: ITEM_ID, quantity: 6 }],
};
const receiptCommand = {
  ...commandContext,
  id: RECEIPT_ID, expected_fulfillment_version: 2,
  receipt_no: "RCV-001", received_at: "2026-07-30T04:00:00.000Z",
  remark: null,
  items: [{
    purchase_order_item_id: ITEM_ID,
    accepted_quantity: 5,
    rejected_quantity: 1,
    variance_reason: "破损",
  }],
};

function commandResult(
  status: "confirmed" | "shipment_created" | "receipt_created",
  version: number,
) {
  return {
    status,
    idempotent: false,
    purchase_order: purchaseOrder,
    fulfillment: { ...fulfillment, version },
    version,
  };
}
