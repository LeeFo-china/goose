import { describe, expect, mock, test } from "bun:test";

import type { AuthContext } from "@/services/authorization";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

const ID = {
  tenant: "84000000-0000-4000-8000-000000000001",
  project: "84000000-0000-4000-8000-000000000002",
  otherProject: "84000000-0000-4000-8000-000000000003",
  relationship: "84000000-0000-4000-8000-000000000004",
  request: "84000000-0000-4000-8000-000000000005",
  otherRequest: "84000000-0000-4000-8000-000000000006",
  payable: "84000000-0000-4000-8000-000000000007",
  allocation: "84000000-0000-4000-8000-000000000008",
  payment: "84000000-0000-4000-8000-000000000009",
  user: "84000000-0000-4000-8000-000000000010",
  employee: "84000000-0000-4000-8000-000000000011",
  idempotency: "84000000-0000-4000-8000-000000000012",
};
const EVIDENCE_PATH = `tenants/${ID.tenant}/expense-request/evidence.png`;
const auth = {
  authUserId: ID.user,
  employeeId: ID.employee,
  tenantId: ID.tenant,
} as unknown as AuthContext;
const detail = {
  payment_request: {
    id: ID.request,
    project_id: ID.project,
    tenant_supplier_id: ID.relationship,
  },
  allocations: [],
};

function dependencies() {
  const scope = {
    tenantId: ID.tenant,
    authUserId: ID.user,
    employeeId: ID.employee,
  };
  return {
    access: {
      requireRequestRead: mock(async () => scope),
      requireRequestManage: mock(async () => scope),
      requireRequestApprove: mock(async () => scope),
      requirePayment: mock(async () => scope),
      getVisibleProjectIds: mock(
        async (): Promise<string[] | null> => [ID.project],
      ),
      assertProjectRead: mock(async () => undefined),
      assertProjectUpdate: mock(async () => undefined),
    },
    repository: {
      list: mock(async (input: unknown) => ({
        list: [{ project_id: ID.project }, { project_id: ID.otherProject }],
        pagination: { page: 1, pageSize: 20, total: 2 },
        input,
      })),
      detail: mock(async () => detail),
      listPayments: mock(async (input: unknown) => ({ input })),
      saveDraft: mock(async () => success("saved")),
      submit: mock(async () => success("submitted")),
      review: mock(async (input: { action: "approve" | "reject" }) =>
        success(input.action === "approve" ? "approved" : "rejected")
      ),
      cancel: mock(async () => success("cancelled")),
      close: mock(async () => success("closed")),
      confirmPayment: mock(async () => success("paid")),
    },
    fileRepository: {
      findActiveByObjectKeys: mock(async () => [{
        object_key: EVIDENCE_PATH,
        tenant_id: ID.tenant,
        scene: "expense_request",
        status: "active",
        deleted_at: null,
        created_by_employee_id: ID.employee,
      }]),
    },
  };
}

function success(status: string) {
  return {
    status,
    idempotent: false,
    payment_request: {
      id: ID.request,
      project_id: ID.project,
      status: status === "submitted" ? "pending_approval" : status,
    },
    ...(status === "paid" ? { payment: { id: ID.payment } } : {}),
    version: 2,
  };
}

