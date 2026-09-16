import type {
  PlatformServicePromotionPhase,
  PlatformServicePromotionVersionStatus,
} from "./platform-service-promotion-types";

type PromotionBadgeVariant =
  | "secondary"
  | "success"
  | "warning"
  | "danger";

type PromotionStatusMeta = {
  label: string;
  variant: PromotionBadgeVariant;
};

export const platformServicePromotionPhaseMeta: Record<
  PlatformServicePromotionPhase,
  PromotionStatusMeta
> = {
  draft: { label: "草稿", variant: "secondary" },
  scheduled: { label: "待开始", variant: "warning" },
  active: { label: "进行中", variant: "success" },
  ended: { label: "已结束", variant: "secondary" },
  stopped: { label: "已停止", variant: "danger" },
};

export const platformServicePromotionVersionStatusMeta: Record<
  PlatformServicePromotionVersionStatus,
  PromotionStatusMeta
> = {
  draft: { label: "草稿", variant: "secondary" },
  published: { label: "已发布", variant: "success" },
  superseded: { label: "已替代", variant: "secondary" },
  stopped: { label: "已停止", variant: "danger" },
};

export function getPromotionPhaseMeta(status: string): PromotionStatusMeta {
  if (Object.hasOwn(platformServicePromotionPhaseMeta, status)) {
    return platformServicePromotionPhaseMeta[
      status as PlatformServicePromotionPhase
    ];
  }
  return { label: status, variant: "secondary" };
}

export function getPromotionVersionStatusMeta(
  status: string,
): PromotionStatusMeta {
  if (Object.hasOwn(platformServicePromotionVersionStatusMeta, status)) {
    return platformServicePromotionVersionStatusMeta[
      status as PlatformServicePromotionVersionStatus
    ];
  }
  return { label: status, variant: "secondary" };
}

export function formatPromotionFen(
  value: number | null | undefined,
): string {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < 0
  ) {
    return "未设置";
  }
  return `¥${(value / 100).toFixed(2)}`;
}

export function formatPromotionDateTime(
  value: string | null | undefined,
): string {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("zh-CN", { hour12: false });
}
