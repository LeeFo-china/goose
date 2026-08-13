import { existsSync, readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";

import {
  buildPlatformServiceTrialTabQuery,
  buildServiceTrialQuery,
  getPlatformServiceTrialPermissions,
} from "./platform-service-trial-page-state";
import { runTrialMutationFlow } from "./platform-service-trial-action-execution";
import {
  getPlatformTrialDisabledReasons,
  resolvePlatformTrialAction,
} from "./platform-service-trial-action-state";
import {
  beginLatestTrialDetailRequest,
  invalidateTrialDetailRequests,
} from "./platform-service-trial-detail-request";
import { isTrialExpiringSoon } from "./platform-service-trial-rules";

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
    const trialPageState = readSource("./platform-service-trial-page-state.ts");

    expect(page).toContain("试用管理");
    expect(orderRules).toContain('"trials"');
    expect(page).toContain("trialPage");
    expect(page).toContain("trialPageSize");
    expect(page).toContain("trialKeyword");
    expect(page).toContain("trialStatus");
    expect(page).toContain("trialSource");
    expect(page).toContain("trialType");
    expect(trialPageState).toContain('query.set("page", String(input.page))');
    expect(trialPageState).toContain('query.set("pageSize", String(input.pageSize))');
    expect(page).not.toContain("pageSize=100");

    const tabQuery = new URLSearchParams(buildPlatformServiceTrialTabQuery(50));
    expect(Object.fromEntries(tabQuery)).toEqual({
      tab: "trials",
      trialPageSize: "50",
    });
    const backendQuery = new URLSearchParams(buildServiceTrialQuery({
      page: 3,
      pageSize: 20,
      keyword: "装企",
      status: "active",
    }));
    expect(Object.fromEntries(backendQuery)).toEqual({
      page: "3",
      pageSize: "20",
      keyword: "装企",
      status: "active",
    });
  });

  test("按读写权限加载列表概览并控制主动开通和规则入口", () => {
    const page = readSource(
      "../../app/(console)/platform/service-orders/page.tsx",
    );
    const pageState = readSource("./platform-service-trial-page-state.ts");

    expect(pageState).toContain('platform.service_trial.read');
    expect(pageState).toContain('platform.service_trial.manage');
    expect(pageState).toContain('platform.service_trial.override');
    expect(page).toContain("/platform/billing/service-trials?");
    expect(page).toContain("/platform/billing/service-trials/summary");
    expect(page).toContain("Promise.all");
    expect(page).toContain("canGrantTrial");
    expect(page).toContain("canUpdateTrialPolicy");
    expect(page).toContain("disabledReason");

    expect(getPlatformServiceTrialPermissions({
      tenantId: null,
      roles: ["platform_staff"],
      permissionCodes: [
        "platform.service_trial.read",
        "platform.service_trial.manage",
        "platform.service_trial.override",
      ],
    })).toEqual({ canRead: true, canGrant: true, canUpdatePolicy: true });
    expect(getPlatformServiceTrialPermissions({
      tenantId: null,
      roles: ["platform_admin"],
      permissionCodes: [],
      isPlatformSuperAdmin: true,
    })).toEqual({ canRead: true, canGrant: true, canUpdatePolicy: true });
    expect(getPlatformServiceTrialPermissions({
      tenantId: "tenant-id",
      roles: ["platform_staff"],
      permissionCodes: ["platform.service_trial.read"],
      isPlatformStaff: true,
    })).toEqual({ canRead: false, canGrant: false, canUpdatePolicy: false });
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
    expect(filters).toContain('name="trialAssigneeEmployeeId"');
    expect(filters).toContain("PlatformServiceTrialAssigneeCombobox");
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

    const requestCounter = { current: 0 };
    const firstRequestIsCurrent = beginLatestTrialDetailRequest(requestCounter);
    const secondRequestIsCurrent = beginLatestTrialDetailRequest(requestCounter);
    expect(firstRequestIsCurrent()).toBe(false);
    expect(secondRequestIsCurrent()).toBe(true);
    invalidateTrialDetailRequests(requestCounter);
    expect(secondRequestIsCurrent()).toBe(false);
  });

  test("详情提供分页跟进时间线、稳定提交反馈和即将到期提示", () => {
    const page = readSource(
      "../../app/(console)/platform/service-orders/page.tsx",
    );
    const detail = readSource("./platform-service-trial-detail.tsx");
    const table = readSource("./platform-service-trial-table.tsx");
    const followUps = readSource("./platform-service-trial-follow-ups.tsx");
    const form = readSource("./platform-service-trial-follow-up-form.tsx");
    const cancel = readSource("./platform-service-trial-follow-up-cancel.tsx");

    expect(page).toContain("canManage={canGrantTrial}");
    expect(detail).toContain("PlatformServiceTrialFollowUps");
    expect(detail).toContain("onTrialRefresh={loadDetail}");
    expect(followUps).toContain("/follow-ups?page=");
    expect(followUps).toContain("pageSize=10");
    expect(followUps).toContain("Empty");
    expect(followUps).toContain("Skeleton");
    expect(followUps).toContain("上一页");
    expect(followUps).toContain("下一页");
    expect(form).toContain("DialogTitle");
    expect(form).toContain("FieldGroup");
    expect(form).toContain("SelectGroup");
    expect(form).toContain("Textarea");
    expect(form).toContain("Spinner");
    expect(form).toContain("invisible");
    expect(form).toContain("idempotencyIntent.current()");
    expect(form).toContain("next_follow_up_at");
    expect(form).toContain("setSummary(\"\")");
    expect(followUps).toContain("PlatformServiceTrialFollowUpCancel");
    expect(cancel).toContain("AlertDialog");
    expect(cancel).toContain("/cancel");
    expect(cancel).toContain('status: "canceled"');
    expect(cancel).toContain("idempotencyIntent.current()");
    expect(detail).toContain('trial_follow_up_created: "新增试用跟进"');
    expect(detail).toContain('trial_follow_up_canceled: "取消试用跟进"');
    expect(table).toContain("isTrialExpiringSoon");
    expect(table).toContain("即将到期");
    expect(isTrialExpiringSoon({
      status: "active", trial_ends_at: "2026-08-19T00:00:00.000Z",
    }, "2026-08-12T00:00:00.000Z")).toBe(true);
    expect(isTrialExpiringSoon({
      status: "active", trial_ends_at: "2026-08-19T00:00:00.001Z",
    }, "2026-08-12T00:00:00.000Z")).toBe(false);
    expect(isTrialExpiringSoon({
      status: "grace_period", trial_ends_at: "2026-08-11T00:00:00.000Z",
    }, "2026-08-12T00:00:00.000Z")).toBe(false);
  });

  test("动作由后端 available_actions 控制并解释禁用原因", () => {
    const detail = readSource("./platform-service-trial-detail.tsx");
    const actions = readSource("./platform-service-trial-action-dialog.tsx");
    const actionState = readSource("./platform-service-trial-action-state.ts");

    expect(detail).toContain("available_actions");
    expect(actionState).toContain("disabled_reason");
    expect(actions).toContain("DialogTitle");
    expect(actions).toContain("action.enabled");
    expect(actions).toContain("action.disabled_reason");
    expect(actions).toContain("review");
    expect(actions).toContain("extend");
    expect(actions).toContain("revoke");
    expect(actions).toContain("assign");

    const review = { enabled: true, disabled_reason: null };
    const availableActions = {
      withdraw: { enabled: false, disabled_reason: "无试用申请权限" },
      review,
      extend: { enabled: false, disabled_reason: "当前状态不可延期" },
    };
    expect(resolvePlatformTrialAction(availableActions, "review")).toBe(review);
    expect(resolvePlatformTrialAction(availableActions, "assign")).toEqual({
      enabled: false,
      disabled_reason: "后端未提供当前操作",
    });
    expect(getPlatformTrialDisabledReasons(availableActions)).toEqual([
      { key: "extend", reason: "当前状态不可延期" },
    ]);
  });

  test("提交期间按钮不跳动，成功刷新列表和详情，失败保留表单", async () => {
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
    expect(actions).toContain('role="alert"');
    expect(actions).toContain("scopeErrorId");

    const events: string[] = [];
    const success = await runTrialMutationFlow({
      mutate: async () => { events.push("mutate"); },
      refreshList: () => { events.push("list"); },
      onMutationSucceeded: () => { events.push("success"); },
      loadDetail: async () => { events.push("detail"); return { id: "trial-1" }; },
      updateDetail: () => { events.push("update"); },
    });
    expect(events).toEqual(["mutate", "list", "success", "detail", "update"]);
    expect(success.detailRefreshError).toBeNull();

    events.length = 0;
    const partialSuccess = await runTrialMutationFlow({
      mutate: async () => { events.push("mutate"); },
      refreshList: () => { events.push("list"); },
      onMutationSucceeded: () => { events.push("success"); },
      loadDetail: async () => { events.push("detail"); throw new Error("detail failed"); },
      updateDetail: () => { events.push("update"); },
    });
    expect(events).toEqual(["mutate", "list", "success", "detail"]);
    expect(partialSuccess.detailRefreshError).toBeInstanceOf(Error);

    events.length = 0;
    const formState = { open: true, reason: "保留原操作原因" };
    await expect(runTrialMutationFlow({
      mutate: async () => { events.push("mutate"); throw new Error("mutation failed"); },
      refreshList: () => { events.push("list"); },
      onMutationSucceeded: () => {
        events.push("success");
        formState.open = false;
        formState.reason = "";
      },
      loadDetail: async () => { events.push("detail"); return { id: "trial-1" }; },
      updateDetail: () => { events.push("update"); },
    })).rejects.toThrow("mutation failed");
    expect(events).toEqual(["mutate"]);
    expect(formState).toEqual({ open: true, reason: "保留原操作原因" });
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
    expect(loading).toContain("trial-filter-date-skeleton");
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
