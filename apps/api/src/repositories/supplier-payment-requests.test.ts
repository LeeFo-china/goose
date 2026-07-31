import { describe, expect, test } from "bun:test";
import { createClient } from "@supabase/supabase-js";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

const ID = {
  tenant: "81000000-0000-4000-8000-000000000001",
  project: "81000000-0000-4000-8000-000000000002",
  relationship: "81000000-0000-4000-8000-000000000003",
  supplier: "81000000-0000-4000-8000-000000000004",
  request: "81000000-0000-4000-8000-000000000005",
  allocation: "81000000-0000-4000-8000-000000000006",
  payable: "81000000-0000-4000-8000-000000000007",
  order: "81000000-0000-4000-8000-000000000008",
  payment: "81000000-0000-4000-8000-000000000009",
  user: "81000000-0000-4000-8000-000000000010",
  employee: "81000000-0000-4000-8000-000000000011",
  idempotency: "81000000-0000-4000-8000-000000000012",
};
const timestamp = "2026-07-31T08:00:00.000Z";
const requestRecord = {
  id: ID.request,
  tenant_id: ID.tenant,
  project_id: ID.project,
  tenant_supplier_id: ID.relationship,
  supplier_id: ID.supplier,
  request_no: "SPR-001",
  status: "draft",
  currency: "CNY",
  requested_amount: "100.00",
  paid_amount: "0.00",
  reason: "材料款",
  remark: null,
  version: 1,
  submitted_by_employee_id: null,
  submitted_at: null,
  reviewed_by_employee_id: null,
  reviewed_at: null,
  review_remark: null,
  cancelled_by_employee_id: null,
  cancelled_at: null,
  cancel_reason: null,
  closed_by_employee_id: null,
  closed_at: null,
  close_reason: null,
  created_by_employee_id: ID.employee,
  updated_by_employee_id: ID.employee,
  created_at: timestamp,
  updated_at: timestamp,
} as const;
const listItem = {
  id: ID.request,
  project_id: ID.project,
  tenant_supplier_id: ID.relationship,
  supplier_id: ID.supplier,
  supplier_name: "示范供应商",
  request_no: "SPR-001",
  status: "draft",
  currency: "CNY",
  requested_amount: "100.00",
  paid_amount: "0.00",
  reason: "材料款",
  version: 1,
  created_at: timestamp,
  updated_at: timestamp,
};

