import { describe, expect, test } from 'bun:test';
import { SMS_SCENE_VALUES } from './auth';
import * as domain from './index';
import {
  DOUYIN_INSTALLATION_KIND_VALUES,
  DOUYIN_INSTALLATION_STATUS_VALUES,
  DOUYIN_MARKETING_EVENT_VALUES,
  DOUYIN_PHONE_CAPTURE_MODE_VALUES,
  DOUYIN_RELEASE_STATUS_VALUES,
  DouyinRuntimeConfigSchema,
  type DouyinRuntimeConfigDto,
} from './douyin-miniapp';

const runtimeConfig = {
  brand: {
    logo_url: 'https://cdn.example.com/logo.png',
    qualifications: [
      {
        title: '建筑业企业资质',
        image_url: 'https://cdn.example.com/qualification.png',
      },
    ],
  },
  theme: {
    primary_color: '#1677FF',
    navigation_text_color: 'white',
  },
  features: {
    cases: true,
    sites: true,
    sms_lead: true,
    douyin_phone: false,
    phone_capture_mode: 'sms',
  },
  home_banners: [
    {
      image_url: 'https://cdn.example.com/banner.png',
      title: '品质装修',
      subtitle: '让家更有温度',
    },
  ],
  trust_metrics: [{ label: '服务家庭', value: '1200+' }],
  privacy_policy_version: '2026-07-19',
} satisfies DouyinRuntimeConfigDto;

describe('Douyin miniapp domain contracts', () => {
  test('re-exports the runtime schema from the domain entry point', () => {
    expect(domain.DouyinRuntimeConfigSchema).toBe(DouyinRuntimeConfigSchema);
  });

  test('exports stable lifecycle and event values', () => {
    expect(DOUYIN_INSTALLATION_STATUS_VALUES).toEqual([
      'authorized_unbound',
      'active',
      'disabled',
      'revoked',
    ]);
    expect(DOUYIN_INSTALLATION_KIND_VALUES).toEqual([
      'merchant',
      'template_development',
    ]);
    expect(DOUYIN_RELEASE_STATUS_VALUES).toEqual([
      'created',
      'uploaded',
      'testing',
      'audit_pending',
      'audit_rejected',
      'audit_approved',
      'released',
      'failed',
    ]);
    expect(DOUYIN_MARKETING_EVENT_VALUES).toEqual([
      'app_launch',
      'page_view',
      'case_view',
      'site_view',
      'lead_cta_click',
      'sms_send',
      'lead_submit',
      'lead_submit_success',
      'phone_call_click',
    ]);
    expect(DOUYIN_MARKETING_EVENT_VALUES).toContain('lead_submit_success');
    expect(DOUYIN_PHONE_CAPTURE_MODE_VALUES).toEqual(['sms']);
    expect(SMS_SCENE_VALUES).toContain('douyin_lead');
  });

  test('accepts the strict HTTPS-only runtime configuration', () => {
    expect(DouyinRuntimeConfigSchema.parse(runtimeConfig)).toEqual(runtimeConfig);
  });

  test('rejects unsupported phone capture and unknown configuration', () => {
    expect(
      DouyinRuntimeConfigSchema.safeParse({
        ...runtimeConfig,
        features: {
          ...runtimeConfig.features,
          douyin_phone: true,
          phone_capture_mode: 'douyin_phone',
        },
      }).success,
    ).toBe(false);
    expect(
      DouyinRuntimeConfigSchema.safeParse({
        ...runtimeConfig,
        unknown: true,
      }).success,
    ).toBe(false);
  });

  test('rejects non-HTTPS runtime assets', () => {
    expect(
      DouyinRuntimeConfigSchema.safeParse({
        ...runtimeConfig,
        brand: {
          ...runtimeConfig.brand,
          logo_url: 'http://cdn.example.com/logo.png',
        },
      }).success,
    ).toBe(false);
  });
});
