import { afterEach, describe, expect, test } from "bun:test";

import type {
  SupplierCommandAttempt,
  SupplierResourceCommandAttempt,
} from "@/components/supplier-products/supplier-command-attempt";

import {
  cancelRequisition,
  convertRequisition,
  createRequisitionDraft,
  loadRequisition,
  loadRequisitionCatalog,
  loadRequisitionCostCategories,
  loadRequisitionItems,
  loadRequisitionProjects,
  loadRequisitionRelationships,
  loadRequisitions,
  reviewRequisition,
  submitRequisition,
  updateRequisitionDraft,
} from "./requisition-api";
import type {
  RequisitionCreateDraftInput,
  RequisitionDraftInput,
  RequisitionDraftItemInput,
  RequisitionUpdateDraftInput,
} from "./requisition-types";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

type Equal<Left, Right> =
  (<Value>() => Value extends Left ? 1 : 2) extends
    (<Value>() => Value extends Right ? 1 : 2)
    ? true
    : false;
type Assert<Condition extends true> = Condition;
type DraftInputKeys = Assert<Equal<
  keyof RequisitionDraftInput,
  | "project_id"
  | "tenant_supplier_id"
  | "expected_version"
  | "reason"
  | "expected_delivery_date"
  | "remark"
  | "items"
>>;
type DraftItemKeys = Assert<Equal<
  keyof RequisitionDraftItemInput,
  "supplier_sku_id" | "cost_category_id" | "quantity"
>>;
const draftInputKeysAreStrict: DraftInputKeys = true;
const draftItemKeysAreStrict: DraftItemKeys = true;

