import { beforeEach, describe, expect, mock, test } from "bun:test";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

const ORDER_ID = "62000000-0000-4000-8000-000000000001";
const PUBLIC_TOKEN = "pos_0123456789abcdefghijklmnopqrstuvwxyzABCDE";
const auth = {
  authUserId: "62000000-0000-4000-8000-000000000005",
  employeeId: "62000000-0000-4000-8000-000000000006",
  tenantId: "62000000-0000-4000-8000-000000000007",
};

const getEmployeePrintPreview = mock(async () => ({ order: { id: ORDER_ID } }));
const exportEmployeeOrderPdf = mock(async () => exportFile("order.pdf", "%PDF"));
const exportEmployeeOrderXlsx = mock(async () => exportFile("order.xlsx", "PK"));
const createShareLink = mock(async () => ({ token: PUBLIC_TOKEN }));
const getPublicOrder = mock(async () => ({ order: { id: ORDER_ID } }));
const confirmPublicView = mock(async () => ({ status: "confirmed" }));
const getPublicPrintPreview = mock(async () => ({ order: { id: ORDER_ID } }));
const exportPublicOrderPdf = mock(async () => exportFile("public.pdf", "%PDF"));
const exportPublicOrderXlsx = mock(async () => exportFile("public.xlsx", "PK"));

mock.module("@/services/supplier-purchase-orders", () => ({
  supplierPurchaseOrdersService: {},
}));

mock.module("@/services/supplier-purchase-fulfillments", () => ({
  supplierPurchaseFulfillmentsService: {},
}));

mock.module("@/services/supplier-purchase-order-sharing", () => ({
  supplierPurchaseOrderSharingService: {
    getEmployeePrintPreview,
    exportEmployeeOrderPdf,
    exportEmployeeOrderXlsx,
    createShareLink,
    getPublicOrder,
    confirmPublicView,
    getPublicPrintPreview,
    exportPublicOrderPdf,
    exportPublicOrderXlsx,
  },
}));

async function controller() {
  const { default: value } = await import(".");
  Object.defineProperty(value, "getRequiredTenantContext", {
    configurable: true,
    value: mock(async () => auth),
  });
  return value;
}

describe("SupplierPurchaseOrdersController sharing routes", () => {
  beforeEach(() => {
    for (const fn of [
      getEmployeePrintPreview,
      exportEmployeeOrderPdf,
      exportEmployeeOrderXlsx,
      createShareLink,
      getPublicOrder,
      confirmPublicView,
      getPublicPrintPreview,
      exportPublicOrderPdf,
      exportPublicOrderXlsx,
    ]) fn.mockClear();
  });

  test("passes purchase order export requests to the sharing service", async () => {
    const value = await controller();
    const reply = replyStub();

    await value.getPrintPreview({ params: { id: ORDER_ID } } as never);
    await value.exportPdf({ params: { id: ORDER_ID } } as never, reply as never);
    await value.exportXlsx({ params: { id: ORDER_ID } } as never, reply as never);

    expect(getEmployeePrintPreview).toHaveBeenCalledWith(auth, ORDER_ID);
    expect(exportEmployeeOrderPdf).toHaveBeenCalledWith(auth, ORDER_ID);
    expect(exportEmployeeOrderXlsx).toHaveBeenCalledWith(auth, ORDER_ID);
    expect(reply.header).toHaveBeenCalledWith("content-type", "application/pdf");
    expect(reply.send).toHaveBeenCalledWith(Buffer.from("%PDF"));
  });

  test("handles public token routes without tenant auth", async () => {
    const value = await controller();
    const reply = replyStub();
    const headers = { "idempotency-key": "public-confirm" };

    await value.getPublicOrder({ params: { token: PUBLIC_TOKEN } } as never);
    await value.confirmPublicView({
      params: { token: PUBLIC_TOKEN },
      headers,
      body: { confirmed_at: "2026-09-04T10:00:00+08:00" },
    } as never);
    await value.getPublicPrintPreview({ params: { token: PUBLIC_TOKEN } } as never);
    await value.exportPublicPdf(
      { params: { token: PUBLIC_TOKEN } } as never,
      reply as never,
    );
    await value.exportPublicXlsx(
      { params: { token: PUBLIC_TOKEN } } as never,
      reply as never,
    );

    expect(getPublicOrder).toHaveBeenCalledWith(PUBLIC_TOKEN);
    expect(confirmPublicView).toHaveBeenCalledWith(PUBLIC_TOKEN, {
      confirmed_at: "2026-09-04T10:00:00+08:00",
    });
    expect(getPublicPrintPreview).toHaveBeenCalledWith(PUBLIC_TOKEN);
    expect(exportPublicOrderPdf).toHaveBeenCalledWith(PUBLIC_TOKEN);
    expect(exportPublicOrderXlsx).toHaveBeenCalledWith(PUBLIC_TOKEN);
  });
});

function exportFile(filename: string, body: string) {
  return {
    filename,
    content_type: filename.endsWith(".pdf")
      ? "application/pdf"
      : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    content: Buffer.from(body),
  };
}

function replyStub() {
  const reply = {
    header: mock(() => reply),
    send: mock((value: unknown) => value),
  };
  return reply;
}
