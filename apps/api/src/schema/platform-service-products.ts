import { z } from "zod";

import { PaginationQuerySchema } from "./request";

export const PlatformServiceProductListQuerySchema =
  PaginationQuerySchema.strict();

export const PlatformServiceProductParamSchema = z.object({
  id: z.uuid("无效的平台服务商品 ID"),
});

const PlatformServiceProductDraftShape = {
  code: z.string().trim().min(1, "商品编码不能为空")
    .max(80, "商品编码不能超过 80 个字符"),
  title: z.string().trim().min(1, "商品名称不能为空")
    .max(120, "商品名称不能超过 120 个字符"),
  term_years: z.number().int().min(1, "服务年限不能小于 1")
    .max(3, "服务年限不能超过 3"),
  list_amount_fen: z.number().int().positive("原价必须大于 0"),
  amount_fen: z.number().int().positive("实际售价必须大于 0"),
  service_scope: z.array(
    z.string().trim().min(1, "服务范围不能为空")
      .max(200, "单条服务范围不能超过 200 个字符"),
  ).min(1, "服务范围不能为空").max(20, "服务范围不能超过 20 条"),
  terms_content: z.string().trim().min(1, "服务条款不能为空")
    .max(20000, "服务条款不能超过 20000 个字符"),
};

export const PlatformServiceProductDraftSchema =
  z.object(PlatformServiceProductDraftShape).strict().superRefine(
    validatePriceBounds,
  );

export const PlatformServiceProductUpdateSchema =
  z.object(PlatformServiceProductDraftShape).partial().extend({
    expected_version: z.number().int().positive("商品版本必须大于 0"),
  }).strict().superRefine(validatePriceBounds);

function validatePriceBounds(
  value: {
    amount_fen?: number;
    list_amount_fen?: number;
  },
  context: z.RefinementCtx,
) {
  if (
    value.amount_fen === undefined ||
    value.list_amount_fen === undefined
  ) {
    return;
  }

  if (value.amount_fen > value.list_amount_fen) {
    context.addIssue({
      code: "custom",
      path: ["amount_fen"],
      message: "实际售价不能高于原价",
    });
  }
}

export const PlatformServiceProductActionSchema = z.object({
  expected_version: z.number().int().positive("商品版本必须大于 0"),
  idempotency_key: z.uuid("幂等键格式不正确"),
}).strict();

export type PlatformServiceProductListQuery =
  z.infer<typeof PlatformServiceProductListQuerySchema>;
export type PlatformServiceProductDraftInput =
  z.infer<typeof PlatformServiceProductDraftSchema>;
export type PlatformServiceProductUpdateInput =
  z.infer<typeof PlatformServiceProductUpdateSchema>;
export type PlatformServiceProductActionInput =
  z.infer<typeof PlatformServiceProductActionSchema>;
