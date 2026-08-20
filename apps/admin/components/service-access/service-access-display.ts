import type {
  AdminServiceAccessAction,
  AdminTenantServiceAccess,
} from "@gooes/domain";

import type { TenantServiceAccessLoadResult } from "@/lib/tenant-service-access";

export type ServiceAccessDisplayTone =
  | "neutral"
  | "success"
  | "warning"
  | "danger";

export type ServiceAccessDisplayAction = AdminServiceAccessAction & {
  priority: "primary" | "secondary";
};

export type ServiceAccessDisplayTimeRow = {
  key: "startsAt" | "endsAt" | "evaluatedAt";
  label: string;
  value: string;
};

export type ServiceAccessDisplay = {
  tone: ServiceAccessDisplayTone;
  statusLabel: string;
  title: string;
  message: string;
  timeRows: ServiceAccessDisplayTimeRow[];
  actions: ServiceAccessDisplayAction[];
};

const STATUS_META = {
  workspace_available: { tone: "success", label: "服务可用" },
  pending_review: { tone: "warning", label: "审核中" },
  scheduled: { tone: "warning", label: "待生效" },
  grace_period: { tone: "warning", label: "只读宽限" },
  expired: { tone: "warning", label: "已到期" },
  service_blocked: { tone: "neutral", label: "未开通" },
  hard_blocked: { tone: "danger", label: "已阻断" },
} as const satisfies Record<
  AdminTenantServiceAccess["accessStatus"],
  { tone: ServiceAccessDisplayTone; label: string }
>;

const dateTimeFormatter = new Intl.DateTimeFormat("zh-CN", {
  timeZone: "Asia/Shanghai",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

export function formatServiceAccessDateTime(
  value: string | null | undefined,
): string {
  if (!value) return "—";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";

  const parts = dateTimeFormatter.formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes): string => (
    parts.find((item) => item.type === type)?.value ?? ""
  );

  return [
    `${part("year")}年${part("month")}月${part("day")}日`,
    `${part("hour")}:${part("minute")}`,
  ].join(" ");
}

export function buildServiceReadonlyBannerContent(
  summary: AdminTenantServiceAccess,
): { endsAtLabel: string | null; linkLabel: string } {
  const formattedEndsAt = formatServiceAccessDateTime(summary.endsAt);
  const actions = [summary.primaryAction, summary.secondaryAction];

  return {
    endsAtLabel: formattedEndsAt === "—" ? null : formattedEndsAt,
    linkLabel: actions.some((action) => action?.key === "purchase_service")
      ? "购买正式服务"
      : "查看服务状态",
  };
}

export function buildServiceAccessDisplay(
  loadResult: TenantServiceAccessLoadResult,
): ServiceAccessDisplay {
  if (loadResult.kind === "bypass") {
    return {
      tone: "neutral",
      statusLabel: "平台身份",
      title: "平台服务可用",
      message: "正在返回工作台。",
      timeRows: [],
      actions: [{
        key: "enter_workspace",
        label: "返回工作台",
        priority: "primary",
      }],
    };
  }

  if (loadResult.kind === "unavailable") {
    return {
      tone: "danger",
      statusLabel: "加载失败",
      title: "服务状态暂时无法加载",
      message: "无法确认当前企业的服务访问状态，请稍后重试。",
      timeRows: [],
      actions: [{ key: "refresh", label: "重试", priority: "primary" }],
    };
  }

  return buildReadyDisplay(loadResult.summary);
}

function buildReadyDisplay(
  summary: AdminTenantServiceAccess,
): ServiceAccessDisplay {
  const meta = STATUS_META[summary.accessStatus];
  const sourceActions = [summary.primaryAction, summary.secondaryAction]
    .filter((action): action is AdminServiceAccessAction => action !== null);

  return {
    tone: meta.tone,
    statusLabel: meta.label,
    title: summary.title,
    message: summary.message,
    timeRows: [
      {
        key: "startsAt",
        label: "开始时间",
        value: formatServiceAccessDateTime(summary.startsAt),
      },
      {
        key: "endsAt",
        label: "结束时间",
        value: formatServiceAccessDateTime(summary.endsAt),
      },
      {
        key: "evaluatedAt",
        label: "最后评估时间",
        value: formatServiceAccessDateTime(summary.evaluatedAt),
      },
    ],
    actions: sourceActions.map((action, index) => ({
      ...action,
      priority: index === 0 ? "primary" : "secondary",
    })),
  };
}
