import { existsSync, readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";

function readSource(path: string) {
  const url = new URL(path, import.meta.url);
  expect(existsSync(url), path).toBe(true);
  return existsSync(url) ? readFileSync(url, "utf8") : "";
}

describe("平台技术服务履约页", () => {
  test("在平台运营导航中注册技术服务入口", () => {
    const source = readSource("../layout/menu-config.ts");

    expect(source).toContain('href: "/platform/service-orders"');
    expect(source).toContain('label: "技术服务"');
    expect(source).toContain('permission: "platform.service_order.read"');
  });

  test("页面按订单、工单和退款三类列表调用平台接口并保留分页", () => {
    const page = readSource(
      "../../app/(console)/platform/service-orders/page.tsx",
    );
    const rules = readSource("./platform-service-order-rules.ts");

    expect(page).toContain("platform.service_order.read");
    expect(page).toContain("platform.service_work_order.manage");
    expect(page).toContain("platform.service_refund.review");
    expect(page).toContain("/platform/billing/service-orders?");
    expect(page).toContain("/platform/billing/service-work-orders?");
    expect(page).toContain("/platform/billing/service-refund-requests?");
    expect(page).toContain("normalizePlatformListPageSize");
    expect(rules).toContain('query.set("page", String(input.page))');
    expect(rules).toContain('query.set("pageSize", String(input.pageSize))');
    expect(page).not.toContain("pageSize=100");
  });

  test("页面使用列表页壳、tabs 和同步骨架屏", () => {
    const page = readSource(
      "../../app/(console)/platform/service-orders/page.tsx",
    );
    const loading = readSource(
      "../../app/(console)/platform/service-orders/loading.tsx",
    );

    expect(page).toContain("PlatformListPageShell");
    expect(page).toContain("服务订单");
    expect(page).toContain("实施工单");
    expect(page).toContain("退款审核");
    expect(page).toContain('tableViewportTestId="platform-service-orders-table-viewport"');
    expect(loading).toContain("h-[calc(100vh-6.5625rem)]");
    expect(loading).toContain("flex flex-wrap gap-2");
    expect(loading).toContain("h-14 w-full");
  });

  test("三类表格展示关键履约事实和操作入口", () => {
    const source = [
      readSource("./platform-service-order-table.tsx"),
      readSource("./platform-service-order-shipping-action.tsx"),
      readSource("./platform-service-work-order-table.tsx"),
      readSource("./platform-service-refund-request-table.tsx"),
      readSource("./platform-service-work-order-actions.tsx"),
      readSource("./platform-service-refund-actions.tsx"),
    ].join("\n");

    for (const label of [
      "订单号",
      "租户",
      "套餐",
      "支付状态",
      "服务状态",
      "微信履约",
      "金额",
      "负责人",
      "工单状态",
      "退款状态",
      "审核退款",
      "记录履约",
      "推进状态",
      "重新上报微信履约",
    ]) {
      expect(source).toContain(label);
    }
    expect(source).toContain("PLATFORM_LIST_TABLE_ROW_HEIGHT_CLASS_NAME");
    expect(source).toContain("PlatformServiceOrderShippingAction");
    expect(source).toContain("/platform/billing/service-orders/");
    expect(source).toContain("/shipping-report/retry");
  });

  test("工单操作使用后端动作开关并按状态机过滤推进目标", () => {
    const actions = readSource("./platform-service-work-order-actions.tsx");
    const rules = readSource("./platform-service-order-rules.ts");

    expect(actions).toContain("workOrder.available_actions?.assign");
    expect(actions).toContain("workOrder.available_actions?.transition");
    expect(actions).toContain("disabled_reason");
    expect(actions).toContain("getWorkOrderNextStatusOptions(workOrder.status)");
    expect(rules).toContain("PLATFORM_SERVICE_WORK_ORDER_ALLOWED_TRANSITIONS");
    expect(rules).toContain("transition.from === status");
  });

  test("当前数量按真实列表长度展示，避免空页误报 pageSize", () => {
    const rules = readSource("./platform-service-order-rules.ts");

    expect(rules).toContain("return input.list.length;");
    expect(rules).not.toContain("input.list.length || input.pageSize");
  });
});
