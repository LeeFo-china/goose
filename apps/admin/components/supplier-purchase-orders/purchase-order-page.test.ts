import { existsSync, readFileSync } from "node:fs";
import { afterEach, describe, expect, test } from "bun:test";

import {
  confirmPurchaseOrderFulfillment,
  createPurchaseOrderReceipt,
  createPurchaseOrderShipment,
  loadPurchaseOrderFulfillment,
  loadPurchaseOrderReceipts,
  loadPurchaseOrderShipments,
} from "./purchase-order-fulfillment-api";
import {
  appendPageById,
  canCancelWithFulfillment,
  createLatestRequestGuard,
  refreshAfterCommand,
} from "./purchase-order-fulfillment-ui-state";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

function readSource(path: string) {
  const url = new URL(path, import.meta.url);
  expect(existsSync(url), path).toBe(true);
  return existsSync(url) ? readFileSync(url, "utf8") : "";
}

describe("供应商采购单页面边界", () => {
  test("按采购单查看权限注册导航和页面入口", () => {
    const menu = readSource("../layout/menu-config.ts");
    const page = readSource(
      "../../app/(console)/supplier-purchase-orders/page.tsx",
    );

    expect(menu).toContain('href: "/supplier-purchase-orders"');
    expect(menu).toContain('label: "采购单"');
    expect(menu).toContain('permission: "supplier.purchase-order.view"');
    expect(page).toContain(
      'permissions.has("supplier.purchase-order.view")',
    );
    expect(page).toContain(
      'permissions.has("supplier.purchase-order.manage")',
    );
    expect(page).toContain("canViewPurchaseOrders");
    expect(page).toContain("canManagePurchaseOrders");
  });

  test("工作区显式处理无权和只读状态", () => {
    const workspace = readSource("./purchase-order-workspace.tsx");

    expect(workspace).toContain("if (!canViewPurchaseOrders)");
    expect(workspace).toContain("canManagePurchaseOrders");
    expect(workspace).toContain("<StatusAlert>");
    expect(workspace).toContain("<PurchaseOrderEditor");
    expect(workspace).toContain("<PurchaseOrderDetail");
  });

  test("采购单页面只按采购申请管理权限提供申请入口", () => {
    const page = readSource(
      "../../app/(console)/supplier-purchase-orders/page.tsx",
    );
    const workspace = readSource("./purchase-order-workspace.tsx");
    const rules = readSource("./purchase-order-rules.ts");
    const list = readSource("./purchase-order-list.tsx");

    expect(page).toMatch(
      /permissions\.has\(\s*"supplier\.purchase-requisition\.manage"/,
    );
    expect(page).toContain("canManagePurchaseRequisitions");
    expect(workspace).toContain("href={creationEntry.href}");
    expect(workspace).toContain("{creationEntry.label}");
    expect(workspace).toContain("requisitionCreationEntry(");
    expect(workspace).not.toContain("newOrderId");
    expect(workspace).not.toContain("crypto.randomUUID()");
    expect(workspace).not.toContain("新建采购单");
    expect(rules).toContain("requisitionCreationEntry");
    expect(rules).toContain('href: "/supplier-purchase-requisitions?create=1"');
    expect(rules).toContain('label: "发起采购申请"');
    expect(list).not.toContain("或新建一张项目采购单");
  });

  test("采购单编辑器只接受现有草稿且不恢复直接创建路径", () => {
    const editor = readSource("./purchase-order-editor.tsx");
    const types = readSource("./purchase-order-types.ts");

    expect(editor).toContain("order: EditablePurchaseOrder;");
    expect(types).toMatch(
      /export type EditablePurchaseOrder = PurchaseOrderWithReferences & \{\s+status: "draft";\s+\};/,
    );
    expect(editor).not.toContain('"新建采购单"');
    expect(editor).not.toContain("setExpectedVersion(0)");
    expect(editor).not.toContain("if (!existingOrderId)");
  });

  test("保存接口只发送 SKU、数量和草稿头字段", () => {
    const api = readSource("./purchase-order-api.ts");
    const rules = readSource("./purchase-order-rules.ts");

    expect(api).toContain("/save-draft");
    expect(api).toContain('"Idempotency-Key"');
    expect(rules).toContain("toDraftPayload");
    expect(rules).not.toContain("unit_price:");
    expect(rules).not.toContain("tax_rate:");
    expect(rules).not.toContain("total_amount:");
  });

  test("采购单权限下分页加载选项并在保存后刷新服务端快照", () => {
    const api = readSource("./purchase-order-api.ts");
    const workspace = readSource("./purchase-order-workspace.tsx");
    const editor = readSource("./purchase-order-editor.tsx");

    expect(api).toContain("/supplier-purchase-order-project-options");
    expect(api).toContain("/supplier-purchase-order-supplier-options");
    expect(api).not.toContain('"/suppliers?page=1&pageSize=100"');
    expect(workspace).toContain("loadMoreProjects");
    expect(workspace).toContain("loadMoreSuppliers");
    expect(editor).toContain("加载更多项目");
    expect(editor).toContain("加载更多合作供应商");
    expect(editor).toContain("loadPurchaseOrderItems(existingOrderId)");
    expect(editor).toContain("catalogFactFromSnapshot(item)");
  });

  test("选项分页更新不会重新水合并覆盖未保存草稿", () => {
    const editor = readSource("./purchase-order-editor.tsx");

    expect(editor).toMatch(
      /const hydrateDraft = useCallback\([\s\S]+?\}, \[existingOrderId\]\);/,
    );
  });

  test("提交与取消在不确定重试时复用命令身份", () => {
    const detail = readSource("./purchase-order-detail.tsx");

    expect(detail).toContain("resolveSupplierCommandAttempt");
    expect(detail).toContain("nextAttempt.idempotencyKey");
    expect(detail).toContain("setCommandAttempt(null)");
    expect(detail).not.toContain("crypto.randomUUID()");
  });

  test("履约 API 暴露六个分页和幂等接口", () => {
    const api = readSource("./purchase-order-fulfillment-api.ts");

    expect(api).toContain(
      "/supplier-purchase-orders/${encodedOrderId}/fulfillment",
    );
    expect(api).toContain(
      "/supplier-purchase-orders/${encodedOrderId}/shipments",
    );
    expect(api).toContain(
      "/supplier-purchase-orders/${encodedOrderId}/receipts",
    );
    expect(api).toContain(
      "/supplier-purchase-orders/${encodedOrderId}/confirm-fulfillment",
    );
    expect(api).toContain("encodeURIComponent(orderId)");
    expect(api).toContain('pageSize: String(normalizedPageSize)');
    expect(api).toContain('headers: { "Idempotency-Key": idempotencyKey }');
    expect(api).toMatch(
      /confirmPurchaseOrderFulfillment[\s\S]*?fulfillmentCommand\([\s\S]*?confirm-fulfillment/,
    );
    expect(api).toMatch(
      /createPurchaseOrderShipment[\s\S]*?fulfillmentCommand\([\s\S]*?shipments/,
    );
    expect(api).toMatch(
      /createPurchaseOrderReceipt[\s\S]*?fulfillmentCommand\([\s\S]*?receipts/,
    );
  });

  test("履约 payload 不接受价格、税率或金额字段", () => {
    const rules = readSource("./purchase-order-fulfillment-rules.ts");

    expect(rules).not.toContain("unit_price:");
    expect(rules).not.toContain("tax_rate:");
    expect(rules).not.toContain("accepted_amount:");
    expect(rules).not.toContain("accepted_total_amount:");
  });

  test("六个履约 API 经过真实 backend client 保留编码、分页和幂等语义", async () => {
    const calls: Array<{ input: RequestInfo | URL; init?: RequestInit }> = [];
    globalThis.fetch = (async (input, init) => {
      calls.push({ input, init });
      return jsonResponse({ success: true, data: {} });
    }) as typeof fetch;
    const orderId = "order/id ?";
    const confirmPayload = {
      expected_version: 2,
      confirmed_at: "2026-07-30T02:00:00.000Z",
      remark: null,
    };
    const shipmentPayload = {
      id: "60000000-0000-4000-8000-000000000001",
      expected_fulfillment_version: 1,
      shipment_no: "SHIP-001",
      shipped_at: "2026-07-30T03:00:00.000Z",
      items: [{
        purchase_order_item_id:
          "60000000-0000-4000-8000-000000000002",
        quantity: 1,
      }],
    };
    const receiptPayload = {
      id: "60000000-0000-4000-8000-000000000003",
      expected_fulfillment_version: 2,
      receipt_no: "RCV-001",
      received_at: "2026-07-30T04:00:00.000Z",
      items: [{
        purchase_order_item_id:
          "60000000-0000-4000-8000-000000000002",
        accepted_quantity: 1,
        rejected_quantity: 0,
        variance_reason: null,
      }],
    };

    await loadPurchaseOrderFulfillment(orderId);
    await loadPurchaseOrderShipments(orderId, 0, 200);
    await loadPurchaseOrderReceipts(orderId, 2);
    await confirmPurchaseOrderFulfillment(orderId, confirmPayload, "key-1");
    await createPurchaseOrderShipment(orderId, shipmentPayload, "key-2");
    await createPurchaseOrderReceipt(orderId, receiptPayload, "key-3");

    expect(calls.map(({ input }) => String(input))).toEqual([
      "/api/backend/supplier-purchase-orders/order%2Fid%20%3F/fulfillment",
      "/api/backend/supplier-purchase-orders/order%2Fid%20%3F/shipments?page=1&pageSize=100",
      "/api/backend/supplier-purchase-orders/order%2Fid%20%3F/receipts?page=2&pageSize=20",
      "/api/backend/supplier-purchase-orders/order%2Fid%20%3F/confirm-fulfillment",
      "/api/backend/supplier-purchase-orders/order%2Fid%20%3F/shipments",
      "/api/backend/supplier-purchase-orders/order%2Fid%20%3F/receipts",
    ]);
    expect(calls.slice(0, 3).every(({ init }) => !init?.method)).toBe(true);
    expect(calls.slice(3).map(({ init }) => init?.method)).toEqual([
      "POST",
      "POST",
      "POST",
    ]);
    expect(calls.slice(3).map(({ init }) =>
      new Headers(init?.headers).get("Idempotency-Key")
    )).toEqual(["key-1", "key-2", "key-3"]);
    expect(calls.slice(3).map(({ init }) =>
      JSON.parse(String(init?.body))
    )).toEqual([confirmPayload, shipmentPayload, receiptPayload]);
  });

  test("履约 API 保留 backend client 的非 2xx 错误信息", async () => {
    globalThis.fetch = (async (
      _input: RequestInfo | URL,
      _init?: RequestInit,
    ) =>
      jsonResponse({
        success: false,
        message: "履约版本已变化",
        code: "SUPPLIER_PURCHASE_ORDER_FULFILLMENT_VERSION_CONFLICT",
      }, 409)) as typeof fetch;

    await expect(loadPurchaseOrderFulfillment("order-1")).rejects
      .toMatchObject({
        message: "履约版本已变化",
        status: 409,
        code: "SUPPLIER_PURCHASE_ORDER_FULFILLMENT_VERSION_CONFLICT",
      });
  });

  test("采购单详情窄屏只在表格区域横向滚动", () => {
    const detail = readSource("./purchase-order-detail.tsx");
    const panel = readSource("./purchase-order-fulfillment-panel.tsx");
    const summary = readSource("./purchase-order-fulfillment-summary.tsx");
    const tableScroll = 'containerClassName="min-w-0 max-w-full overflow-x-auto"';

    expect(detail).toContain("grid-cols-[minmax(0,1fr)]");
    expect(detail).toContain('<DialogFooter className="min-w-0 max-w-full">');
    expect(detail).toContain(tableScroll);
    expect(panel).toContain("min-w-0 max-w-full");
    expect(summary.split(tableScroll)).toHaveLength(3);
  });

  test("履约面板并行分页加载事实并覆盖加载失败空态和只读状态", () => {
    const panel = readSource("./purchase-order-fulfillment-panel.tsx");

    expect(panel).toContain('"use client"');
    expect(panel).toContain("Promise.all([");
    expect(panel).toContain("loadPurchaseOrderFulfillment(order.id)");
    expect(panel).toContain("loadPurchaseOrderShipments(order.id, 1, 20)");
    expect(panel).toContain("loadPurchaseOrderReceipts(order.id, 1, 20)");
    expect(panel).toContain("<Skeleton");
    expect(panel).toContain("<StatusAlert");
    expect(panel).toContain("<Empty");
    expect(panel).toContain("当前账号仅可查看履约事实");
    expect(panel).toContain("fulfillmentActions(");
  });

  test("供应商确认、发货和收货操作使用准确文案与点击时业务时间", () => {
    const panel = readSource("./purchase-order-fulfillment-panel.tsx");
    const shipment = readSource("./purchase-order-shipment-dialog.tsx");
    const receipt = readSource("./purchase-order-receipt-dialog.tsx");

    expect(panel).toContain("<AlertDialogTitle>记录供应商确认？</AlertDialogTitle>");
    expect(panel).toContain("租户员工代供应商录入");
    expect(panel).toContain('toast.success("供应商确认事实已记录")');
    expect(panel).toContain("expected_version: order.version");
    expect(panel).toMatch(
      /async function handleConfirm\(\)[\s\S]*?new Date\(\)\.toISOString\(\)/,
    );
    expect(panel).toMatch(
      /async function handleConfirm\(\)[\s\S]*?confirmed_at: confirmedAt/,
    );
    const openHandler = panel.match(
      /function handleConfirmOpen[\s\S]*?\n  }\n\n  return \(/,
    );
    expect(openHandler?.[0]).not.toContain("new Date().toISOString()");
    expect(shipment).toContain("<DialogTitle>登记采购发货</DialogTitle>");
    expect(shipment).toContain("shipmentRemaining(item)");
    expect(shipment).toContain("toShipmentPayload");
    expect(receipt).toContain("<DialogTitle>登记采购收货</DialogTitle>");
    expect(receipt).toContain("receiptRemaining(item)");
    expect(receipt).toContain("toReceiptPayload");
    for (const source of [panel, shipment, receipt]) {
      expect(source).toContain("beginFrozenCommand");
      expect(source).toContain("useFrozenCommandSession");
      expect(source).toContain('phase === "uncertain"');
      expect(source).toContain("markFrozenCommandInFlight");
      expect(source).toContain("activeCommand.payload");
      expect(source).toContain("activeCommand.attempt.idempotencyKey");
      expect(source).toContain("activeCommand.resourcePath");
      expect(source).toContain("clearFrozenCommand()");
    }
    expect(panel).toContain("confirmBusy || confirmCommand !== null");
    for (const source of [shipment, receipt]) {
      expect(source).toContain("fieldsLocked = busy || command !== null");
    }
  });

  test("履约汇总包含确认事实并以业务时间稳定倒序合并时间线", () => {
    const summary = readSource("./purchase-order-fulfillment-summary.tsx");

    expect(summary).toContain("ordered_quantity");
    expect(summary).toContain("accepted_quantity");
    expect(summary).toContain('kind: "confirmed"');
    expect(summary).toContain(
      "businessTime: detail.fulfillment.confirmed_at",
    );
    expect(summary).toContain("confirmed_by_employee_id");
    expect(summary).toContain("供应商已确认");
    expect(summary).toContain("businessTime");
    expect(summary).toContain(".sort(");
  });

  test("发货和收货头字段使用标准 FieldGroup 组合", () => {
    const shipment = readSource("./purchase-order-shipment-dialog.tsx");
    const receipt = readSource("./purchase-order-receipt-dialog.tsx");

    for (const source of [shipment, receipt]) {
      expect(source).toContain(
        '<FieldGroup className="grid gap-4 md:grid-cols-2">',
      );
      expect(source).not.toContain(
        '<div className="grid gap-4 md:grid-cols-2">',
      );
    }
  });

  test("取消采购单对履约加载失败和已开始履约 fail-closed", () => {
    expect(canCancelWithFulfillment({
      loaded: false,
      error: false,
      status: null,
    })).toBe(false);
    expect(canCancelWithFulfillment({
      loaded: false,
      error: true,
      status: null,
    })).toBe(false);
    expect(canCancelWithFulfillment({
      loaded: true,
      error: false,
      status: null,
    })).toBe(true);
    expect(canCancelWithFulfillment({
      loaded: true,
      error: false,
      status: "confirmed",
    })).toBe(true);
    expect(canCancelWithFulfillment({
      loaded: true,
      error: false,
      status: "partially_shipped",
    })).toBe(false);

    const detail = readSource("./purchase-order-detail.tsx");
    const panel = readSource("./purchase-order-fulfillment-panel.tsx");
    expect(detail).toContain("canCancelWithFulfillment(fulfillmentState)");
    expect(detail).toContain("!hasLoadedDetail");
    expect(panel).toContain("onLoadStateChange");
    expect(panel).toContain("order.version");
  });

  test("旧详情请求和旧履约请求完成时不能覆盖最新状态", () => {
    const guard = createLatestRequestGuard();
    const oldRequest = guard.start();
    const latestRequest = guard.start();
    const commits: string[] = [];
    if (oldRequest()) commits.push("old");
    if (latestRequest()) commits.push("latest");
    expect(commits).toEqual(["latest"]);
    guard.invalidate();
    expect(latestRequest()).toBe(false);

    const detail = readSource("./purchase-order-detail.tsx");
    const panel = readSource("./purchase-order-fulfillment-panel.tsx");
    for (const source of [detail, panel]) {
      expect(source).toContain("createLatestRequestGuard");
      expect(source).toContain("requestGuard.current.start()");
      expect(source).toContain("requestGuard.current.invalidate()");
    }
    expect(panel).toContain("if (!isLatest()) return false");
  });

  test("历史分页追加时按 ID 去重并采用下一页分页事实", () => {
    const appended = appendPageById({
      list: [{ id: "a" }, { id: "b" }],
      pagination: { page: 1, pageSize: 20, total: 3, totalPages: 2 },
    }, {
      list: [{ id: "b" }, { id: "c" }],
      pagination: { page: 2, pageSize: 20, total: 3, totalPages: 2 },
    });
    expect(appended).toEqual({
      list: [{ id: "a" }, { id: "b" }, { id: "c" }],
      pagination: { page: 2, pageSize: 20, total: 3, totalPages: 2 },
    });

    const panel = readSource("./purchase-order-fulfillment-panel.tsx");
    const summary = readSource("./purchase-order-fulfillment-summary.tsx");
    expect(panel).toContain("current.pagination.page + 1");
    expect(panel).toContain("appendPageById");
    expect(panel).toContain("historyRequestGuard.current.invalidate()");
    expect(panel).toContain("setHistoryBusy(null)");
    expect(summary).toContain("加载更多发货记录");
    expect(summary).toContain("加载更多收货记录");
    expect(summary).toContain("当前显示发货");
    expect(summary).toContain("当前显示收货");
  });

  test("命令成功后刷新失败不会回到命令 catch 重复提交", async () => {
    expect(await refreshAfterCommand(async () => true)).toBe(true);
    expect(await refreshAfterCommand(async () => {
      throw new Error("refresh failed");
    })).toBe(false);

    const panel = readSource("./purchase-order-fulfillment-panel.tsx");
    const shipment = readSource("./purchase-order-shipment-dialog.tsx");
    const receipt = readSource("./purchase-order-receipt-dialog.tsx");
    expect(panel).toContain("await refreshAfterCommand(handleSaved)");
    expect(panel).toMatch(
      /async function handleSaved\(\)[\s\S]*?await onOrderChanged\(\)[\s\S]*?return await reload\(\)/,
    );
    expect(panel).toContain("确认事实已提交，但刷新失败");
    expect(shipment).toContain("await refreshAfterCommand(onSaved)");
    expect(shipment).toContain("发货记录已提交，但刷新失败");
    expect(receipt).toContain("await refreshAfterCommand(onSaved)");
    expect(receipt).toContain("收货记录已提交，但刷新失败");
  });

  test("履约表单使用语义分组并关联错误描述", () => {
    const shipment = readSource("./purchase-order-shipment-dialog.tsx");
    const receipt = readSource("./purchase-order-receipt-dialog.tsx");
    for (const source of [shipment, receipt]) {
      expect(source).toContain("<FieldSet>");
      expect(source).toContain("<FieldLegend");
      expect(source).toContain("aria-describedby=");
    }
  });
});
function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}
