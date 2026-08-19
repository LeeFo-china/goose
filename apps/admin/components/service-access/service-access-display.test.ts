import { describe, expect, test } from "bun:test";
import {
  AdminTenantServiceAccessSchema,
  type AdminServiceAccessAction,
  type AdminTenantServiceAccess,
} from "@gooes/domain";

import type { TenantServiceAccessLoadResult } from "@/lib/tenant-service-access";

import {
  buildServiceAccessDisplay,
  buildServiceReadonlyBannerContent,
  formatServiceAccessDateTime,
} from "./service-access-display";

const TRIAL_ID = "00000000-0000-4000-8000-000000000001";

const actionsByStatus: Record<
  AdminTenantServiceAccess["accessStatus"],
  readonly [AdminServiceAccessAction, AdminServiceAccessAction | null]
> = {
  workspace_available: [
    { key: "enter_workspace", label: "进入工作台" },
    null,
  ],
  pending_review: [
    { key: "view_trial", label: "查看试用" },
    { key: "refresh", label: "刷新状态" },
  ],
  scheduled: [
    { key: "view_trial", label: "查看试用" },
    { key: "refresh", label: "刷新状态" },
  ],
  grace_period: [
    { key: "enter_readonly_workspace", label: "只读进入工作台" },
    { key: "purchase_service", label: "购买正式服务" },
  ],
  expired: [
    { key: "purchase_service", label: "购买正式服务" },
    { key: "view_trial", label: "查看试用" },
  ],
  service_blocked: [
    { key: "apply_trial", label: "申请试用" },
    { key: "purchase_service", label: "购买正式服务" },
  ],
  hard_blocked: [
    { key: "contact_platform", label: "联系平台" },
    { key: "refresh", label: "刷新状态" },
  ],
};

const stateMeta: Record<
  AdminTenantServiceAccess["accessStatus"],
  {
    title: string;
    tone: "neutral" | "success" | "warning" | "danger";
  }
> = {
  workspace_available: { title: "平台技术服务可用", tone: "success" },
  pending_review: { title: "试用申请审核中", tone: "warning" },
  scheduled: { title: "试用已批准，等待生效", tone: "warning" },
  grace_period: { title: "服务处于只读宽限期", tone: "warning" },
  expired: { title: "试用服务已到期", tone: "warning" },
  service_blocked: { title: "尚未开通平台技术服务", tone: "neutral" },
  hard_blocked: { title: "企业账号暂不可用", tone: "danger" },
};

function summaryFor(
  status: AdminTenantServiceAccess["accessStatus"],
): AdminTenantServiceAccess {
  const isTrialStatus = [
    "pending_review",
    "scheduled",
    "grace_period",
    "expired",
  ].includes(status);
  const [primaryAction, secondaryAction] = actionsByStatus[status];

  return AdminTenantServiceAccessSchema.parse({
    accessStatus: status,
    accessMode: status === "workspace_available"
      ? "paid"
      : status === "grace_period"
        ? "grace"
        : status === "hard_blocked"
          ? "hard_blocked"
          : "service_blocked",
    accessLevel: status === "workspace_available"
      ? "read_write"
      : status === "grace_period"
        ? "read_only"
        : "none",
    canEnterWorkspace: status === "workspace_available"
      || status === "grace_period",
    readonly: status === "grace_period",
    trialId: isTrialStatus ? TRIAL_ID : null,
    trialStatus: isTrialStatus ? status : null,
    startsAt: "2026-08-19T02:03:00.000Z",
    endsAt: "2026-08-26T09:30:00.000Z",
    evaluatedAt: "2026-08-19T02:05:00.000Z",
    title: stateMeta[status].title,
    message: `${stateMeta[status].title}，请根据当前状态继续处理。`,
    primaryAction,
    secondaryAction,
  });
}

function ready(
  status: AdminTenantServiceAccess["accessStatus"],
): TenantServiceAccessLoadResult {
  return { kind: "ready", summary: summaryFor(status) };
}

describe("buildServiceAccessDisplay", () => {
  test("covers every authority status with its tone, summary, times, and actions", () => {
    for (const status of Object.keys(stateMeta) as Array<
      AdminTenantServiceAccess["accessStatus"]
    >) {
      const display = buildServiceAccessDisplay(ready(status));

      expect(display.tone).toBe(stateMeta[status].tone);
      expect(display.title).toBe(stateMeta[status].title);
      expect(display.message).toBe(
        `${stateMeta[status].title}，请根据当前状态继续处理。`,
      );
      expect(display.timeRows).toEqual([
        { key: "startsAt", label: "开始时间", value: "2026年08月19日 10:03" },
        { key: "endsAt", label: "结束时间", value: "2026年08月26日 17:30" },
        { key: "evaluatedAt", label: "最后评估时间", value: "2026年08月19日 10:05" },
      ]);
      expect(display.actions.map(({ key }) => key)).toEqual(
        actionsByStatus[status]
          .filter((action): action is AdminServiceAccessAction => action !== null)
          .map(({ key }) => key),
      );
    }
  });

  test("uses the legal expired summary title without replacing it", () => {
    expect(buildServiceAccessDisplay(ready("expired")).title)
      .toBe("试用服务已到期");
  });

  test("keeps unavailable copy neutral even when the failure message implies access state", () => {
    const display = buildServiceAccessDisplay({
      kind: "unavailable",
      message: "租户服务已到期且未开通",
    });
    const content = `${display.title}${display.message}`;

    expect(display.title).toBe("服务状态暂时无法加载");
    expect(content).not.toContain("已到期");
    expect(content).not.toContain("未开通");
    expect(display.actions).toEqual([{
      key: "refresh",
      label: "重试",
      priority: "primary",
    }]);
  });

  test("returns a neutral available model for platform bypass", () => {
    const display = buildServiceAccessDisplay({ kind: "bypass" });

    expect(display.tone).toBe("neutral");
    expect(display.title).toBe("平台服务可用");
    expect(display.actions[0]?.key).toBe("enter_workspace");
  });

  test("preserves action order and marks only the first action as primary", () => {
    const display = buildServiceAccessDisplay(ready("service_blocked"));

    expect(display.actions).toEqual([
      { key: "apply_trial", label: "申请试用", priority: "primary" },
      {
        key: "purchase_service",
        label: "购买正式服务",
        priority: "secondary",
      },
    ]);
  });
});

describe("formatServiceAccessDateTime", () => {
  test("formats valid timestamps in a stable Chinese Shanghai time", () => {
    expect(formatServiceAccessDateTime("2026-08-19T02:03:00.000Z"))
      .toBe("2026年08月19日 10:03");
  });

  test("is safe for empty and invalid values", () => {
    expect(formatServiceAccessDateTime(null)).toBe("—");
    expect(formatServiceAccessDateTime("")).toBe("—");
    expect(formatServiceAccessDateTime("not-a-date")).toBe("—");
  });
});

describe("buildServiceReadonlyBannerContent", () => {
  test("shows the grace end time and authoritative purchase action", () => {
    expect(buildServiceReadonlyBannerContent(summaryFor("grace_period")))
      .toEqual({
        endsAtLabel: "2026年08月26日 17:30",
        linkLabel: "购买正式服务",
      });
  });

  test("falls back to a status link without a purchase action", () => {
    expect(buildServiceReadonlyBannerContent({
      ...summaryFor("grace_period"),
      secondaryAction: { key: "refresh", label: "刷新状态" },
    })).toEqual({
      endsAtLabel: "2026年08月26日 17:30",
      linkLabel: "查看服务状态",
    });
  });
});