async function repositoryFor(responder: (
  request: Request,
  index: number,
) => { body: unknown; status?: number }) {
  const requests: Request[] = [];
  const fetchStub = (async (input: string | URL | Request, init?: RequestInit) => {
    const request = input instanceof Request
      ? input
      : new Request(input.toString(), init);
    const response = responder(request, requests.push(request) - 1);
    return new Response(JSON.stringify(response.body), {
      status: response.status ?? 200,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;
  const client = createClient("http://127.0.0.1:54321", "test-key", {
    global: { fetch: fetchStub },
  });
  const { SupplierPaymentRequestsRepository } = await import(
    "./supplier-payment-requests"
  );
  return {
    repository: new SupplierPaymentRequestsRepository(() => client as never),
    requests,
  };
}

describe("SupplierPaymentRequestsRepository", () => {
  test("maps list, detail and payment reads to their exact RPC contracts", async () => {
    const allocation = {
      id: ID.allocation,
      payable_event_id: ID.payable,
      requested_amount: "100.00",
      paid_amount: "0.00",
      payable_amount: "100.00",
      due_at: timestamp,
      supplier_purchase_order_id: ID.order,
    };
    const payment = {
      id: ID.payment,
      payment_no: "SP-001",
      amount: "100.00",
      currency: "CNY",
      payment_method: "bank_transfer",
      payment_reference: "BANK-001",
      paid_at: timestamp,
      evidence_images: ["evidence/1.png"],
      remark: null,
      confirmed_by_employee_id: ID.employee,
      created_at: timestamp,
    };
    const { repository, requests } = await repositoryFor((_request, index) => ({
      body: [
        { items: [listItem], total: 1, page: 2, page_size: 100 },
        { payment_request: requestRecord, allocations: [allocation] },
        { items: [payment], total: 1, page: 3, page_size: 20 },
      ][index],
    }));

    await repository.list({
      tenant_id: ID.tenant,
      visible_project_ids: [ID.project],
      project_id: ID.project,
      tenant_supplier_id: ID.relationship,
      status: "draft",
      keyword: "SPR",
      created_from: timestamp,
      created_to: timestamp,
      page: 2,
      pageSize: 100,
    });
    expect(await repository.detail(ID.tenant, ID.request)).toEqual({
      payment_request: requestRecord,
      allocations: [allocation],
    });
    await repository.listPayments({
      tenant_id: ID.tenant,
      payment_request_id: ID.request,
      page: 3,
      pageSize: 20,
    });

    expect(requests.map((item) => new URL(item.url).pathname)).toEqual([
      "/rest/v1/rpc/list_supplier_payment_requests",
      "/rest/v1/rpc/get_supplier_payment_request_detail",
      "/rest/v1/rpc/list_supplier_payment_request_payments",
    ]);
    expect(await requests[0]!.clone().json()).toEqual({
      p_tenant_id: ID.tenant,
      p_visible_project_ids: [ID.project],
      p_project_id: ID.project,
      p_tenant_supplier_id: ID.relationship,
      p_status: "draft",
      p_keyword: "SPR",
      p_created_from: timestamp,
      p_created_to: timestamp,
      p_page: 2,
      p_page_size: 100,
    });
    expect(await requests[1]!.clone().json()).toEqual({
      p_tenant_id: ID.tenant,
      p_payment_request_id: ID.request,
    });
    expect(await requests[2]!.clone().json()).toEqual({
      p_tenant_id: ID.tenant,
      p_payment_request_id: ID.request,
      p_page: 3,
      p_page_size: 20,
    });
  });

  test("uses every real command function signature without invented parameters", async () => {
    const statuses = [
      "saved",
      "submitted",
      "approved",
      "rejected",
      "cancelled",
      "closed",
      "paid",
    ] as const;
    const { repository, requests } = await repositoryFor((_request, index) => {
      const status = statuses[index]!;
      return {
        body: status === "paid"
          ? {
            status,
            idempotent: false,
            payment_request: {
              ...requestRecord,
              status: "paid",
              paid_amount: "100.00",
              version: 7,
            },
            payment: {
              id: ID.payment,
              tenant_id: ID.tenant,
              project_id: ID.project,
              tenant_supplier_id: ID.relationship,
              supplier_id: ID.supplier,
              payment_request_id: ID.request,
              payment_no: "SP-001",
              currency: "CNY",
              amount: "100.00",
              payment_method: "bank_transfer",
              payment_reference: "BANK-001",
              paid_at: timestamp,
              evidence_images: ["evidence/1.png"],
              remark: null,
              confirmed_by_employee_id: ID.employee,
              idempotency_key: ID.idempotency,
              created_at: timestamp,
            },
            version: 7,
          }
          : {
            status,
            idempotent: false,
            payment_request: {
              ...requestRecord,
              status: status === "saved"
                ? "draft"
                : status === "submitted"
                ? "pending_approval"
                : status,
              version: index + 1,
            },
            version: index + 1,
          },
      };
    });
    const context = {
      tenant_id: ID.tenant,
      payment_request_id: ID.request,
      expected_version: 1,
      actor_user_id: ID.user,
      actor_employee_id: ID.employee,
      idempotency_key: ID.idempotency,
    };

    await repository.saveDraft({
      ...context,
      project_id: ID.project,
      tenant_supplier_id: ID.relationship,
      reason: "材料款",
      remark: null,
      allocations: [{
        payable_event_id: ID.payable,
        requested_amount: "100.00",
      }],
    });
    await repository.submit(context);
    await repository.review({ ...context, action: "approve", remark: null });
    await repository.review({ ...context, action: "reject", remark: "驳回" });
    await repository.cancel({ ...context, reason: "取消" });
    await repository.close({ ...context, reason: "关闭" });
    await repository.confirmPayment({
      ...context,
      payment_id: ID.payment,
      payment_method: "bank_transfer",
      payment_reference: "BANK-001",
      paid_at: timestamp,
      evidence_images: ["evidence/1.png"],
      remark: null,
      allocations: [{
        payment_request_allocation_id: ID.allocation,
        payable_event_id: ID.payable,
        amount: "100.00",
      }],
    });

    expect(requests.map((item) => new URL(item.url).pathname)).toEqual([
      "/rest/v1/rpc/save_supplier_payment_request_draft",
      "/rest/v1/rpc/submit_supplier_payment_request",
      "/rest/v1/rpc/review_supplier_payment_request",
      "/rest/v1/rpc/review_supplier_payment_request",
      "/rest/v1/rpc/cancel_supplier_payment_request",
      "/rest/v1/rpc/close_supplier_payment_request",
      "/rest/v1/rpc/confirm_supplier_payment",
    ]);
    const bodies = await Promise.all(
      requests.map((item) => item.clone().json() as Promise<Record<string, unknown>>),
    );
    expect(bodies[0]).toEqual({
      p_payment_request_id: ID.request,
      p_tenant_id: ID.tenant,
      p_project_id: ID.project,
      p_tenant_supplier_id: ID.relationship,
      p_expected_version: 1,
      p_reason: "材料款",
      p_remark: null,
      p_allocations: [{
        payable_event_id: ID.payable,
        requested_amount: "100.00",
      }],
      p_actor_user_id: ID.user,
      p_actor_employee_id: ID.employee,
      p_idempotency_key: ID.idempotency,
    });
    expect(bodies[1]).toEqual({
      p_payment_request_id: ID.request,
      p_tenant_id: ID.tenant,
      p_expected_version: 1,
      p_actor_user_id: ID.user,
      p_actor_employee_id: ID.employee,
      p_idempotency_key: ID.idempotency,
    });
    expect(bodies[2]?.p_action).toBe("approve");
    expect(bodies[3]?.p_action).toBe("reject");
    expect(bodies[4]?.p_reason).toBe("取消");
    expect(bodies[5]?.p_reason).toBe("关闭");
    expect(Object.keys(bodies[6]!).sort()).toEqual([
      "p_actor_employee_id",
      "p_actor_user_id",
      "p_allocations",
      "p_evidence_images",
      "p_expected_version",
      "p_idempotency_key",
      "p_paid_at",
      "p_payment_id",
      "p_payment_method",
      "p_payment_reference",
      "p_payment_request_id",
      "p_remark",
      "p_tenant_id",
    ]);
  });

  test("returns strict command errors and rejects malformed records", async () => {
    const commandError = await repositoryFor(() => ({
      body: {
        status: "self_review",
        error_code: "SUPPLIER_PAYMENT_SELF_REVIEW",
      },
    }));
    expect(await commandError.repository.review({
      tenant_id: ID.tenant,
      payment_request_id: ID.request,
      expected_version: 1,
      action: "approve",
      remark: null,
      actor_user_id: ID.user,
      actor_employee_id: ID.employee,
      idempotency_key: ID.idempotency,
    })).toEqual({
      status: "self_review",
      error_code: "SUPPLIER_PAYMENT_SELF_REVIEW",
    });

    const malformed = await repositoryFor(() => ({
      body: { items: [{ ...listItem, requested_amount: 100 }], total: 1, page: 1, page_size: 20 },
    }));
    await expect(malformed.repository.list({
      tenant_id: ID.tenant,
      visible_project_ids: null,
      page: 1,
      pageSize: 20,
    })).rejects.toMatchObject({ statusCode: 500, code: "DB_ERROR" });
  });
});
