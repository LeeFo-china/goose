import { beforeEach, describe, expect, mock, test } from "bun:test";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

const ID = {
  tenant: "86000000-0000-4000-8000-000000000001",
  user: "86000000-0000-4000-8000-000000000002",
  employee: "86000000-0000-4000-8000-000000000003",
  project: "86000000-0000-4000-8000-000000000004",
  relationship: "86000000-0000-4000-8000-000000000005",
  request: "86000000-0000-4000-8000-000000000006",
  payable: "86000000-0000-4000-8000-000000000007",
  allocation: "86000000-0000-4000-8000-000000000008",
  payment: "86000000-0000-4000-8000-000000000009",
  idempotency: "86000000-0000-4000-8000-000000000010",
};
const auth = {
  tenantId: ID.tenant,
  authUserId: ID.user,
  employeeId: ID.employee,
};
const emptyPage = {
  list: [],
  pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 },
};
const services = {
  list: mock(async () => emptyPage),
  detail: mock(async () => ({ id: ID.request })),
  listPayments: mock(async () => emptyPage),
  saveDraft: mock(async () => ({ status: "saved" })),
  submit: mock(async () => ({ status: "submitted" })),
  approve: mock(async () => ({ status: "approved" })),
  reject: mock(async () => ({ status: "rejected" })),
  cancel: mock(async () => ({ status: "cancelled" })),
  close: mock(async () => ({ status: "closed" })),
  confirmPayment: mock(async () => ({ status: "paid" })),
};

mock.module("@/services/supplier-payment-requests", () => ({
  supplierPaymentRequestsService: services,
}));

async function controller() {
  const { default: value } = await import(".");
  Object.defineProperty(value, "getRequiredTenantContext", {
    configurable: true,
    value: mock(async () => auth),
  });
  return value;
}

const draft = {
  id: ID.request,
  project_id: ID.project,
  tenant_supplier_id: ID.relationship,
  expected_version: 0,
  reason: "材料款",
  allocations: [{
    payable_event_id: ID.payable,
    requested_amount: "100.00",
  }],
};
const payment = {
  id: ID.payment,
  expected_version: 1,
  payment_method: "bank_transfer",
  payment_reference: "BANK-001",
  paid_at: "2026-07-31T08:00:00.000Z",
  evidence_images: ["evidence/1.png"],
  allocations: [{
    payment_request_allocation_id: ID.allocation,
    payable_event_id: ID.payable,
    amount: "100.00",
  }],
};

