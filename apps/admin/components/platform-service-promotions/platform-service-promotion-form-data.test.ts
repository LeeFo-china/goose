import { describe, expect, test } from "bun:test";

import {
  buildPromotionPayload,
  calculatePromotionAmount,
  createInitialPlatformServicePromotionFormValues,
  DEFAULT_PROMOTION_FORM_VALUES,
  isoToDatetimeLocal,
} from "./platform-service-promotion-form-data";
import {
  formatPromotionDateTime,
  formatPromotionFen,
  getPromotionPhaseMeta,
  getPromotionVersionStatusMeta,
} from "./platform-service-promotion-rules";
import type {
  PlatformServicePromotionFormValues,
  PlatformServicePromotionListItem,
} from "./platform-service-promotion-types";

const LOCAL_START = "2026-09-20T10:00";
const LOCAL_END = "2026-09-30T22:00";

function build(overrides: Partial<PlatformServicePromotionFormValues> = {}) {
  return buildPromotionPayload({
    ...DEFAULT_PROMOTION_FORM_VALUES,
    ...overrides,
  });
}

function promotionFixture(): PlatformServicePromotionListItem {
  const now = "2026-09-17T00:00:00.000Z";
  return {
    id: "promotion-1",
    code: "platform_service_promotion_fixture",
    draft_version_id: "draft-1",
    published_version_id: null,
    version: 4,
    archived_at: null,
    created_by_employee_id: "employee-1",
    updated_by_employee_id: "employee-1",
    created_at: now,
    updated_at: now,
    draft: {
      id: "draft-1",
      promotion_id: "promotion-1",
      version_no: 4,
      publication_status: "draft",
      name: "  秋季优惠  ",
      badge_text: "限时 2 折",
      title: "平台技术服务秋季优惠",
      summary: "三档套餐同步优惠",
      rules_text: "优惠以支付时价格为准",
      discount_rate_basis_points: 2500,
      starts_at: "2026-09-20T02:00:00.000Z",
      ends_at: "2026-09-30T14:00:00.000Z",
      published_at: null,
      published_by_employee_id: null,
      stopped_at: null,
      stopped_by_employee_id: null,
      stop_reason: null,
      created_at: now,
    },
    published: null,
    phase: "draft",
    price_preview: [1, 2, 3].map((years) => ({
      product_id: `product-${years}`,
      product_version_id: `00000000-0000-4000-8000-00000000000${years}`,
      code: `platform_service_${years}y`,
      title: `${years} 年套餐`,
      term_years: years,
      list_amount_fen: 1_200_000 * years,
      base_amount_fen: 980_000 * years,
      effective_amount_fen: 245_000 * years,
      base_price_rate_basis_points: 10_000,
      price_rate_basis_points: 2500,
    })),
  };
}

