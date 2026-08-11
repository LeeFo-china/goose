import { existsSync, readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";

function readSource(path: string) {
  const url = new URL(path, import.meta.url);
  expect(existsSync(url), path).toBe(true);
  return existsSync(url) ? readFileSync(url, "utf8") : "";
}

describe("平台技术服务试用管理页", () => {
  test("注册第四个试用管理 Tab 并使用独立分页和筛选参数", () => {
    const page = readSource(
      "../../app/(console)/platform/service-orders/page.tsx",
    );
    const orderRules = readSource(
      "../platform-service-orders/platform-service-order-rules.ts",
    );
    const trialRules = readSource("./platform-service-trial-rules.ts");

    expect(page).toContain("试用管理");
    expect(orderRules).toContain('"trials"');
    expect(page).toContain("trialPage");
    expect(page).toContain("trialPageSize");
    expect(page).toContain("trialKeyword");
    expect(page).toContain("trialStatus");
    expect(page).toContain("trialSource");
    expect(page).toContain("trialType");
    expect(trialRules).toContain('query.set("page", String(input.page))');
    expect(trialRules).toContain('query.set("pageSize", String(input.pageSize))');
    expect(page).not.toContain("pageSize=100");
  });

  test("按读写权限加载列表概览并控制主动开通和规则入口", () => {
    const page = readSource(
      "../../app/(console)/platform/service-orders/page.tsx",
    );

    expect(page).toContain('platform.service_trial.read');
    expect(page).toContain('platform.service_trial.manage');
    expect(page).toContain('platform.service_trial.override');
    expect(page).toContain("/platform/billing/service-trials?");
    expect(page).toContain("/platform/billing/service-trials/summary");
    expect(page).toContain("Promise.all");
    expect(page).toContain("canGrantTrial");
    expect(page).toContain("canUpdateTrialPolicy");
    expect(page).toContain("disabledReason");
  });

  test("展示四项紧凑指标和完整筛选工具栏", () => {
    const page = readSource(
      "../../app/(console)/platform/service-orders/page.tsx",
    );
    const filters = readSource("./platform-service-trial-filters.tsx");

    for (const label of ["待审核", "试用中", "7 天内到期", "本月转正式"]) {
      expect(page).toContain(label);
    }
    for (const label of [
      "企业名称、联系人或手机号",
      "状态",
      "来源",
      "类型",
      "跟进人",
      "申请开始",
      "申请结束",
      "到期开始",
      "到期结束",
    ]) {
      expect(filters).toContain(label);
    }
    expect(filters).toContain('name="trialPageSize"');
  });

  test("表格支持空态、分页和键盘打开右侧详情", () => {
    const table = readSource("./platform-service-trial-table.tsx");
    const detail = readSource("./platform-service-trial-detail.tsx");

    for (const label of [
      "装企",
      "申请来源",
      "试用类型",
      "申请时间",
      "试用周期",
      "剩余时间",
      "状态",
      "跟进人",
      "转化状态",
      "操作",
    ]) {
      expect(table).toContain(label);
    }
    expect(table).toContain("PlatformServiceTrialDetail");
    expect(table).toContain("PLATFORM_LIST_TABLE_ROW_HEIGHT_CLASS_NAME");
    expect(table).toContain("当前筛选条件下没有技术服务试用记录");
    expect(detail).toContain("SheetContent");
    expect(detail).toContain("SheetTitle");
    expect(detail).toContain("/platform/billing/service-trials/${trial.id}");
  });

  test("详情按企业、申请、范围、期限和审计顺序展示", () => {
    const detail = readSource("./platform-service-trial-detail.tsx");
    const enterprise = detail.indexOf("企业概况");
    const application = detail.indexOf("申请信息");
    const scope = detail.indexOf("试用范围");
    const dates = detail.indexOf("试用期限");
    const audit = detail.indexOf("审计时间线");

    expect(enterprise).toBeGreaterThan(-1);
    expect(application).toBeGreaterThan(enterprise);
    expect(scope).toBeGreaterThan(application);
    expect(dates).toBeGreaterThan(scope);
    expect(audit).toBeGreaterThan(dates);
    expect(detail).toContain("Skeleton");
    expect(detail).toContain("StatusAlert");
  });

  test("动作由后端 available_actions 控制并解释禁用原因", () => {
    const detail = readSource("./platform-service-trial-detail.tsx");
    const actions = readSource("./platform-service-trial-action-dialog.tsx");

    expect(detail).toContain("available_actions");
    expect(detail).toContain("disabled_reason");
    expect(actions).toContain("DialogTitle");
    expect(actions).toContain("action.enabled");
    expect(actions).toContain("action.disabled_reason");
    expect(actions).toContain("review");
    expect(actions).toContain("extend");
    expect(actions).toContain("revoke");
    expect(actions).toContain("assign");
  });

  test("提交期间按钮不跳动，成功刷新列表和详情，失败保留表单", () => {
    const actions = readSource("./platform-service-trial-action-dialog.tsx");
    const policy = readSource("./platform-service-trial-policy-dialog.tsx");
    const source = `${actions}\n${policy}`;

    expect(source).toContain("Spinner");
    expect(source).toContain("invisible");
    expect(source).toContain("requestBackendJson");
    expect(source).toContain("toast.success");
    expect(source).toContain("toast.error");
    expect(actions).toContain("onTrialUpdated");
    expect(source).toContain("router.refresh()");
    expect(source).toContain("finally");
    expect(source).not.toContain("window.confirm");
  });

  test("试用规则展示影响边界并使用后端权限动作", () => {
    const policy = readSource("./platform-service-trial-policy-dialog.tsx");

    expect(policy).toContain("available_actions.update_policy");
    expect(policy).toContain("disabled_reason");
    expect(policy).toContain("只影响以后新开的试用，不影响已生效记录");
    expect(policy).toContain("default_trial_days");
    expect(policy).toContain("default_grace_days");
    expect(policy).toContain("reminder_days");
    expect(policy).toContain("reapply_cooldown_days");
    expect(policy).toContain("allow_repeat_application");
  });

  test("loading 骨架与第四个 Tab、指标、筛选和表格结构一致", () => {
    const loading = readSource(
      "../../app/(console)/platform/service-orders/loading.tsx",
    );

    expect(loading).toContain("Array.from({ length: 4 })");
    expect(loading).toContain("试用管理");
    expect(loading).toContain("trial-summary-skeleton");
    expect(loading).toContain("trial-filter-skeleton");
    expect(loading).toContain("h-14 w-full");
  });

  test("类型从 Domain 复用状态、来源、类型、能力和范围", () => {
    const types = readSource("./platform-service-trial-types.ts");
    const rules = readSource("./platform-service-trial-rules.ts");

    for (const typeName of [
      "PlatformServiceTrialStatus",
      "PlatformServiceTrialSource",
      "PlatformServiceTrialType",
      "PlatformServiceTrialCapability",
      "PlatformServiceTrialScopeV1",
    ]) {
      expect(types).toContain(typeName);
    }
    expect(types).toContain('from "@gooes/domain"');
    expect(rules).toContain("PLATFORM_SERVICE_TRIAL_STATUS_VALUES");
    expect(rules).toContain("PLATFORM_SERVICE_TRIAL_SOURCE_VALUES");
    expect(rules).toContain("PLATFORM_SERVICE_TRIAL_TYPE_VALUES");
  });
});
