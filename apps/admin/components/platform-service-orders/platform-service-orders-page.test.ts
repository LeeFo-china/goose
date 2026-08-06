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
      readSource("./platform-service-acceptance-preparation-action.tsx"),
      readSource("./platform-service-overdue-acceptance-action.tsx"),
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
      "提交验收",
      "平台确认验收",
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
    const actions = [
      readSource("./platform-service-work-order-actions.tsx"),
      readSource("./platform-service-acceptance-preparation-action.tsx"),
      readSource("./platform-service-overdue-acceptance-action.tsx"),
    ].join("\n");
    const rules = readSource("./platform-service-order-rules.ts");

    expect(actions).toContain("workOrder.available_actions?.assign");
    expect(actions).toContain("workOrder.available_actions?.transition");
    expect(actions).toContain("workOrder.available_actions?.confirm_overdue_acceptance");
    expect(actions).toContain("disabled_reason");
    expect(actions).toContain("getWorkOrderNextStatusOptions(workOrder.status)");
    expect(actions).toContain("/acceptance-preparation");
    expect(actions).toContain("/overdue-acceptance/confirm");
    expect(actions).toContain("workOrder.status === \"awaiting_acceptance\"");
    expect(rules).toContain("PLATFORM_SERVICE_WORK_ORDER_ALLOWED_TRANSITIONS");
    expect(rules).toContain("transition.from === status");
  });

  test("分配实施工单使用平台人员下拉选择而不是手填员工 ID", () => {
    const actions = readSource("./platform-service-work-order-actions.tsx");

    expect(actions).toContain("/platform/operators?page=1&pageSize=100&status=active");
    expect(actions).toContain("<Select");
    expect(actions).toContain("请选择负责人");
    expect(actions).toContain("assigneeEmployeeId");
    expect(actions).not.toContain("负责人员工 ID");
    expect(actions).not.toContain('name="assignee_employee_id"');
  });

  test("分配负责人列表加载不会被自身 loading 状态取消", () => {
    const actions = readSource("./platform-service-work-order-actions.tsx");

    expect(actions).toContain("}, [open, operatorsLoaded]);");
    expect(actions).toContain("hasSelectedAssigneeOption");
    expect(actions).toContain("当前负责人（历史记录）");
    expect(actions).not.toContain("[loadingOperators, open, operatorLoadError, operatorsLoaded]");
  });

  test("客户验收列优先按验收状态展示，已验收不能显示确认中", () => {
    const table = readSource("./platform-service-work-order-table.tsx");

    expect(table).toContain("getAcceptancePreparationStatusMeta");
    expect(table).toContain('case "accepted"');
    expect(table).toContain('label: "已验收"');
    expect(table).toContain('case "rejected"');
    expect(table).toContain('label: "已退回整改"');
    expect(table).toContain('acceptance.status');
    expect(table).toContain("acceptance.acceptance_overdue");
  });

  test("当前数量按真实列表长度展示，避免空页误报 pageSize", () => {
    const rules = readSource("./platform-service-order-rules.ts");

    expect(rules).toContain("return input.list.length;");
    expect(rules).not.toContain("input.list.length || input.pageSize");
  });

  test("记录履约附件使用直传上传而不是手工粘贴 file_id", () => {
    const source = [
      readSource("./platform-service-work-order-actions.tsx"),
      readSource("./platform-service-fulfillment-attachment-upload-field.tsx"),
    ].join("\n");

    expect(source).toContain("tenant_service_fulfillment_attachment");
    expect(source).toContain("uploadDirectToCos");
    expect(source).toContain("履约附件");
    expect(source).not.toContain("附件 file_id");
    expect(source).not.toContain('name="file_ids"');
  });
});