describe("SupplierPaymentRequestsService reads", () => {
  test.each([
    [null, "all project scope"],
    [[ID.project], "scoped project ids"],
    [[], "empty project scope"],
  ] as const)("scopes list in SQL with %s for %s", async (
    visibleProjectIds,
  ) => {
    const deps = dependencies();
    deps.access.getVisibleProjectIds.mockImplementation(async () =>
      visibleProjectIds === null ? null : [...visibleProjectIds]
    );
    const { SupplierPaymentRequestsService } = await import(
      "./supplier-payment-requests"
    );
    const service = new SupplierPaymentRequestsService(deps as never);

    await service.list(auth, {
      project_id: ID.project,
      status: "draft",
      page: 1,
      pageSize: 20,
    });

    expect(deps.repository.list).toHaveBeenCalledWith({
      tenant_id: ID.tenant,
      visible_project_ids: visibleProjectIds,
      project_id: ID.project,
      status: "draft",
      page: 1,
      pageSize: 20,
    });
    expect(deps.access.getVisibleProjectIds).toHaveBeenCalledWith(auth);
    expect(deps.access.assertProjectRead).not.toHaveBeenCalled();
  });

  test("checks detail scope before returning detail or payments", async () => {
    const deps = dependencies();
    const { SupplierPaymentRequestsService } = await import(
      "./supplier-payment-requests"
    );
    const service = new SupplierPaymentRequestsService(deps as never);

    expect((await service.detail(auth, ID.request)).payment_request.project_id)
      .toBe(ID.project);
    await service.listPayments(auth, ID.request, { page: 2, pageSize: 20 });

    expect(deps.access.assertProjectRead).toHaveBeenCalledTimes(2);
    expect(deps.repository.listPayments).toHaveBeenCalledWith({
      tenant_id: ID.tenant,
      payment_request_id: ID.request,
      page: 2,
      pageSize: 20,
    });
  });

  test("returns stable not-found without attempting project access", async () => {
    const deps = dependencies();
    deps.repository.detail.mockImplementation(async () => null as never);
    const { SupplierPaymentRequestsService } = await import(
      "./supplier-payment-requests"
    );
    const service = new SupplierPaymentRequestsService(deps as never);

    await expect(service.detail(auth, ID.request)).rejects.toMatchObject({
      statusCode: 409,
      code: "SUPPLIER_PAYMENT_REQUEST_NOT_FOUND",
    });
    expect(deps.access.assertProjectRead).not.toHaveBeenCalled();
  });
});

