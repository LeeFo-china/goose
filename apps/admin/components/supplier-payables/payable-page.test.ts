import { existsSync, readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";

import {
  appendPayablePage,
  beginPayableListRequest,
  buildPaymentRequestHref,
  nextPayableRetryAttempt,
  payableDateRange,
  payableLoadPolicy,
  resetPayableFilters,
} from "./use-payable-list";
import type { SupplierPayable, SupplierPayablePage } from "./payable-types";

function readSource(path: string) {
  const url = new URL(path, import.meta.url);
  expect(existsSync(url), path).toBe(true);
  return existsSync(url) ? readFileSync(url, "utf8") : "";
}

describe("供应商应付页面规则", () => {
  test("筛选变化回到第一页", () => {
    expect(resetPayableFilters({
      page: 4,
      projectId: "all",
      tenantSupplierId: "all",
      purchaseOrderId: "all",
      status: "all",
      dueFrom: "",
      dueTo: "",
    }, { status: "overdue" })).toEqual({
      page: 1,
      projectId: "all",
      tenantSupplierId: "all",
      purchaseOrderId: "all",
      status: "overdue",
      dueFrom: "",
      dueTo: "",
    });
  });

  test("payable-only 角色不依赖 supplier 或采购单权限", () => {
    expect(payableLoadPolicy({
      canView: true,
      canReadSettings: false,
      preflight: "unknown",
    })).toEqual({ shouldPreflightSettings: false, shouldLoadPayables: true });
    expect(payableLoadPolicy({
      canView: true,
      canReadSettings: true,
      preflight: "disabled",
    })).toEqual({ shouldPreflightSettings: false, shouldLoadPayables: false });
    expect(payableLoadPolicy({
      canView: false,
      canReadSettings: true,
      preflight: "unknown",
    })).toEqual({ shouldPreflightSettings: false, shouldLoadPayables: false });
  });

  test("新筛选请求开始即隔离旧页，失败时不残留可选行", () => {
    const stale = page([
      payable("00000000-0000-4000-8000-000000000001"),
    ], 3);
    expect(beginPayableListRequest(stale)).toEqual({
      list: [],
      pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 },
    });
  });

  test("上海时区日期筛选转换为浏览器本地日界", () => {
    const originalTimezone = process.env.TZ;
    process.env.TZ = "Asia/Shanghai";
    try {
      expect(payableDateRange("2026-07-31", "2026-07-31")).toEqual({
        due_from: "2026-07-30T16:00:00.000Z",
        due_to: "2026-07-31T15:59:59.999Z",
      });
    } finally {
      if (originalTimezone === undefined) delete process.env.TZ;
      else process.env.TZ = originalTimezone;
    }
  });

  test("非法本地日期和倒置范围 fail closed", () => {
    for (const value of ["bad", "2026-02-30", "2026-7-1"]) {
      expect(() => payableDateRange(value, "")).toThrow("无效的到期日期");
    }
    expect(() => payableDateRange("2026-08-01", "2026-07-31"))
      .toThrow("到期结束日期不能早于开始日期");
    expect(payableDateRange("", "")).toEqual({});
  });

  test("局部重试递增请求代次且不保留失败代次", () => {
    expect(nextPayableRetryAttempt(0)).toBe(1);
    expect(nextPayableRetryAttempt(3)).toBe(4);
  });

  test("加载更多稳定合并下一页且去重", () => {
    const current = page([payable("00000000-0000-4000-8000-000000000001")], 1);
    const next = page([
      payable("00000000-0000-4000-8000-000000000001"),
      payable("00000000-0000-4000-8000-000000000002"),
    ], 2);

    expect(appendPayablePage(current, next).list.map(({ id }) => id)).toEqual([
      "00000000-0000-4000-8000-000000000001",
      "00000000-0000-4000-8000-000000000002",
    ]);
    expect(appendPayablePage(current, next).pagination.page).toBe(2);
  });

  test("付款申请深链只携带最多一百个唯一 UUID，不携带金额", () => {
    const ids = Array.from({ length: 102 }, (_, index) =>
      `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`
    );
    const href = buildPaymentRequestHref([...ids, ids[0]!, "bad", "99.00"]);
    const url = new URL(href, "http://admin.local");

    expect(url.pathname).toBe("/supplier-payment-requests");
    expect(url.searchParams.get("create")).toBe("1");
    expect(url.searchParams.get("payableIds")?.split(",")).toHaveLength(100);
    expect(href).not.toContain("99.00");
  });
});

