import type {
  PlatformServicePromotionFormValues,
  PlatformServicePromotionListItem,
  PlatformServicePromotionPayloadResult,
} from "./platform-service-promotion-types";

const DISCOUNT_RATE_PATTERN = /^\d(?:\.\d)?$/;
const DATETIME_LOCAL_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;

export const DEFAULT_PROMOTION_FORM_VALUES:
  PlatformServicePromotionFormValues = {
    name: "平台技术服务限时优惠",
    badgeText: "限时 2 折",
    title: "平台技术服务限时优惠",
    summary: "1 年、2 年、3 年套餐同步限时优惠",
    rulesText: "",
    discountRate: "2",
    startsAt: "",
    endsAt: "",
  };

export function createInitialPlatformServicePromotionFormValues(
  promotion?: PlatformServicePromotionListItem | null,
): PlatformServicePromotionFormValues {
  const version = promotion?.draft ?? promotion?.published;
  if (!version) return { ...DEFAULT_PROMOTION_FORM_VALUES };

  return {
    name: version.name,
    badgeText: version.badge_text,
    title: version.title,
    summary: version.summary,
    rulesText: version.rules_text,
    discountRate: formatDiscountRateInput(
      version.discount_rate_basis_points,
    ),
    startsAt: isoToDatetimeLocal(version.starts_at),
    endsAt: isoToDatetimeLocal(version.ends_at),
  };
}

export function isoToDatetimeLocal(
  value: string | null | undefined,
): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  const timezoneOffsetMs = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - timezoneOffsetMs)
    .toISOString()
    .slice(0, 16);
}

export function buildPromotionPayload(
  values: PlatformServicePromotionFormValues,
  expectedVersion?: number,
): PlatformServicePromotionPayloadResult {
  const name = validateText(values.name, "活动名称", 80, true);
  if (!name.ok) return name;
  const badgeText = validateText(values.badgeText, "活动角标", 20, true);
  if (!badgeText.ok) return badgeText;
  const title = validateText(values.title, "活动标题", 60, true);
  if (!title.ok) return title;
  const summary = validateText(values.summary, "活动说明", 200, true);
  if (!summary.ok) return summary;
  const rulesText = validateText(values.rulesText, "活动规则", 2000, false);
  if (!rulesText.ok) return rulesText;

  const discountRate = parseDiscountRate(values.discountRate);
  if (!discountRate.ok) return discountRate;

  const schedule = parseSchedule(values.startsAt, values.endsAt);
  if (!schedule.ok) return schedule;

  if (
    expectedVersion !== undefined &&
    (!Number.isSafeInteger(expectedVersion) || expectedVersion <= 0)
  ) {
    return { ok: false, message: "活动版本必须大于 0" };
  }

  return {
    ok: true,
    body: {
      ...(expectedVersion === undefined
        ? {}
        : { expected_version: expectedVersion }),
      name: name.value,
      badge_text: badgeText.value,
      title: title.value,
      summary: summary.value,
      rules_text: rulesText.value,
      discount_rate_basis_points: discountRate.basisPoints,
      starts_at: schedule.startsAt,
      ends_at: schedule.endsAt,
    },
  };
}

export function calculatePromotionAmount(
  listAmountFen: number,
  rateBasisPoints: number,
): number {
  if (!Number.isSafeInteger(listAmountFen) || listAmountFen <= 0) {
    throw new RangeError("套餐价格必须是大于 0 的安全整数");
  }
  if (
    !Number.isSafeInteger(rateBasisPoints) ||
    rateBasisPoints < 1 ||
    rateBasisPoints > 9999
  ) {
    throw new RangeError("活动折扣基点必须在 1 至 9999 之间");
  }

  const amountFen = Math.max(
    1,
    Math.round((listAmountFen * rateBasisPoints) / 10_000),
  );
  if (!Number.isSafeInteger(amountFen)) {
    throw new RangeError("活动价格超出安全整数范围");
  }
  return amountFen;
}

function formatDiscountRateInput(rateBasisPoints: number): string {
  return String(rateBasisPoints / 1000);
}

function parseDiscountRate(value: string):
  | { ok: true; basisPoints: number }
  | { ok: false; message: string } {
  const normalized = value.trim();
  if (!DISCOUNT_RATE_PATTERN.test(normalized)) {
    return { ok: false, message: "折扣只能填写 0.1 至 9.9 折" };
  }

  const basisPoints = Math.round(Number(normalized) * 1000);
  if (basisPoints < 1 || basisPoints > 9999) {
    return { ok: false, message: "折扣必须低于原价" };
  }
  return { ok: true, basisPoints };
}

function parseSchedule(startsAtValue: string, endsAtValue: string):
  | { ok: true; startsAt: string | null; endsAt: string | null }
  | { ok: false; message: string } {
  const startsAtInput = startsAtValue.trim();
  const endsAtInput = endsAtValue.trim();
  if (!startsAtInput && !endsAtInput) {
    return { ok: true, startsAt: null, endsAt: null };
  }
  if (!startsAtInput || !endsAtInput) {
    return {
      ok: false,
      message: "活动开始时间和结束时间必须同时填写",
    };
  }

  const startsAtDate = new Date(startsAtInput);
  const endsAtDate = new Date(endsAtInput);
  if (
    !isValidDatetimeLocal(startsAtInput, startsAtDate) ||
    !isValidDatetimeLocal(endsAtInput, endsAtDate)
  ) {
    return { ok: false, message: "活动时间无效" };
  }
  if (endsAtDate.getTime() <= startsAtDate.getTime()) {
    return { ok: false, message: "活动结束时间必须晚于开始时间" };
  }
  return {
    ok: true,
    startsAt: startsAtDate.toISOString(),
    endsAt: endsAtDate.toISOString(),
  };
}

function isValidDatetimeLocal(value: string, date: Date): boolean {
  return DATETIME_LOCAL_PATTERN.test(value) &&
    !Number.isNaN(date.getTime()) &&
    isoToDatetimeLocal(date.toISOString()) === value;
}

function validateText(
  value: string,
  label: string,
  maxLength: number,
  required: boolean,
):
  | { ok: true; value: string }
  | { ok: false; message: string } {
  const normalized = value.trim();
  if (required && !normalized) {
    return { ok: false, message: `请填写${label}` };
  }
  if (normalized.length > maxLength) {
    return {
      ok: false,
      message: `${label}不能超过 ${maxLength} 个字符`,
    };
  }
  return { ok: true, value: normalized };
}
