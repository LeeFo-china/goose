import { PaginationQuerySchema } from "@/schema/request";
import { z } from "zod";

export const BillingTenantParamSchema = z.object({
  tenantId: z.uuid("无效的租户 ID"),
});

export const BillingPricingRuleParamSchema = z.object({
  id: z.uuid("无效的价格规则 ID"),
});

export const BillingDirectionSchema = z.enum(["in", "out", "freeze", "unfreeze"]);
export const BillingAccountStatusSchema = z.enum(["active", "suspended", "closed"]);
export const BillingPricingScopeSchema = z.enum(["platform_default", "tenant_override"]);
const BooleanQuerySchema = z.preprocess((value) => {
  if (value === true || value === "true" || value === "1") return true;
  if (value === false || value === "false" || value === "0") return false;
  return value;
}, z.boolean());

export const BillingLedgerQuerySchema = PaginationQuerySchema.extend({
  tenant_id: z.uuid("无效的租户 ID").optional(),
  tenant_keyword: z.string().trim().max(80, "租户关键词不能超过 80 个字符").optional(),
  direction: BillingDirectionSchema.optional(),
  metric_code: z.string().trim().max(80, "计费项不能超过 80 个字符").optional(),
  source_type: z.string().trim().max(80, "来源类型不能超过 80 个字符").optional(),
  event_type: z.string().trim().min(1, "流水类型不能为空").max(80, "流水类型不能超过 80 个字符").optional(),
  keyword: z.string().trim().max(80, "关键词不能超过 80 个字符").optional(),
  start_date: z.string().trim().max(30, "开始时间格式非法").optional(),
  end_date: z.string().trim().max(30, "结束时间格式非法").optional(),
});

export const BillingTenantListQuerySchema = PaginationQuerySchema.extend({
  keyword: z.string().trim().max(80, "关键词不能超过 80 个字符").optional(),
  status: BillingAccountStatusSchema.optional(),
  low_balance_only: BooleanQuerySchema.optional(),
});

export const BillingDateRangeQuerySchema = z.object({
  start_date: z.string().trim().max(30, "开始时间格式非法").optional(),
  end_date: z.string().trim().max(30, "结束时间格式非法").optional(),
});

export const BillingManualRechargeSchema = z.object({
  amount_fen: z.coerce.number().int().min(1, "充值金额必须大于 0"),
  credits: z.coerce.number().int().min(1, "充值积分必须大于 0"),
  bonus_credits: z.coerce.number().int().min(0, "赠送积分不能小于 0").default(0),
  remark: z.string().trim().max(300, "备注不能超过 300 个字符").optional(),
  idempotency_key: z.string().trim().min(8, "幂等键不能少于 8 个字符").max(120, "幂等键不能超过 120 个字符").optional(),
});

export const BillingPricingRuleQuerySchema = PaginationQuerySchema.extend({
  tenant_id: z.uuid("无效的租户 ID").optional(),
  scope: BillingPricingScopeSchema.optional(),
  metric_code: z.string().trim().max(80, "计费项不能超过 80 个字符").optional(),
  enabled: BooleanQuerySchema.optional(),
});

export const BillingEventQuerySchema = PaginationQuerySchema.extend({
  tenant_id: z.uuid("无效的租户 ID").optional(),
  tenant_keyword: z.string().trim().max(80, "租户关键词不能超过 80 个字符").optional(),
  metric_code: z.string().trim().max(80, "计费项不能超过 80 个字符").optional(),
  scene_code: z.string().trim().max(120, "场景不能超过 120 个字符").optional(),
  provider: z.string().trim().max(80, "供应商不能超过 80 个字符").optional(),
  model: z.string().trim().max(120, "模型不能超过 120 个字符").optional(),
  source_type: z.string().trim().max(80, "来源类型不能超过 80 个字符").optional(),
  status: z.enum(["pending", "estimated", "charged", "waived", "refunded", "failed"]).optional(),
  start_date: z.string().trim().max(30, "开始时间格式非法").optional(),
  end_date: z.string().trim().max(30, "结束时间格式非法").optional(),
});

