import { z } from 'zod';

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
] as const;

export const DOUYIN_PHONE_CAPTURE_MODE_VALUES = ['sms'] as const;

export const DouyinRuntimeConfigSchema = z
  .object({
    brand: z
      .object({
        logo_url: z.url({ protocol: /^https$/ }).nullable(),
        qualifications: z
          .array(
            z
              .object({
                title: z.string().min(1).max(40),
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
    features: z
      .object({
        cases: z.boolean(),
        sites: z.boolean(),
        sms_lead: z.boolean(),
        douyin_phone: z.literal(false),
        phone_capture_mode: z.literal('sms'),
      })
      .strict(),
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
    privacy_policy_version: z.string().min(1).max(40),
  })
  .strict();

export type DouyinInstallationKind =
  (typeof DOUYIN_INSTALLATION_KIND_VALUES)[number];
export type DouyinInstallationStatus =
  (typeof DOUYIN_INSTALLATION_STATUS_VALUES)[number];
export type DouyinReleaseStatus =
  (typeof DOUYIN_RELEASE_STATUS_VALUES)[number];
export type DouyinMarketingEventName =
  (typeof DOUYIN_MARKETING_EVENT_VALUES)[number];
export type DouyinPhoneCaptureMode =
  (typeof DOUYIN_PHONE_CAPTURE_MODE_VALUES)[number];
export type DouyinRuntimeConfigDto = z.infer<
  typeof DouyinRuntimeConfigSchema
>;