describe("SupplierPaymentRequestsController routes", () => {
  beforeEach(() => {
    for (const service of Object.values(services)) service.mockClear();
  });

  test("registers the eleven request routes exactly once", async () => {
    const value = await controller();
    const routes: Array<{ method: string; path: string }> = [];
    value.registerExtraRoutes({
      get: (path: string) => routes.push({ method: "GET", path }),
      post: (path: string) => routes.push({ method: "POST", path }),
      put: (path: string) => routes.push({ method: "PUT", path }),
    } as never);

    expect(routes).toEqual([
      { method: "GET", path: "/supplier-payment-requests" },
      { method: "GET", path: "/supplier-payment-requests/:id" },
      { method: "GET", path: "/supplier-payment-requests/:id/payments" },
      { method: "POST", path: "/supplier-payment-requests" },
      { method: "PUT", path: "/supplier-payment-requests/:id" },
      { method: "POST", path: "/supplier-payment-requests/:id/submit" },
      { method: "POST", path: "/supplier-payment-requests/:id/approve" },
      { method: "POST", path: "/supplier-payment-requests/:id/reject" },
      { method: "POST", path: "/supplier-payment-requests/:id/cancel" },
      { method: "POST", path: "/supplier-payment-requests/:id/close" },
      { method: "POST", path: "/supplier-payment-requests/:id/payments" },
    ]);
    expect(new Set(routes.map(({ method, path }) => `${method} ${path}`)).size)
      .toBe(11);

    const { default: payableController } = await import(
      "../supplier-payables"
    );
    payableController.registerExtraRoutes({
      get: (path: string) => routes.push({ method: "GET", path }),
    } as never);
    expect(routes).toHaveLength(12);
    expect(new Set(routes.map(({ method, path }) => `${method} ${path}`)).size)
      .toBe(12);
  });

  test("parses paginated reads and wraps their responses", async () => {
    const value = await controller();
    await value.listRequests({
      query: { page: "2", pageSize: "100", status: "draft" },
    } as never);
    await value.getDetail({ params: { id: ID.request } } as never);
    await value.listPayments({
      params: { id: ID.request },
      query: { page: "3", pageSize: "20" },
    } as never);

    expect(services.list).toHaveBeenCalledWith(auth, {
      page: 2,
      pageSize: 100,
      status: "draft",
    });
    expect(services.detail).toHaveBeenCalledWith(auth, ID.request);
    expect(services.listPayments).toHaveBeenCalledWith(
      auth,
      ID.request,
      { page: 3, pageSize: 20 },
    );
  });

  test("passes a UUID idempotency key through every mutation", async () => {
    const value = await controller();
    const headers = { "idempotency-key": ID.idempotency };
    const calls = [
      ["createDraft", { headers, body: draft }],
      ["updateDraft", {
        headers,
        params: { id: ID.request },
        body: { ...draft, expected_version: 1 },
      }],
      ["submit", {
        headers,
        params: { id: ID.request },
        body: { expected_version: 1 },
      }],
      ["approve", {
        headers,
        params: { id: ID.request },
        body: { expected_version: 1 },
      }],
      ["reject", {
        headers,
        params: { id: ID.request },
        body: { expected_version: 1, remark: "  驳回  " },
      }],
      ["cancel", {
        headers,
        params: { id: ID.request },
        body: { expected_version: 1, reason: "取消" },
      }],
      ["close", {
        headers,
        params: { id: ID.request },
        body: { expected_version: 1, reason: "关闭" },
      }],
      ["confirmPayment", {
        headers,
        params: { id: ID.request },
        body: payment,
      }],
    ] as const;

    for (const [method, request] of calls) {
      await value[method](request as never);
    }
    expect(services.saveDraft).toHaveBeenNthCalledWith(
      1,
      auth,
      ID.request,
      draft,
      ID.idempotency,
    );
    expect(services.saveDraft).toHaveBeenNthCalledWith(
      2,
      auth,
      ID.request,
      { ...draft, expected_version: 1 },
      ID.idempotency,
    );
    for (
      const service of [
        services.submit,
        services.approve,
        services.cancel,
        services.close,
        services.confirmPayment,
      ]
    ) {
      expect(service).toHaveBeenCalledWith(
        auth,
        ID.request,
        expect.anything(),
        ID.idempotency,
      );
    }
    expect(services.reject).toHaveBeenCalledWith(
      auth,
      ID.request,
      { expected_version: 1, remark: "驳回" },
      ID.idempotency,
    );
  });

  test.each([
    [{ expected_version: 1 }],
    [{ expected_version: 1, remark: null }],
    [{ expected_version: 1, remark: "" }],
    [{ expected_version: 1, remark: "   " }],
    [{ expected_version: 1, remark: "驳".repeat(501) }],
    [{ expected_version: 1, remark: "驳回", unexpected: true }],
  ])("requires a strict non-empty reject remark", async (body) => {
    const value = await controller();
    await expect(value.reject({
      headers: { "idempotency-key": ID.idempotency },
      params: { id: ID.request },
      body,
    } as never)).rejects.toMatchObject({
      statusCode: 400,
      code: "VALIDATION_ERROR",
    });
    expect(services.reject).not.toHaveBeenCalled();
  });

  test("rejects non-UUID idempotency keys before every mutation service", async () => {
    const value = await controller();
    const headers = { "idempotency-key": "payment:plain-text" };
    const calls = [
      ["createDraft", { headers, body: draft }, services.saveDraft],
      ["updateDraft", {
        headers,
        params: { id: ID.request },
        body: { ...draft, expected_version: 1 },
      }, services.saveDraft],
      ["submit", {
        headers,
        params: { id: ID.request },
        body: { expected_version: 1 },
      }, services.submit],
      ["approve", {
        headers,
        params: { id: ID.request },
        body: { expected_version: 1 },
      }, services.approve],
      ["reject", {
        headers,
        params: { id: ID.request },
        body: { expected_version: 1 },
      }, services.reject],
      ["cancel", {
        headers,
        params: { id: ID.request },
        body: { expected_version: 1, reason: "取消" },
      }, services.cancel],
      ["close", {
        headers,
        params: { id: ID.request },
        body: { expected_version: 1, reason: "关闭" },
      }, services.close],
      ["confirmPayment", {
        headers,
        params: { id: ID.request },
        body: payment,
      }, services.confirmPayment],
    ] as const;

    for (const [method, request, service] of calls) {
      await expect(value[method](request as never)).rejects.toMatchObject({
        statusCode: 400,
        code: "VALIDATION_ERROR",
      });
      expect(service).not.toHaveBeenCalled();
    }
  });

  test("requires version zero when creating a draft", async () => {
    const value = await controller();
    await expect(value.createDraft({
      headers: { "idempotency-key": ID.idempotency },
      body: { ...draft, expected_version: 1 },
    } as never)).rejects.toMatchObject({
      statusCode: 400,
      code: "VALIDATION_ERROR",
    });
    expect(services.saveDraft).not.toHaveBeenCalled();
  });

  test("requires a positive version when updating a draft", async () => {
    const value = await controller();
    await expect(value.updateDraft({
      headers: { "idempotency-key": ID.idempotency },
      params: { id: ID.request },
      body: draft,
    } as never)).rejects.toMatchObject({
      statusCode: 400,
      code: "VALIDATION_ERROR",
    });
    expect(services.saveDraft).not.toHaveBeenCalled();
  });

  test("registers both controllers once in the route registry", async () => {
    const source = await Bun.file(
      new URL("../../routes/index.ts", import.meta.url),
    ).text();
    for (
      const name of [
        "SupplierPayablesController",
        "SupplierPaymentRequestsController",
      ]
    ) {
      expect(source.match(new RegExp(`import ${name} `, "g"))).toHaveLength(1);
      expect(source.match(
        new RegExp(`${name}\\.registerExtraRoutes\\(app\\)`, "g"),
      )).toHaveLength(1);
    }
  });

  test("keeps database access out of the controller", async () => {
    const source = await Bun.file(new URL("./index.ts", import.meta.url)).text();
    const forbiddenClientName = ["Supabase", "DB"].join("");
    expect(source).not.toContain(forbiddenClientName);
    expect(source).not.toContain(".from(");
    expect(source).not.toContain(".rpc(");
    expect(source.match(
      /this\.requirePaymentIdempotencyKey\(request\)/g,
    )).toHaveLength(8);
    expect(source).toContain("requireSupplierIdempotencyKey(request)");
  });
});
