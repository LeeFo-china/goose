import { z } from "zod";

import { PaginationQuerySchema } from "./request";

const PromotionDateTimeSchema = z.iso.datetime({ offset: true });

export const PromotionContentShape = {
  name: z.string().trim().min(1, "活动名称不能为空")
    .max(80, "活动名称不能超过 80 个字符"),
  badge_text: z.string().trim().min(1, "活动角标不能为空")
    .max(20, "活动角标不能超过 20 个字符"),
  title: z.string().trim().min(1, "活动标题不能为空")
    .max(60, "活动标题不能超过 60 个字符"),
  summary: z.string().trim().min(1, "活动说明不能为空")
    .max(200, "活动说明不能超过 200 个字符"),
  rules_text: z.string().trim().max(2000, "活动规则不能超过 2000 个字符"),
  discount_rate_basis_points: z.number().int("折扣率必须是整数")
    .min(1, "折扣率不能小于 1")
    .max(9999, "折扣率不能超过 9999"),
  starts_at: PromotionDateTimeSchema.nullable(),
  ends_at: PromotionDateTimeSchema.nullable(),
};

export const PlatformServicePromotionCreateSchema = z.object({
  name: PromotionContentShape.name.default("平台技术服务限时优惠"),
  badge_text: PromotionContentShape.badge_text.default("限时 2 折"),
  title: PromotionContentShape.title.default("平台技术服务限时优惠"),
  summary: PromotionContentShape.summary.default(
    "1 年、2 年、3 年套餐同步限时优惠",
  ),
  rules_text: PromotionContentShape.rules_text.default(""),
  discount_rate_basis_points:
    PromotionContentShape.discount_rate_basis_points.default(2000),
  starts_at: PromotionContentShape.starts_at.default(null),
  ends_at: PromotionContentShape.ends_at.default(null),
}).strict().superRefine(validatePromotionTimePair);

export const PlatformServicePromotionUpdateSchema = z.object({
  ...PromotionContentShape,
  expected_version: z.number().int("活动版本必须是整数")
    .positive("活动版本必须大于 0"),
}).strict().superRefine(validatePromotionTimePair);

export const PlatformServicePromotionPublishSchema = z.object({
  expected_version: z.number().int("活动版本必须是整数")
    .positive("活动版本必须大于 0"),
  idempotency_key: z.uuid("幂等键格式不正确"),
}).strict();

export const PlatformServicePromotionStopSchema =
  PlatformServicePromotionPublishSchema.extend({
    reason: z.string().trim().min(1, "停止原因不能为空")
      .max(500, "停止原因不能超过 500 个字符"),
  }).strict();

export const PlatformServicePromotionParamSchema = z.object({
  id: z.uuid("无效的平台服务限时活动 ID"),
}).strict();

export const PlatformServicePromotionListQuerySchema =
  PaginationQuerySchema.strict();

function validatePromotionTimePair(
  value: { starts_at: string | null; ends_at: string | null },
  context: z.RefinementCtx,
) {
  if ((value.starts_at === null) !== (value.ends_at === null)) {
    context.addIssue({
      code: "custom",
      path: value.starts_at === null ? ["starts_at"] : ["ends_at"],
      message: "活动开始时间和结束时间必须同时填写",
    });
    return;
  }

  if (
    value.starts_at !== null && value.ends_at !== null &&
    Date.parse(value.ends_at) <= Date.parse(value.starts_at)
  ) {
    context.addIssue({
      code: "custom",
      path: ["ends_at"],
      message: "活动结束时间必须晚于开始时间",
    });
  }
}

export type PlatformServicePromotionCreateInput =
  z.infer<typeof PlatformServicePromotionCreateSchema>;
export type PlatformServicePromotionUpdateInput =
  z.infer<typeof PlatformServicePromotionUpdateSchema>;
export type PlatformServicePromotionPublishInput =
  z.infer<typeof PlatformServicePromotionPublishSchema>;
export type PlatformServicePromotionStopInput =
  z.infer<typeof PlatformServicePromotionStopSchema>;
export type PlatformServicePromotionParam =
  z.infer<typeof PlatformServicePromotionParamSchema>;
export type PlatformServicePromotionListQuery =
  z.infer<typeof PlatformServicePromotionListQuerySchema>;
