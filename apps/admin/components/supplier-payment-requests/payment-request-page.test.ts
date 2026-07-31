import { existsSync, readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";

import {
  applyPaymentRequestCommand,
  paymentRequestCreatedDateRange,
  paymentRequestConflictMessage,
  readPaymentRequestWorkspaceState,
  validateDraftPayables,
} from "./payment-request-page-utils";
import * as paymentRequestUtils from "./payment-request-page-utils";
import type { SupplierPayable } from "../supplier-payables/payable-types";
import type {
  SupplierPaymentRequest,
  SupplierPaymentRequestDetail,
} from "./payment-request-types";

const ID = (index: number) =>
  `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`;

function readSource(path: string) {
  const url = new URL(path, import.meta.url);
  expect(existsSync(url), path).toBe(true);
  return existsSync(url) ? readFileSync(url, "utf8") : "";
}

describe("供应商付款申请页面规则", () => {
  test("deep link accepts only one to one hundred unique UUIDs", () => {
    const ids = Array.from({ length: 100 }, (_, index) => ID(index));
    expect(readPaymentRequestWorkspaceState(new URLSearchParams({
      create: "1",
      payableIds: ids.join(","),
    })).payableIds).toEqual(ids);
    for (const payableIds of [
      "",
      "bad",
      `${ID(1)},${ID(1).toUpperCase()}`,
      [...ids, ID(101)].join(","),
    ]) {
      expect(() => readPaymentRequestWorkspaceState(new URLSearchParams({
        create: "1",
        payableIds,
      }))).toThrow("应付深链");
    }
  });

  test("batch facts must exactly match IDs, scope and available balance", () => {
    const first = payable(1);
    const second = payable(2);
    expect(validateDraftPayables([first.id, second.id], [second, first]))
      .toEqual([first, second]);
    expect(() => validateDraftPayables([first.id], [])).toThrow("重新选择");
    expect(() => validateDraftPayables(
      [first.id, second.id],
      [first, { ...second, project_id: ID(99) }],
    )).toThrow("同一项目");
    expect(() => validateDraftPayables(
      [first.id],
      [{ ...first, available_to_request_amount: "0.00" }],
    )).toThrow("可申请余额");
  });

  test("existing draft lines merge fresh available balance by payable event id", () => {
    const merge = Reflect.get(
      paymentRequestUtils,
      "mergePaymentRequestDraftLines",
    );
    expect(typeof merge).toBe("function");
    if (typeof merge !== "function") return;
    const fresh = payable(1);
    fresh.available_to_request_amount = "40.00";
    const detail = requestDetail({
      payable_event_id: fresh.id,
      payable_amount: "999.00",
      requested_amount: "30.00",
    });

    expect(merge(detail, [fresh])).toEqual([expect.objectContaining({
      payableEventId: fresh.id,
      available: "40.00",
      amount: "30.00",
      source: "PO-001 / RCV-1",
    })]);
    expect(() => merge(detail, [payable(2)])).toThrow("重新选择");
    const wrongScopeDetail = requestDetail({ payable_event_id: fresh.id });
    wrongScopeDetail.payment_request.project_id = ID(999);
    expect(() => merge(wrongScopeDetail, [fresh])).toThrow("申请范围");
  });

  test("four deterministic save conflicts require facts reload", () => {
    const recovery = Reflect.get(
      paymentRequestUtils,
      "paymentRequestSaveFailureKind",
    );
    expect(typeof recovery).toBe("function");
    if (typeof recovery !== "function") return;
    for (const code of [
      "SUPPLIER_PAYMENT_REQUEST_VERSION_CONFLICT",
      "SUPPLIER_PAYABLE_AMOUNT_UNAVAILABLE",
      "SUPPLIER_PAYMENT_ALLOCATION_INVALID",
      "SUPPLIER_PAYMENT_REQUEST_STATE_CONFLICT",
    ]) {
      expect(recovery(code)).toBe("reload_facts");
    }
    expect(recovery("NETWORK_UNCERTAIN")).toBe("retry_same_attempt");
    expect(recovery(undefined, 503)).toBe("retry_same_attempt");
    expect(recovery("VALIDATION_FAILED", 400)).toBe("release_attempt");
  });

  test("command result is applied before related read models refresh", () => {
    const current = request({ version: 2, status: "pending_approval" });
    const next = request({ version: 3, status: "approved" });
    expect(applyPaymentRequestCommand([current], current, next)).toEqual({
      list: [next],
      detail: next,
      refresh: {
        refreshPayables: true,
        refreshRequests: true,
        refreshRequestDetail: true,
        refreshPurchaseOrderSummary: true,
        refreshProjectFinance: true,
      },
    });
  });

  test("version and balance conflicts require an explicit refresh", () => {
    for (const code of [
      "SUPPLIER_PAYMENT_REQUEST_VERSION_CONFLICT",
      "SUPPLIER_PAYMENT_REQUEST_STATE_CONFLICT",
      "SUPPLIER_PAYABLE_AMOUNT_UNAVAILABLE",
    ]) {
      expect(paymentRequestConflictMessage(code)).toContain("刷新");
    }
  });

  test("created date filters use strict browser-local day boundaries", () => {
    const originalTimezone = process.env.TZ;
    process.env.TZ = "Asia/Shanghai";
    try {
      expect(paymentRequestCreatedDateRange("2026-07-31", "2026-07-31"))
        .toEqual({
          created_from: "2026-07-30T16:00:00.000Z",
          created_to: "2026-07-31T15:59:59.999Z",
        });
    } finally {
      if (originalTimezone === undefined) delete process.env.TZ;
      else process.env.TZ = originalTimezone;
    }
    expect(() => paymentRequestCreatedDateRange("2026-02-30", ""))
      .toThrow("无效的创建日期");
    expect(() => paymentRequestCreatedDateRange("2026-08-01", "2026-07-31"))
      .toThrow("创建结束日期不能早于开始日期");
  });
});

describe("供应商付款申请页面边界", () => {
  test("page fails closed across all four permissions", () => {
    const source = readSource("../../app/(console)/supplier-payment-requests/page.tsx");
    expect(source).toContain('permissions.has("supplier.payment-request.view")');
    expect(source).toContain('permissions.has("supplier.payment-request.manage")');
    expect(source).toContain('permissions.has("supplier.payment-request.approve")');
    expect(source).toContain('permissions.has("supplier.payment-request.pay")');
  });

  test("workspace has pagination, batch facts, pending lock and refresh handling", () => {
    const workspace = readSource("./payment-request-workspace.tsx");
    const editor = readSource("./payment-request-editor.tsx");
    const detail = readSource("./payment-request-detail.tsx");
    const review = readSource("./payment-request-review-dialog.tsx");
    const menu = readSource("../layout/menu-config.ts");
    const payableHook = readSource("../supplier-payables/use-payable-list.ts");
    expect(workspace).toContain("pageSize: 20");
    expect(workspace).toContain("listSupplierPayablesByIds");
    expect(workspace).not.toContain("listSupplierPayables(");
    expect(workspace).toContain("openEditorFromDetail");
    expect(workspace).toContain("reloadEditorFacts");
    expect(workspace).toContain("getSupplierPaymentRequest");
    expect(workspace).toContain("supplierPaymentCommandRefresh()");
    expect(editor).toContain("expected_version");
    expect(editor).toContain("resolveSupplierCommandAttempt");
    expect(editor).toContain("amount > moneyCents(line.available)");
    expect(editor).toContain("mergePaymentRequestDraftLines");
    expect(editor).not.toContain("available: allocation.payable_amount");
    expect(editor).toContain("await onReloadFacts");
    expect(editor).toContain("使用相同请求身份重试保存");
    expect(editor).toContain("重试刷新申请与应付事实");
    expect(editor).toContain("}, [open, request?.id]);");
    expect(editor).toContain('status !== "draft"');
    expect(editor).toContain("onInvalidated");
    const reloadSource = workspace.slice(
      workspace.indexOf("async function reloadEditorFacts"),
    );
    const statusGuardIndex = reloadSource.indexOf('status !== "draft"');
    const batchIndex = reloadSource.indexOf("listSupplierPayablesByIds(ids)");
    expect(statusGuardIndex).toBeGreaterThan(-1);
    expect(batchIndex).toBeGreaterThan(statusGuardIndex);
    expect(editor).toContain("if (saved) onPendingChange(null)");
    expect(detail).toContain("pendingRequestId");
    expect(detail).toContain("supplierPaymentCommandRefresh()");
    expect(detail).toContain("刷新最新数据");
    expect(review).toContain("驳回原因");
    expect(review).toContain("取消原因");
    expect(review).toContain("关闭原因");
    expect(review).toContain("payable_event_id");
    expect(review).toContain("supplier_purchase_order_id");
    expect(review).toContain("receipt_id");
    expect(review).toContain("AllocationFact");
    expect(review).not.toContain(
      "shortPaymentId(allocation.payable_event_id)",
    );
    expect(payableHook).toContain('"supplier-payment-command"');
    expect(menu).toContain('href: "/supplier-payment-requests"');
    expect(menu).toContain('permission: "supplier.payment-request.view"');
  });

  test("list hides pay until detail resolves invoice gate", () => {
    const list = readSource("./payment-request-list.tsx");
    expect(list).not.toContain("invoiceBlocked: false");
    expect(list).toContain("invoiceBlocked: null");
  });

  test("filters reuse bounded payable filter options instead of raw UUID inputs", () => {
    const page = readSource("../../app/(console)/supplier-payment-requests/page.tsx");
    const workspace = readSource("./payment-request-workspace.tsx");
    const optionsHook = readSource("./use-payment-request-filter-options.ts");
    const filters = readSource("./payment-request-filters.tsx");
    expect(optionsHook).toContain("listSupplierPayableFilterOptions");
    expect(optionsHook).toContain("pageSize: PAGE_SIZE");
    expect(optionsHook).toContain("PAGE_SIZE = 20");
    expect(filters).toContain("FormSelect");
    expect(filters).not.toContain("项目 ID");
    expect(filters).not.toContain("供应商关系 ID");
    expect(page).toContain('permissions.has("supplier.payable.view")');
    expect(workspace).toContain("canViewPayables");
  });

  test("payment history page changes reload without resetting back to page one", () => {
    const detail = readSource("./payment-request-detail.tsx");
    expect(detail).toContain("}, [open, recordId]);");
    expect(detail).toContain("}, [open, reload]);");
    expect(detail).not.toContain("}, [open, recordId, reload]);");
  });

  test("successful payment keeps its payment number visible while detail refreshes", () => {
    const dialog = readSource("./payment-dialog.tsx");
    expect(dialog).toContain("const requestId = request?.payment_request.id");
    expect(dialog).toContain("}, [open, requestId]);");
    expect(dialog).toContain("状态版本");
    expect(dialog).toContain("申请金额");
  });

  test("detail shows a status timeline with terminal reasons", () => {
    const content = readSource("./payment-request-detail-content.tsx");
    expect(content).toContain("状态时间线");
    expect(content).toContain("review_remark");
    expect(content).toContain("cancel_reason");
    expect(content).toContain("close_reason");
  });
});

function payable(index: number): SupplierPayable {
  return {
    id: ID(index),
    project_id: ID(201),
    tenant_supplier_id: ID(202),
    supplier_id: ID(203),
    supplier_purchase_order_id: ID(204),
    receipt_id: ID(205 + index),
    receipt_item_id: ID(305 + index),
    project_name: "青山项目",
    supplier_name: "示例供应商",
    purchase_order_no: "PO-001",
    receipt_no: `RCV-${index}`,
    invoice_required_before_payment: false,
    amount: "100.00",
    paid_amount: "0.00",
    reserved_amount: "0.00",
    open_amount: "100.00",
    available_to_request_amount: "100.00",
    currency: "CNY",
    occurred_at: "2026-07-01T00:00:00.000Z",
    due_at: "2026-08-01T00:00:00.000Z",
    status: "open",
  };
}

function request(
  input: Pick<SupplierPaymentRequest, "status" | "version">,
): SupplierPaymentRequest {
  return {
    id: ID(401), tenant_id: ID(402), project_id: ID(201),
    tenant_supplier_id: ID(202), supplier_id: ID(203), request_no: "PAY-001",
    currency: "CNY", requested_amount: "100.00", paid_amount: "0.00",
    reason: "材料款", remark: null, submitted_by_employee_id: null,
    submitted_at: null, reviewed_by_employee_id: null, reviewed_at: null,
    review_remark: null, cancelled_by_employee_id: null, cancelled_at: null,
    cancel_reason: null, closed_by_employee_id: null, closed_at: null,
    close_reason: null, created_by_employee_id: ID(403),
    updated_by_employee_id: ID(403), created_at: "2026-07-31T00:00:00.000Z",
    updated_at: "2026-07-31T00:00:00.000Z", ...input,
  };
}

function requestDetail(
  allocation: Partial<SupplierPaymentRequestDetail["allocations"][number]>,
): SupplierPaymentRequestDetail {
  return {
    payment_request: request({ status: "draft", version: 1 }),
    allocations: [{
      id: ID(501),
      payable_event_id: ID(1),
      requested_amount: "30.00",
      paid_amount: "0.00",
      payable_amount: "100.00",
      due_at: "2026-08-01T00:00:00.000Z",
      supplier_purchase_order_id: ID(204),
      receipt_id: ID(206),
      receipt_item_id: ID(306),
      invoice_required_before_payment: false,
      ...allocation,
    }],
  };
}
