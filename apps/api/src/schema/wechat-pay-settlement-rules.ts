import { z } from "zod";

import { PaginationQuerySchema } from "@/schema/request";
import { WechatPayApplymentSubjectTypeSchema } from "@/schema/wechat-pay-applyments";

const optionalQueryValue = <T extends z.ZodTypeAny>(schema: T) =>
  z.preprocess((value) => {
    if (value == null) return undefined;
    if (typeof value !== "string") return value;
    const normalized = value.trim();
    return normalized || undefined;
  }, schema.optional());

export const WechatPaySettlementRuleListQuerySchema =
  PaginationQuerySchema.extend({
    subject_type: optionalQueryValue(WechatPayApplymentSubjectTypeSchema),
  });

export type WechatPaySettlementRuleListQuery =
  z.infer<typeof WechatPaySettlementRuleListQuerySchema>;
