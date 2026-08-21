import { z } from "zod";
import {
  DouyinEntryPathSchema,
  DOUYIN_PROJECT_PHASE_VALUES,
  DOUYIN_VISIT_PERIOD_VALUES,
} from "@gooes/domain";
import { PaginationQuerySchema } from "@/schema/request";

const AttributionCodeSchema = z.string().trim()
  .regex(/^[A-Za-z0-9_-]{1,64}$/, "归因编号格式无效");

export const DouyinLaunchContextSchema = z.strictObject({
  entry_path: DouyinEntryPathSchema,
  scene: z.string().trim().regex(/^[0-9]{1,20}$/, "抖音场景值格式无效"),
  source_type: z.enum([
    "short_video",
    "live",
    "search",
    "profile",
    "share",
    "direct",
    "other",
  ]),
  campaign_code: AttributionCodeSchema.optional(),
  content_id: AttributionCodeSchema.optional(),
});

export const DouyinMiniappSessionRequestSchema = z.strictObject({
  app_id: z.string().trim().min(1).max(128),
  deployment_key: z.string().trim().min(1).max(128).optional(),
  code: z.string().trim().min(1).max(256),
  launch_context: DouyinLaunchContextSchema,
});

export const DouyinContentPageQuerySchema = PaginationQuerySchema.strict();

export const DouyinCaseListQuerySchema = PaginationQuerySchema.extend({
  style: z.string().trim().min(1).max(40).optional(),
  layout: z.string().trim().min(1).max(40).optional(),
}).strict();

export const DouyinProjectListQuerySchema = DouyinCaseListQuerySchema.extend({
  phase: z.enum(DOUYIN_PROJECT_PHASE_VALUES).optional(),
}).strict();

export const DouyinContentIdParamsSchema = z.strictObject({
  id: z.uuid("无效的公开内容 ID"),
});

const PhoneSchema = z.string().trim().regex(/^1[3-9][0-9]{9}$/, "手机号格式无效");

export const DouyinLeadSmsRequestSchema = z.strictObject({
  phone: PhoneSchema,
  attribution: DouyinLaunchContextSchema,
});

export const DouyinLeadRequestSchema = z.strictObject({
  name: z.string().trim().min(1).max(40),
  phone: PhoneSchema,
  sms_code: z.string().trim().regex(/^[0-9]{6}$/, "验证码格式无效"),
  community: z.string().trim().min(1).max(80),
  preferred_visit_date: z.iso.date("期望量房日期格式无效"),
  preferred_visit_period: z.enum(DOUYIN_VISIT_PERIOD_VALUES),
  budget_estimate_id: z.uuid("预算编号格式无效").optional(),
  demand: z.string().trim().min(1).max(1000).optional(),
  privacy_policy_version: z.string().trim().min(1).max(40),
  consented_at: z.iso.datetime({ offset: true }),
  idempotency_key: z.uuid("幂等键格式无效"),
  attribution: DouyinLaunchContextSchema,
});

const DOUYIN_CLIENT_EVENT_VALUES = [
  "app_launch",
  "page_view",
  "case_view",
  "site_view",
  "lead_cta_click",
  "phone_call_click",
] as const;

export const DouyinAnalyticsRequestSchema = z.strictObject({
  events: z.array(z.strictObject({
    event_name: z.enum(DOUYIN_CLIENT_EVENT_VALUES),
    occurred_at: z.iso.datetime({ offset: true }),
    attribution: DouyinLaunchContextSchema,
    entity_id: z.uuid("事件实体 ID 格式无效").optional(),
  })).min(1).max(20),
});

export type DouyinMiniappSessionRequest = z.infer<
  typeof DouyinMiniappSessionRequestSchema
>;
export type DouyinContentPageQuery = z.infer<typeof DouyinContentPageQuerySchema>;
export type DouyinCaseListQuery = z.infer<typeof DouyinCaseListQuerySchema>;
export type DouyinProjectListQuery = z.infer<typeof DouyinProjectListQuerySchema>;
export type DouyinLeadSmsRequest = z.infer<typeof DouyinLeadSmsRequestSchema>;
export type DouyinLeadRequest = z.infer<typeof DouyinLeadRequestSchema>;
export type DouyinAnalyticsRequest = z.infer<typeof DouyinAnalyticsRequestSchema>;