describe("采购申请 API 契约", () => {
  test("列表使用后端 snake_case 筛选和固定二十条分页", async () => {
    const calls = installSuccessFetch();

    await loadRequisitions(0, {
      keyword: "水 泥",
      status: "pending_approval",
      budget_status: "over_budget",
      project_id: "project/id",
      tenant_supplier_id: "relationship id",
    });

    const url = new URL(String(calls[0]?.input), "http://admin.local");
    expect(url.pathname).toBe(
      "/api/backend/supplier-purchase-requisitions",
    );
    expect(Object.fromEntries(url.searchParams)).toEqual({
      page: "1",
      pageSize: "20",
      keyword: "水 泥",
      status: "pending_approval",
      budget_status: "over_budget",
      project_id: "project/id",
      tenant_supplier_id: "relationship id",
    });
  });

  test("详情和明细编码 ID 且明细分页最大一百条", async () => {
    const calls = installSuccessFetch();
    const requisitionId = "request/id ?";

    await loadRequisition(requisitionId);
    await loadRequisitionItems(requisitionId, 0, 200);

    expect(calls.map(({ input }) => String(input))).toEqual([
      "/api/backend/supplier-purchase-requisitions/request%2Fid%20%3F",
      "/api/backend/supplier-purchase-requisitions/request%2Fid%20%3F/items?page=1&pageSize=100",
    ]);
  });

  test("项目供应商目录和成本分类都使用受限分页 client API", async () => {
    const calls = installSuccessFetch();

    await loadRequisitionProjects(0, "项目 A");
    await loadRequisitionRelationships(2, "供应商 B");
    await loadRequisitionCatalog("relationship/id", 3, "SKU C");
    await loadRequisitionCostCategories(0);

    expect(calls.map(({ input }) => String(input))).toEqual([
      "/api/backend/supplier-purchase-requisition-project-options?page=1&pageSize=100&keyword=%E9%A1%B9%E7%9B%AE+A",
      "/api/backend/supplier-purchase-requisition-supplier-options?page=2&pageSize=100&keyword=%E4%BE%9B%E5%BA%94%E5%95%86+B",
      "/api/backend/supplier-purchase-requisition-catalog?tenantSupplierId=relationship%2Fid&page=3&pageSize=20&keyword=SKU+C",
      "/api/backend/supplier-purchase-requisition-cost-categories?page=1&pageSize=100&status=active",
    ]);
  });

  test("六类 mutation 使用 POST、冻结幂等键和严格 body", async () => {
    const calls = installSuccessFetch();
    const attempt = (scope: string): SupplierCommandAttempt => ({
      fingerprint: `${scope}-intent`,
      idempotencyKey: `requisition:${scope}-key`,
    });
    const createAttempt: SupplierResourceCommandAttempt = {
      fingerprint: "create-intent",
      idempotencyKey: "requisition:create-key",
      resourceId: "created-request-id",
    };
    const updateAttempt = attempt("update");
    const submitAttempt = attempt("submit");
    const reviewAttempt = attempt("review");
    const cancelAttempt = attempt("cancel");
    const convertAttempt: SupplierResourceCommandAttempt = {
      fingerprint: "convert-intent",
      idempotencyKey: "requisition:convert-key",
      resourceId: "purchase-order-id",
    };
    const createDraft: RequisitionCreateDraftInput = {
      project_id: "project-1",
      tenant_supplier_id: "relationship-1",
      expected_version: 0,
      reason: "现场临时补料",
      expected_delivery_date: null,
      remark: null,
      items: [{
        supplier_sku_id: "sku-1",
        cost_category_id: "category-1",
        quantity: "2.5000",
      }],
    };
    const updateDraft: RequisitionUpdateDraftInput = {
      ...createDraft,
      expected_version: 1,
      remark: "调整数量",
    };

    await createRequisitionDraft(createDraft, createAttempt);
    await createRequisitionDraft(createDraft, createAttempt);
    await updateRequisitionDraft(
      "request/id",
      updateDraft,
      updateAttempt,
    );
    await submitRequisition(
      "request/id",
      { expected_version: 1 },
      submitAttempt,
    );
    await reviewRequisition("request/id", {
      expected_version: 2,
      action: "approve",
      remark: "同意",
    }, reviewAttempt);
    await cancelRequisition("request/id", {
      expected_version: 2,
      reason: "需求取消",
    }, cancelAttempt);
    await convertRequisition(
      "request/id",
      { expected_version: 3 },
      convertAttempt,
    );
    await submitRequisition(
      "request/id",
      { expected_version: 1 },
      submitAttempt,
    );

    expect(calls.map(({ init }) => init?.method)).toEqual(
      Array(8).fill("POST"),
    );
    expect(calls.map(({ init }) =>
      new Headers(init?.headers).get("Idempotency-Key")
    )).toEqual([
      createAttempt.idempotencyKey,
      createAttempt.idempotencyKey,
      updateAttempt.idempotencyKey,
      submitAttempt.idempotencyKey,
      reviewAttempt.idempotencyKey,
      cancelAttempt.idempotencyKey,
      convertAttempt.idempotencyKey,
      submitAttempt.idempotencyKey,
    ]);
    expect(calls.map(({ input }) => String(input))).toEqual([
      "/api/backend/supplier-purchase-requisitions/created-request-id/save-draft",
      "/api/backend/supplier-purchase-requisitions/created-request-id/save-draft",
      "/api/backend/supplier-purchase-requisitions/request%2Fid/save-draft",
      "/api/backend/supplier-purchase-requisitions/request%2Fid/submit",
      "/api/backend/supplier-purchase-requisitions/request%2Fid/review",
      "/api/backend/supplier-purchase-requisitions/request%2Fid/cancel",
      "/api/backend/supplier-purchase-requisitions/request%2Fid/convert",
      "/api/backend/supplier-purchase-requisitions/request%2Fid/submit",
    ]);
    const bodies = calls.map(({ init }) => JSON.parse(String(init?.body)));
    expect(bodies).toEqual([
      createDraft,
      createDraft,
      updateDraft,
      { expected_version: 1 },
      { expected_version: 2, action: "approve", remark: "同意" },
      { expected_version: 2, reason: "需求取消" },
      {
        expected_version: 3,
        purchase_order_id: convertAttempt.resourceId,
      },
      { expected_version: 1 },
    ]);
    expect(calls[0]).toEqual(calls[1]);
    expect(JSON.stringify(bodies.slice(0, 3))).not.toMatch(
      /unit_price|tax_rate|amount/,
    );
    expect(draftInputKeysAreStrict).toBe(true);
    expect(draftItemKeysAreStrict).toBe(true);
  });

  test("更新草稿在发请求前拒绝非正版本", () => {
    const calls = installSuccessFetch();
    const attempt: SupplierCommandAttempt = {
      fingerprint: "invalid-update",
      idempotencyKey: "requisition:invalid-update",
    };
    const invalidDraft: RequisitionUpdateDraftInput = {
      project_id: "project-1",
      tenant_supplier_id: "relationship-1",
      expected_version: 0,
      reason: "无效更新",
      items: [{
        supplier_sku_id: "sku-1",
        cost_category_id: "category-1",
        quantity: "1",
      }],
    };

    expect(() =>
      updateRequisitionDraft("request-1", invalidDraft, attempt)
    ).toThrow("更新采购申请草稿需要正整数版本号");
    expect(calls).toEqual([]);
  });

  test("保留 backend client 返回的状态、错误码和请求编号", async () => {
    globalThis.fetch = (async () =>
      jsonResponse({
        success: false,
        message: "采购申请版本已变化",
        code: "SUPPLIER_PURCHASE_REQUISITION_VERSION_CONFLICT",
        requestId: "request-trace-id",
      }, 409)) as unknown as typeof fetch;

    await expect(loadRequisition("request-1")).rejects.toMatchObject({
      message: "采购申请版本已变化",
      status: 409,
      code: "SUPPLIER_PURCHASE_REQUISITION_VERSION_CONFLICT",
      requestId: "request-trace-id",
    });
  });
});

type FetchCall = { input: RequestInfo | URL; init?: RequestInit };

function installSuccessFetch(): FetchCall[] {
  const calls: FetchCall[] = [];
  globalThis.fetch = (async (input, init) => {
    calls.push({ input, init });
    return jsonResponse({ success: true, data: {} });
  }) as typeof fetch;
  return calls;
}

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}