describe("平台技术服务限时活动表单规则", () => {
  test("创建默认 2 折且未排期的草稿", () => {
    expect(DEFAULT_PROMOTION_FORM_VALUES).toEqual({
      name: "平台技术服务限时优惠",
      badgeText: "限时 2 折",
      title: "平台技术服务限时优惠",
      summary: "1 年、2 年、3 年套餐同步限时优惠",
      rulesText: "",
      discountRate: "2",
      startsAt: "",
      endsAt: "",
    });
    expect(build()).toEqual({
      ok: true,
      body: {
        name: "平台技术服务限时优惠",
        badge_text: "限时 2 折",
        title: "平台技术服务限时优惠",
        summary: "1 年、2 年、3 年套餐同步限时优惠",
        rules_text: "",
        discount_rate_basis_points: 2000,
        starts_at: null,
        ends_at: null,
      },
    });
  });

  test("把北京时间和中文折数转换为 API 字段", () => {
    expect(buildPromotionPayload({
      ...DEFAULT_PROMOTION_FORM_VALUES,
      startsAt: LOCAL_START,
      endsAt: LOCAL_END,
    }, 4)).toEqual({
      ok: true,
      body: {
        expected_version: 4,
        name: "平台技术服务限时优惠",
        badge_text: "限时 2 折",
        title: "平台技术服务限时优惠",
        summary: "1 年、2 年、3 年套餐同步限时优惠",
        rules_text: "",
        discount_rate_basis_points: 2000,
        starts_at: "2026-09-20T02:00:00.000Z",
        ends_at: "2026-09-30T14:00:00.000Z",
      },
    });
  });

  test("接受 0.1 和 9.9 折并拒绝区间外、超精度和非数字输入", () => {
    expect(build({ discountRate: "0.1" })).toMatchObject({
      ok: true,
      body: { discount_rate_basis_points: 100 },
    });
    expect(build({ discountRate: "9.9" })).toMatchObject({
      ok: true,
      body: { discount_rate_basis_points: 9900 },
    });
    for (const discountRate of ["0", "10", "2.25", "二", "NaN", ""]) {
      expect(build({ discountRate })).toEqual({
        ok: false,
        message: discountRate === "0"
          ? "折扣必须低于原价"
          : "折扣只能填写 0.1 至 9.9 折",
      });
    }
  });

  test("校验成对时间、时间有效性和结束顺序", () => {
    expect(build({ startsAt: LOCAL_START })).toEqual({
      ok: false,
      message: "活动开始时间和结束时间必须同时填写",
    });
    expect(build({ endsAt: LOCAL_END })).toEqual({
      ok: false,
      message: "活动开始时间和结束时间必须同时填写",
    });
    expect(build({ startsAt: "invalid", endsAt: LOCAL_END })).toEqual({
      ok: false,
      message: "活动时间无效",
    });
    expect(build({
      startsAt: "2026-02-30T10:00",
      endsAt: "2026-03-03T10:00",
    })).toEqual({
      ok: false,
      message: "活动时间无效",
    });
    expect(build({ startsAt: LOCAL_END, endsAt: LOCAL_START })).toEqual({
      ok: false,
      message: "活动结束时间必须晚于开始时间",
    });
    expect(build({ startsAt: LOCAL_START, endsAt: LOCAL_START })).toEqual({
      ok: false,
      message: "活动结束时间必须晚于开始时间",
    });
  });

  test("北京时间不受美国 DST 缺失小时影响且严格验证日期分量", () => {
    expect(build({ startsAt: "2026-03-08T02:30", endsAt: "2026-03-08T03:30" }))
      .toMatchObject({ ok: true, body: { starts_at: "2026-03-07T18:30:00.000Z", ends_at: "2026-03-07T19:30:00.000Z" } });
    for (const startsAt of ["2026-02-29T10:00", "2026-13-01T00:00", "2026-09-00T10:00", "2026-09-20T24:00", "2026-09-20T10:60", "2026-09-20T10:00Z"]) {
      expect(build({ startsAt, endsAt: LOCAL_END })).toEqual({ ok: false, message: "活动时间无效" });
    }
  });

  test("按后端 trim 与最大长度规则构建运营文案", () => {
    expect(build({
      name: `  ${"名".repeat(80)}  `,
      badgeText: `  ${"角".repeat(20)}  `,
      title: `  ${"题".repeat(60)}  `,
      summary: `  ${"摘".repeat(200)}  `,
      rulesText: `  ${"规".repeat(2000)}  `,
    })).toMatchObject({
      ok: true,
      body: {
        name: "名".repeat(80),
        badge_text: "角".repeat(20),
        title: "题".repeat(60),
        summary: "摘".repeat(200),
        rules_text: "规".repeat(2000),
      },
    });

    const invalidTextCases: Array<[
      Partial<PlatformServicePromotionFormValues>,
      string,
    ]> = [
      [{ name: " " }, "请填写活动名称"],
      [{ badgeText: " " }, "请填写活动角标"],
      [{ title: " " }, "请填写活动标题"],
      [{ summary: " " }, "请填写活动说明"],
      [{ name: "名".repeat(81) }, "活动名称不能超过 80 个字符"],
      [{ badgeText: "角".repeat(21) }, "活动角标不能超过 20 个字符"],
      [{ title: "题".repeat(61) }, "活动标题不能超过 60 个字符"],
      [{ summary: "摘".repeat(201) }, "活动说明不能超过 200 个字符"],
      [{ rulesText: "规".repeat(2001) }, "活动规则不能超过 2000 个字符"],
    ];
    for (const [overrides, message] of invalidTextCases) {
      expect(build(overrides)).toEqual({ ok: false, message });
    }
  });

  test("计算三档即时预览并保留最低 1 分", () => {
    expect([
      calculatePromotionAmount(980_000, 2000),
      calculatePromotionAmount(1_960_000, 2000),
      calculatePromotionAmount(2_940_000, 2000),
    ]).toEqual([196_000, 392_000, 588_000]);
    expect(calculatePromotionAmount(1, 1)).toBe(1);
    expect(() => calculatePromotionAmount(Number.NaN, 2000)).toThrow();
    expect(() => calculatePromotionAmount(980_000, Number.NaN)).toThrow();
  });

  test("ISO 与北京时间 datetime-local 回填不依赖当前时区", () => {
    const iso = "2026-09-20T02:00:00.000Z";
    const localValue = isoToDatetimeLocal(iso);
    expect(localValue).toBe(LOCAL_START);
    expect(build({ startsAt: localValue, endsAt: LOCAL_END })).toMatchObject({
      ok: true, body: { starts_at: iso },
    });
    expect(isoToDatetimeLocal(null)).toBe("");
    expect(isoToDatetimeLocal("invalid")).toBe("");

    expect(createInitialPlatformServicePromotionFormValues(promotionFixture()))
      .toMatchObject({
        name: "  秋季优惠  ",
        discountRate: "2.5",
        startsAt: LOCAL_START,
        endsAt: LOCAL_END,
      });
  });
});