describe("SupplierPaymentRequestsService commands", () => {
  test("injects actor and tenant while isolating command permissions", async () => {
    const deps = dependencies();
    const { SupplierPaymentRequestsService } = await import(
      "./supplier-payment-requests"
    );
    const service = new SupplierPaymentRequestsService(deps as never);
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
    const version = { expected_version: 1 };
    const reason = { expected_version: 1, reason: "原因" };

    await service.saveDraft(auth, ID.request, draft, ID.idempotency);
    await service.submit(auth, ID.request, version, ID.idempotency);
    await service.approve(auth, ID.request, version, ID.idempotency);
    await service.reject(auth, ID.request, {
      expected_version: 1,
      remark: "驳回",
    }, ID.idempotency);
    await service.cancel(auth, ID.request, reason, ID.idempotency);
    await service.close(auth, ID.request, reason, ID.idempotency);
    await service.confirmPayment(auth, ID.request, {
      id: ID.payment,
      expected_version: 1,
      payment_method: "bank_transfer",
      payment_reference: "BANK-001",
      paid_at: "2026-07-31T08:00:00.000Z",
      evidence_images: [EVIDENCE_PATH],
      allocations: [{
        payment_request_allocation_id: ID.allocation,
        payable_event_id: ID.payable,
        amount: "100.00",
      }],
    }, ID.idempotency);

    expect(deps.access.requireRequestManage).toHaveBeenCalledTimes(4);
    expect(deps.access.requireRequestApprove).toHaveBeenCalledTimes(2);
    expect(deps.access.requirePayment).toHaveBeenCalledTimes(1);
    for (
      const command of [
        deps.repository.saveDraft,
        deps.repository.submit,
        deps.repository.review,
        deps.repository.cancel,
        deps.repository.close,
        deps.repository.confirmPayment,
      ]
    ) {
      expect(command).toHaveBeenCalledWith(expect.objectContaining({
        tenant_id: ID.tenant,
        actor_user_id: ID.user,
        actor_employee_id: ID.employee,
        idempotency_key: ID.idempotency,
      }));
    }
  });

  test("checks both old and new project write scope for draft updates", async () => {
    const deps = dependencies();
    const { SupplierPaymentRequestsService } = await import(
      "./supplier-payment-requests"
    );
    const service = new SupplierPaymentRequestsService(deps as never);

    await service.saveDraft(auth, ID.request, {
      id: ID.request,
      project_id: ID.otherProject,
      tenant_supplier_id: ID.relationship,
      expected_version: 1,
      reason: "调整",
      allocations: [{
        payable_event_id: ID.payable,
        requested_amount: "100.00",
      }],
    }, ID.idempotency);

    expect(deps.access.assertProjectUpdate).toHaveBeenCalledWith(
      auth,
      ID.project,
    );
    expect(deps.access.assertProjectUpdate).toHaveBeenCalledWith(
      auth,
      ID.otherProject,
    );
  });

  test("normalizes empty optional remarks at the repository boundary", async () => {
    const deps = dependencies();
    const { SupplierPaymentRequestsService } = await import(
      "./supplier-payment-requests"
    );
    const service = new SupplierPaymentRequestsService(deps as never);
    const draft = (remark: string) => ({
      id: ID.request,
      project_id: ID.project,
      tenant_supplier_id: ID.relationship,
      expected_version: 0,
      reason: "材料款",
      remark,
      allocations: [{
        payable_event_id: ID.payable,
        requested_amount: "100.00",
      }],
    });
    const payment = (remark: string) => ({
      id: ID.payment,
      expected_version: 1,
      payment_method: "bank_transfer" as const,
      payment_reference: "BANK-001",
      paid_at: "2026-07-31T08:00:00.000Z",
      evidence_images: [EVIDENCE_PATH],
      remark,
      allocations: [{
        payment_request_allocation_id: ID.allocation,
        payable_event_id: ID.payable,
        amount: "100.00",
      }],
    });

    await service.saveDraft(auth, ID.request, draft(""), ID.idempotency);
    await service.saveDraft(
      auth,
      ID.request,
      draft("草稿备注"),
      ID.idempotency,
    );
    await service.confirmPayment(
      auth,
      ID.request,
      payment(""),
      ID.idempotency,
    );
    await service.confirmPayment(
      auth,
      ID.request,
      payment("付款备注"),
      ID.idempotency,
    );

    expect(deps.repository.saveDraft).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ remark: null }),
    );
    expect(deps.repository.saveDraft).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ remark: "草稿备注" }),
    );
    expect(deps.repository.confirmPayment).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ remark: null }),
    );
    expect(deps.repository.confirmPayment).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ remark: "付款备注" }),
    );
  });

  test("rejects payment evidence outside the active tenant employee upload set", async () => {
    const deps = dependencies();
    deps.fileRepository.findActiveByObjectKeys.mockImplementation(async () =>
      []
    );
    const { SupplierPaymentRequestsService } = await import(
      "./supplier-payment-requests"
    );
    const service = new SupplierPaymentRequestsService(deps as never);

    await expect(service.confirmPayment(auth, ID.request, {
      id: ID.payment,
      expected_version: 1,
      payment_method: "bank_transfer",
      payment_reference: "BANK-001",
      paid_at: "2026-07-31T08:00:00.000Z",
      evidence_images: [EVIDENCE_PATH],
      allocations: [{
        payment_request_allocation_id: ID.allocation,
        payable_event_id: ID.payable,
        amount: "100.00",
      }],
    }, ID.idempotency)).rejects.toMatchObject({
      statusCode: 400,
      code: "SUPPLIER_PAYMENT_EVIDENCE_FILE_INVALID",
    });

    expect(deps.fileRepository.findActiveByObjectKeys).toHaveBeenCalledWith({
      objectKeys: [EVIDENCE_PATH],
      tenantId: ID.tenant,
      limit: 9,
    });
    expect(deps.repository.confirmPayment).not.toHaveBeenCalled();
  });

  test("rejects a path/body draft ID mismatch before repository access", async () => {
    const deps = dependencies();
    const { SupplierPaymentRequestsService } = await import(
      "./supplier-payment-requests"
    );
    const service = new SupplierPaymentRequestsService(deps as never);

    await expect(service.saveDraft(auth, ID.request, {
      id: ID.otherRequest,
      project_id: ID.project,
      tenant_supplier_id: ID.relationship,
      expected_version: 0,
      reason: "材料款",
      allocations: [{
        payable_event_id: ID.payable,
        requested_amount: "100.00",
      }],
    }, ID.idempotency)).rejects.toMatchObject({
      statusCode: 409,
      code: "SUPPLIER_PAYMENT_REQUEST_SCOPE_MISMATCH",
    });
    expect(deps.repository.saveDraft).not.toHaveBeenCalled();
  });

  test.each([
    [
      "not_found",
      "SUPPLIER_PAYMENT_NOT_FOUND",
      "SUPPLIER_PAYMENT_REQUEST_NOT_FOUND",
    ],
    [
      "validation_error",
      "SUPPLIER_PAYMENT_VALIDATION_ERROR",
      "SUPPLIER_PAYMENT_VALIDATION_ERROR",
    ],
    [
      "state_conflict",
      "SUPPLIER_PAYMENT_STATE_CONFLICT",
      "SUPPLIER_PAYMENT_REQUEST_STATE_CONFLICT",
    ],
    [
      "version_conflict",
      "SUPPLIER_PAYMENT_VERSION_CONFLICT",
      "SUPPLIER_PAYMENT_REQUEST_VERSION_CONFLICT",
    ],
    [
      "scope_mismatch",
      "SUPPLIER_PAYMENT_SCOPE_MISMATCH",
      "SUPPLIER_PAYMENT_REQUEST_SCOPE_MISMATCH",
    ],
    [
      "amount_unavailable",
      "SUPPLIER_PAYMENT_AMOUNT_UNAVAILABLE",
      "SUPPLIER_PAYABLE_AMOUNT_UNAVAILABLE",
    ],
    [
      "allocation_invalid",
      "SUPPLIER_PAYMENT_ALLOCATION_INVALID",
      "SUPPLIER_PAYMENT_ALLOCATION_INVALID",
    ],
    [
      "evidence_required",
      "SUPPLIER_PAYMENT_EVIDENCE_REQUIRED",
      "SUPPLIER_PAYMENT_EVIDENCE_REQUIRED",
    ],
    [
      "invoice_required",
      "SUPPLIER_PAYMENT_INVOICE_REQUIRED",
      "SUPPLIER_PAYMENT_INVOICE_CAPABILITY_REQUIRED",
    ],
    [
      "self_review",
      "SUPPLIER_PAYMENT_SELF_REVIEW",
      "SUPPLIER_PAYMENT_REQUEST_SELF_REVIEW_FORBIDDEN",
    ],
    [
      "idempotency_conflict",
      "SUPPLIER_PAYMENT_IDEMPOTENCY_CONFLICT",
      "SUPPLIER_PAYMENT_IDEMPOTENCY_CONFLICT",
    ],
  ] as const)(
    "maps %s to the frozen API business code",
    async (status, databaseCode, apiCode) => {
    const deps = dependencies();
    deps.repository.submit.mockImplementation(async () => ({
      status,
      error_code: databaseCode,
    }) as never);
    const { SupplierPaymentRequestsService } = await import(
      "./supplier-payment-requests"
    );
    const service = new SupplierPaymentRequestsService(deps as never);

    await expect(service.submit(auth, ID.request, {
      expected_version: 1,
    }, ID.idempotency)).rejects.toMatchObject({
      statusCode: 409,
      code: apiCode,
    });
    },
  );

  test("does not rewrap repository database errors", async () => {
    const deps = dependencies();
    const databaseError = Object.assign(new Error("db"), {
      statusCode: 500,
      code: "DB_ERROR",
    });
    deps.repository.submit.mockImplementation(async () => {
      throw databaseError;
    });
    const { SupplierPaymentRequestsService } = await import(
      "./supplier-payment-requests"
    );
    const service = new SupplierPaymentRequestsService(deps as never);

    let caught: unknown;
    try {
      await service.submit(auth, ID.request, {
        expected_version: 1,
      }, ID.idempotency);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBe(databaseError);
  });
});