describe("供应商应付页面边界", () => {
  test("服务端页面 fail closed 传递查看权限", () => {
    const source = readSource("../../app/(console)/supplier-payables/page.tsx");
    expect(source).toContain('permissions.has("supplier.payable.view")');
    expect(source).not.toContain(
      'permissions.has("supplier.purchase-order.view")',
    );
  });

  test("无权限或模块关闭不加载应付并覆盖稳定状态", () => {
    const workspace = readSource("./payable-workspace.tsx");
    const hook = readSource("./use-payable-list.ts");
    const list = readSource("./payable-list.tsx");
    const loading = readSource(
      "../../app/(console)/supplier-payables/loading.tsx",
    );

    expect(workspace).toContain("if (!canView)");
    expect(workspace).toContain("SUPPLIER_MODULE_DISABLED");
    expect(hook).toContain("if (!canLoad) return");
    expect(hook).toContain("pageSize: 20");
    expect(hook).toContain("purchase_order_id");
    expect(workspace).toContain("clear()");
    expect(workspace).toContain("<StatusAlert");
    expect(list).toContain("<Empty");
    expect(list).toContain("<Skeleton");
    expect(loading).toContain("<Skeleton");
  });

  test("列表、选择、筛选、摘要和菜单契约完整", () => {
    const workspace = readSource("./payable-workspace.tsx");
    const list = readSource("./payable-list.tsx");
    const filters = readSource("./payable-filters.tsx");
    const summary = readSource("./payable-summary.tsx");
    const menu = readSource("../layout/menu-config.ts");

    expect(workspace).toContain("available_to_request_amount");
    expect(workspace).toContain("project_id");
    expect(workspace).toContain("tenant_supplier_id");
    expect(workspace).toContain("currency");
    expect(workspace).not.toContain("localStorage");
    expect(list).toContain("可申请");
    expect(list).toContain("采购/收货单");
    expect(list).toContain("record.project_name");
    expect(list).toContain("record.supplier_name");
    expect(list).toContain('className="min-w-[1480px]"');
    expect(list).toContain(
      'containerClassName="max-w-full overflow-x-auto"',
    );
    expect(list).not.toContain(
      'containerClassName="min-w-[1480px] overflow-x-auto"',
    );
    expect(filters).toContain("到期开始日期");
    expect(filters).toContain("采购单");
    expect(filters).toContain("全部状态");
    expect(summary).toContain("待付金额");
    expect(workspace).toContain("重试加载应付");
    expect(workspace).toContain("重试筛选项");
    expect(menu).toContain('href: "/supplier-payables"');
    expect(menu).toContain('permission: "supplier.payable.view"');
  });
});

function page(list: SupplierPayable[], current: number): SupplierPayablePage {
  return {
    list,
    pagination: {
      page: current,
      pageSize: 20,
      total: list.length,
      totalPages: 2,
    },
  };
}

function payable(id: string): SupplierPayable {
  return {
    id,
    project_id: "10000000-0000-4000-8000-000000000001",
    tenant_supplier_id: "20000000-0000-4000-8000-000000000001",
    supplier_id: "30000000-0000-4000-8000-000000000001",
    supplier_purchase_order_id: "40000000-0000-4000-8000-000000000001",
    receipt_id: "50000000-0000-4000-8000-000000000001",
    receipt_item_id: "60000000-0000-4000-8000-000000000001",
    project_name: "青山项目",
    supplier_name: "示例供应商",
    purchase_order_no: "PO-001",
    receipt_no: "RCV-001",
    invoice_required_before_payment: false,
    amount: "100.00",
    paid_amount: "20.00",
    reserved_amount: "30.00",
    open_amount: "80.00",
    available_to_request_amount: "50.00",
    currency: "CNY",
    occurred_at: "2026-07-01T00:00:00.000Z",
    due_at: "2026-07-31T00:00:00.000Z",
    status: "open",
  };
}