export const BillingShadowRunSchema = z.object({
  limit: z.coerce.number().int().min(1, "扫描条数必须大于 0").max(500, "单次扫描最多 500 条").default(100),
  start_date: z.string().trim().max(30, "开始时间格式非法").optional(),
  end_date: z.string().trim().max(30, "结束时间格式非法").optional(),
  sources: z.array(z.enum(["ai", "sms", "social_video"])).optional(),
});

export const BillingAiUsageStatsQuerySchema = z.object({
  tenant_id: z.uuid("无效的租户 ID").optional(),
  tenant_keyword: z.string().trim().max(80, "租户关键词不能超过 80 个字符").optional(),
  scene_code: z.string().trim().max(120, "场景不能超过 120 个字符").optional(),
  provider_code: z.string().trim().max(80, "供应商不能超过 80 个字符").optional(),
  model_code: z.string().trim().max(120, "模型不能超过 120 个字符").optional(),
  start_date: z.string().trim().max(30, "开始时间格式非法").optional(),
  end_date: z.string().trim().max(30, "结束时间格式非法").optional(),
  limit: z.coerce.number().int().min(1, "扫描条数必须大于 0").max(10000, "单次最多分析 10000 条").default(5000),
  min_sample_count: z.coerce.number().int().min(1, "样本门槛必须大于 0").max(10000, "样本门槛过大").default(100),
  safety_factor: z.coerce.number().min(1, "安全系数不能小于 1").max(3, "安全系数不能大于 3").default(1.5),
});

export const BillingPricingRuleCreateSchema = z.object({
  scope: BillingPricingScopeSchema.default("platform_default"),
  tenant_id: z.uuid("无效的租户 ID").nullable().optional(),
  metric_code: z.string().trim().min(1, "计费项不能为空").max(80, "计费项不能超过 80 个字符"),
  scene_code: z.string().trim().max(80, "场景不能超过 80 个字符").nullable().optional(),
  provider: z.string().trim().max(80, "供应商不能超过 80 个字符").nullable().optional(),
  model: z.string().trim().max(120, "模型不能超过 120 个字符").nullable().optional(),
  unit: z.string().trim().min(1, "计费单位不能为空").max(40, "计费单位不能超过 40 个字符"),
  unit_credits: z.coerce.number().int().min(0, "单价积分不能小于 0"),
  min_charge_credits: z.coerce.number().int().min(0, "最低扣费积分不能小于 0").default(0),
  priority: z.coerce.number().int().min(0, "优先级不能小于 0").default(100),
  version: z.coerce.number().int().min(1, "版本号必须大于 0").default(1),
  enabled: z.boolean().default(true),
  effective_at: z.string().trim().max(30, "生效时间格式非法").optional(),
  expires_at: z.string().trim().max(30, "失效时间格式非法").nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).default({}),
});

export const BillingPricingRuleUpdateSchema = BillingPricingRuleCreateSchema.partial().extend({
  tenant_id: z.uuid("无效的租户 ID").nullable().optional(),
});

export type BillingTenantParam = z.infer<typeof BillingTenantParamSchema>;
export type BillingPricingRuleParam = z.infer<typeof BillingPricingRuleParamSchema>;
export type BillingLedgerQuery = z.infer<typeof BillingLedgerQuerySchema>;
export type BillingTenantListQuery = z.infer<typeof BillingTenantListQuerySchema>;
export type BillingDateRangeQuery = z.infer<typeof BillingDateRangeQuerySchema>;
export type BillingManualRechargeInput = z.infer<typeof BillingManualRechargeSchema>;
export type BillingPricingRuleQuery = z.infer<typeof BillingPricingRuleQuerySchema>;
export type BillingPricingRuleCreateInput = z.infer<typeof BillingPricingRuleCreateSchema>;
export type BillingPricingRuleUpdateInput = z.infer<typeof BillingPricingRuleUpdateSchema>;
export type BillingEventQuery = z.infer<typeof BillingEventQuerySchema>;
export type BillingShadowRunInput = z.infer<typeof BillingShadowRunSchema>;
export type BillingAiUsageStatsQuery = z.infer<typeof BillingAiUsageStatsQuerySchema>;
