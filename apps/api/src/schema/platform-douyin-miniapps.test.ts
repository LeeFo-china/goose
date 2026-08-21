import { describe, expect, test } from 'bun:test';

import { DOUYIN_DEFAULT_CONTACT_SLA_TEXT } from '@gooes/domain';

import { DouyinRuntimeConfigSchema } from './platform-douyin-miniapps';

const runtimeConfig = {
  brand: { logo_url: null, qualifications: [] },
  theme: { primary_color: '#C45A32', navigation_text_color: 'black' },
  features: {
    cases: true,
    sites: true,
    sms_lead: true,
    douyin_phone: false,
    phone_capture_mode: 'sms',
  },
  home_banners: [],
  trust_metrics: [],
  privacy_policy_version: '2026-07-19',
};

describe('platform Douyin runtime config schema', () => {
  test('normalizes a legacy config to the shared non-duration SLA fallback', () => {
    expect(DouyinRuntimeConfigSchema.parse(runtimeConfig).contact_sla_text).toBe(
      DOUYIN_DEFAULT_CONTACT_SLA_TEXT,
    );
  });

  test('trims configured SLA copy and enforces strict one-to-eighty bounds', () => {
    expect(
      DouyinRuntimeConfigSchema.parse({
        ...runtimeConfig,
        contact_sla_text: '  工作人员稍后与你联系  ',
      }).contact_sla_text,
    ).toBe('工作人员稍后与你联系');

    for (const contactSlaText of ['', '   ', 'x'.repeat(81)]) {
      expect(
        DouyinRuntimeConfigSchema.safeParse({
          ...runtimeConfig,
          contact_sla_text: contactSlaText,
        }).success,
      ).toBe(false);
    }
    expect(
      DouyinRuntimeConfigSchema.safeParse({
        ...runtimeConfig,
        contact_sla_text: 'x'.repeat(80),
        internal_contact_minutes: 30,
      }).success,
    ).toBe(false);
  });
});