describe("平台技术服务限时活动展示规则", () => {
  test("提供 phase 与版本状态中文标签和色调", () => {
    expect(getPromotionPhaseMeta("draft")).toEqual({
      label: "草稿",
      variant: "secondary",
    });
    expect(getPromotionPhaseMeta("active")).toEqual({
      label: "进行中",
      variant: "success",
    });
    expect(getPromotionPhaseMeta("unknown")).toEqual({
      label: "unknown",
      variant: "secondary",
    });
    expect(getPromotionVersionStatusMeta("published")).toEqual({
      label: "已发布",
      variant: "success",
    });
    expect(getPromotionVersionStatusMeta("stopped")).toEqual({
      label: "已停止",
      variant: "danger",
    });
  });

  test("原型链属性名也按未知状态安全回退", () => {
    for (const status of ["constructor", "__proto__"]) {
      expect(getPromotionPhaseMeta(status)).toEqual({
        label: status,
        variant: "secondary",
      });
      expect(getPromotionVersionStatusMeta(status)).toEqual({
        label: status,
        variant: "secondary",
      });
    }
  });

  test("活动展示固定为北京时间，与运行环境时区无关", () => {
    expect(formatPromotionDateTime("2026-09-17T08:00:00.000Z"))
      .toBe("2026/9/17 16:00:00");
    expect(formatPromotionDateTime("2026-09-17T20:30:00.000Z"))
      .toBe("2026/9/18 04:30:00");
    expect(formatPromotionDateTime("2026-09-17T16:00:00+08:00"))
      .toBe("2026/9/17 16:00:00");
  });

  test("安全格式化分钱金额和时间", () => {
    expect(formatPromotionFen(196_000)).toBe("¥1960.00");
    expect(formatPromotionFen(null)).toBe("未设置");
    expect(formatPromotionFen(Number.NaN)).toBe("未设置");
    expect(formatPromotionDateTime(null)).toBe("-");
    expect(formatPromotionDateTime("invalid")).toBe("-");
    expect(formatPromotionDateTime("2026-09-17T08:00:00.000Z"))
      .not.toBe("-");
  });
});
