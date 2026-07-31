import { afterEach, describe, expect, test } from "bun:test";

import {
  approveSupplierPaymentRequest,
  cancelSupplierPaymentRequest,
  closeSupplierPaymentRequest,
  confirmSupplierPayment,
  createSupplierPaymentRequestDraft,
  getSupplierPaymentRequest,
  listSupplierPaymentRequestPayments,
  listSupplierPaymentRequests,
  rejectSupplierPaymentRequest,
  submitSupplierPaymentRequest,
  updateSupplierPaymentRequestDraft,
} from "./payment-request-api";
import type {
  SupplierPaymentConfirmInput,
  SupplierPaymentRequestDraftInput,
  SupplierPaymentRequestUpdateDraftInput,
} from "./payment-request-types";

const originalFetch = globalThis.fetch;
const REQUEST_ID = "request/id ?";

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("供应商付款申请 API 契约", () => {
  test("列表、详情和付款记录都使用分页 backend client", async () => {
    const calls = installSuccessFetch();

    await listSupplierPaymentRequests({
      page: 1,
      pageSize: 20,
      keyword: "七月 材料款",
      status: "approved",
    });
    await getSupplierPaymentRequest(REQUEST_ID);
    await listSupplierPaymentRequestPayments(REQUEST_ID, {
      page: 2,
      pageSize: 100,
    });

    const listUrl = new URL(String(calls[0]?.input), "http://admin.local");
    expect(listUrl.pathname).toBe("/api/backend/supplier-payment-requests");
    expect(Object.fromEntries(listUrl.searchParams)).toEqual({
      page: "1",
      pageSize: "20",
      status: "approved",
      keyword: "七月 材料款",
    });
    expect(calls.slice(1).map(({ input }) => String(input))).toEqual([
      "/api/backend/supplier-payment-requests/request%2Fid%20%3F",
      "/api/backend/supplier-payment-requests/request%2Fid%20%3F/payments?page=2&pageSize=100",
    ]);
  });

  test("草稿与状态命令冻结幂等键且 body 只含业务输入", async () => {
    const calls = installSuccessFetch();
    const draft: SupplierPaymentRequestDraftInput = {
      id: "00000000-0000-4000-8000-000000000001",
      project_id: "project-1",
      tenant_supplier_id: "relationship-1",
      expected_version: 0,
      reason: "结算七月材料款",
      remark: null,
      allocations: [{
        payable_event_id: "payable-1",
        requested_amount: "90.00",
      }],
    };

    await createSupplierPaymentRequestDraft(draft, "create-key");
    const updateDraft: SupplierPaymentRequestUpdateDraftInput = {
      ...draft,
      expected_version: 1,
    };
    await updateSupplierPaymentRequestDraft(
      REQUEST_ID,
      updateDraft,
      "update-key",
    );
    await submitSupplierPaymentRequest(
      REQUEST_ID,
      { expected_version: 2 },
      "request-submit-key",
    );
    await approveSupplierPaymentRequest(
      REQUEST_ID,
      { expected_version: 3, remark: "同意" },
      "approve-key",
    );
    await rejectSupplierPaymentRequest(
      REQUEST_ID,
      { expected_version: 3, remark: "资料不完整" },
      "reject-key",
    );
    await cancelSupplierPaymentRequest(
      REQUEST_ID,
      { expected_version: 2, reason: "申请作废" },
      "cancel-key",
    );
    await closeSupplierPaymentRequest(
      REQUEST_ID,
      { expected_version: 4, reason: "不再支付尾款" },
      "close-key",
    );

    expect(calls.map(({ init }) =>
      new Headers(init?.headers).get("Idempotency-Key")
    )).toEqual([
      "create-key",
      "update-key",
      "request-submit-key",
      "approve-key",
      "reject-key",
      "cancel-key",
      "close-key",
    ]);
    expect(calls.map(({ init }) => init?.method)).toEqual([
      "POST",
      "PUT",
      "POST",
      "POST",
      "POST",
      "POST",
      "POST",
    ]);
    const bodies = calls.map(({ init }) => JSON.parse(String(init?.body)));
    expect(bodies[0]).toEqual({ ...draft, remark: null });
    expect(bodies[2]).toEqual({ expected_version: 2 });
    expect(JSON.stringify(bodies)).not.toMatch(
      /tenant_id|actor_|open_amount|project_cost|available_to_request_amount|total_amount/,
    );
  });

  test("付款确认不允许夹带服务端事实", async () => {
    const calls = installSuccessFetch();
    const payload: SupplierPaymentConfirmInput = {
      id: "00000000-0000-4000-8000-000000000002",
      expected_version: 4,
      payment_method: "bank_transfer",
      payment_reference: "BANK-001",
      paid_at: "2026-07-31T10:00:00.000Z",
      evidence_images: ["supplier-payments/proof.png"],
      remark: null,
      allocations: [{
        payment_request_allocation_id: "allocation-1",
        payable_event_id: "payable-1",
        amount: "50.00",
      }],
    };

    const untrustedPayload = Object.assign({}, payload, {
      tenant_id: "tenant-evil",
      actor_employee_id: "employee-evil",
      open_amount: "999.00",
      allocations: payload.allocations.map((allocation) => ({
        ...allocation,
        available_to_request_amount: "999.00",
      })),
    }) as SupplierPaymentConfirmInput;

    await confirmSupplierPayment(
      REQUEST_ID,
      untrustedPayload,
      "payment-key",
    );

    expect(JSON.parse(String(calls[0]?.init?.body))).toEqual(payload);
    expect(new Headers(calls[0]?.init?.headers).get("Idempotency-Key"))
      .toBe("payment-key");
  });

  test("创建和更新草稿在请求前执行版本边界校验", () => {
    const calls = installSuccessFetch();
    const invalidCreate = {
      id: "request-1",
      project_id: "project-1",
      tenant_supplier_id: "relationship-1",
      expected_version: 1,
      reason: "无效创建",
      allocations: [{
        payable_event_id: "payable-1",
        requested_amount: "1.00",
      }],
    } as unknown as SupplierPaymentRequestDraftInput;
    const invalidUpdate: SupplierPaymentRequestUpdateDraftInput = {
      ...invalidCreate,
      expected_version: 0,
    };

    expect(() =>
      createSupplierPaymentRequestDraft(invalidCreate, "create-key")
    ).toThrow("新建付款申请草稿版本号必须为 0");
    expect(() =>
      updateSupplierPaymentRequestDraft(
        REQUEST_ID,
        invalidUpdate,
        "update-key",
      )
    ).toThrow("付款申请命令需要正整数版本号");
    expect(calls).toEqual([]);
  });

  test("所有已有资源命令拒绝非正安全整数版本", () => {
    const calls = installSuccessFetch();
    const invalidVersions = [0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1];

    for (const expected_version of invalidVersions) {
      const commands = [
        () => submitSupplierPaymentRequest(
          REQUEST_ID,
          { expected_version },
          "submit-key",
        ),
        () => approveSupplierPaymentRequest(
          REQUEST_ID,
          { expected_version, remark: null },
          "approve-key",
        ),
        () => rejectSupplierPaymentRequest(
          REQUEST_ID,
          { expected_version, remark: "驳回" },
          "reject-key",
        ),
        () => cancelSupplierPaymentRequest(
          REQUEST_ID,
          { expected_version, reason: "取消" },
          "cancel-key",
        ),
        () => closeSupplierPaymentRequest(
          REQUEST_ID,
          { expected_version, reason: "关闭" },
          "close-key",
        ),
        () => confirmSupplierPayment(REQUEST_ID, {
          id: "payment-1",
          expected_version,
          payment_method: "bank_transfer",
          payment_reference: "BANK-001",
          paid_at: "2026-07-31T10:00:00.000Z",
          evidence_images: ["supplier-payments/proof.png"],
          remark: null,
          allocations: [{
            payment_request_allocation_id: "allocation-1",
            payable_event_id: "payable-1",
            amount: "1.00",
          }],
        }, "payment-key"),
      ];
      for (const execute of commands) {
        expect(execute).toThrow("付款申请命令需要正整数版本号");
      }
    }

    expect(calls).toEqual([]);
  });
});

type FetchCall = { input: RequestInfo | URL; init?: RequestInit };

function installSuccessFetch() {
  const calls: FetchCall[] = [];
  globalThis.fetch = (async (
    input: RequestInfo | URL,
    init?: RequestInit,
  ) => {
    calls.push({ input, init });
    return new Response(JSON.stringify({ success: true, data: {} }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;
  return calls;
}
