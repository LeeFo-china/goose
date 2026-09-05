import { z } from 'zod';

export const DOUYIN_ENTRY_PATH_VALUES = [
  'pages/home/index',
  'pages/company/index',
  'pages/privacy/index',
  'pages/cases/index',
  'pages/case-detail/index',
  'pages/sites/index',
  'pages/site-detail/index',
  'pages/budget/index',
  'pages/qa/index',
  'pages/lead/index',
  'pages/lead-success/index',
  'pages/materials/index',
  'pages/material-detail/index',
  'pages/my-materials/index',
] as const;

export const DouyinEntryPathSchema = z.enum(DOUYIN_ENTRY_PATH_VALUES);

export const DOUYIN_INSTALLATION_KIND_VALUES = [
  'merchant',
  'template_development',
] as const;

export const DOUYIN_INSTALLATION_STATUS_VALUES = [
  'authorized_unbound',
  'active',
  'disabled',
  'revoked',
] as const;

export const DOUYIN_RELEASE_STATUS_VALUES = [
  'created',
  'uploaded',
  'testing',
  'audit_pending',
  'audit_rejected',
  'audit_approved',
  'released',
  'failed',
] as const;

export const DOUYIN_MARKETING_EVENT_VALUES = [
  'app_launch',
  'page_view',
  'case_view',
  'site_view',
  'lead_cta_click',
  'sms_send',
  'lead_submit',
  'lead_submit_success',
  'phone_call_click',
  'material_preview',
  'material_claim',
  'material_copy',
  'material_budget_click',
  'material_lead_click',
] as const;

export const DOUYIN_PHONE_CAPTURE_MODE_VALUES = ['sms', 'douyin_phone'] as const;

export const DOUYIN_DEFAULT_CONTACT_SLA_TEXT =
  '工作人员将在营业时间内与你联系';

export const DouyinContactSlaTextSchema = z.string().trim().min(1).max(80);

const DouyinLeadFeatureBaseSchema = z.object({
  cases: z.boolean(),
  sites: z.boolean(),
});

const DouyinSmsLeadFeaturesSchema = DouyinLeadFeatureBaseSchema.extend({
  sms_lead: z.boolean(),
  douyin_phone: z.literal(false),
  phone_capture_mode: z.literal('sms'),
}).strict();

const DouyinClueLeadFeaturesSchema = DouyinLeadFeatureBaseSchema.extend({
  sms_lead: z.literal(true),
  douyin_phone: z.literal(true),
  phone_capture_mode: z.literal('douyin_phone'),
  clue_component_id: z.string().trim()
    .regex(/^[A-Za-z0-9_-]{1,128}$/),
}).strict();

export const DouyinRuntimeConfigSchema = z
  .object({
    brand: z
      .object({
        logo_url: z.url({ protocol: /^https$/ }).nullable(),
        qualifications: z
          .array(
            z
              .object({
                title: z.string().trim().min(1).max(40),
                image_url: z.url({ protocol: /^https$/ }).nullable(),
              })
              .strict(),
          )
          .max(12),
      })
      .strict(),
    theme: z
      .object({
        primary_color: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
        navigation_text_color: z.enum(['black', 'white']),
      })
      .strict(),
    features: z.union([
      DouyinSmsLeadFeaturesSchema,
      DouyinClueLeadFeaturesSchema,
    ]),
    home_banners: z
      .array(
        z
          .object({
            image_url: z.url({ protocol: /^https$/ }),
            title: z.string().max(40),
            subtitle: z.string().max(80),
          })
          .strict(),
      )
      .max(5),
    trust_metrics: z
      .array(
        z
          .object({
            label: z.string().max(16),
            value: z.string().max(16),
          })
          .strict(),
      )
      .max(4),
    privacy_policy_version: z.string().trim().min(1).max(40),
    contact_sla_text: DouyinContactSlaTextSchema.default(
      DOUYIN_DEFAULT_CONTACT_SLA_TEXT,
    ),
  })
  .strict();

export type DouyinInstallationKind =
  (typeof DOUYIN_INSTALLATION_KIND_VALUES)[number];
export type DouyinEntryPath = z.infer<typeof DouyinEntryPathSchema>;
export type DouyinInstallationStatus =
  (typeof DOUYIN_INSTALLATION_STATUS_VALUES)[number];
export type DouyinReleaseStatus =
  (typeof DOUYIN_RELEASE_STATUS_VALUES)[number];
export type DouyinMarketingEventName =
  (typeof DOUYIN_MARKETING_EVENT_VALUES)[number];
export type DouyinPhoneCaptureMode =
  (typeof DOUYIN_PHONE_CAPTURE_MODE_VALUES)[number];
export type DouyinRuntimeConfigInput = z.input<
  typeof DouyinRuntimeConfigSchema
>;
// Normalized runtime output. Optional input defaults are present after parsing.
export type DouyinRuntimeConfigDto = z.output<typeof DouyinRuntimeConfigSchema>;

export function isDouyinTestQrUrlUsable(
  value: string | null | undefined,
  now = Date.now(),
) {
  if (!value) return false;

  try {
    const url = new URL(value);
    if (url.protocol !== 'https:') return false;
    const expires = url.searchParams.get('x-expires');
    if (expires === null) return true;
    if (!/^[1-9][0-9]{0,11}$/.test(expires)) return false;

    const expiresAt = Number(expires) * 1000;
    return Number.isSafeInteger(expiresAt) && expiresAt > now;
  } catch {
    return false;
  }
}
