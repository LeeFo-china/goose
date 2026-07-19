import { z } from "zod";

const DouyinEntryPathSchema = z.enum([
  "pages/home/index",
  "pages/company/index",
  "pages/privacy/index",
  "pages/cases/index",
  "pages/case-detail/index",
  "pages/sites/index",
  "pages/site-detail/index",
  "pages/lead/index",
  "pages/lead-success/index",
]);

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

export type DouyinMiniappSessionRequest = z.infer<
  typeof DouyinMiniappSessionRequestSchema
>;
