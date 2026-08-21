import { describe, expect, test } from 'bun:test';

import {
  DOUYIN_DEFAULT_CONTACT_SLA_TEXT,
  DouyinRuntimeConfigSchema as DomainDouyinRuntimeConfigSchema,
} from '@gooes/domain';

import {
  BindPlatformDouyinMiniappSchema,
  DouyinRuntimeConfigSchema,
  PlatformDouyinMiniappSafeRecordSchema,
  UpdatePlatformDouyinMiniappConfigSchema,
  type DouyinRuntimeConfig,
  type DouyinRuntimeConfigInput,
} from './platform-douyin-miniapps';

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
} satisfies DouyinRuntimeConfigInput;

describe('platform Douyin runtime config schema', () => {
  test('re-exports the canonical domain schema by identity', () => {
    expect(DouyinRuntimeConfigSchema).toBe(DomainDouyinRuntimeConfigSchema);
  });

  test('matches the canonical parse matrix without semantic drift', () => {
    const inputs = [
      runtimeConfig,
      {
        ...runtimeConfig,
        brand: {
          ...runtimeConfig.brand,
          qualifications: [{ title: '  装修资质  ', image_url: null }],
        },
        privacy_policy_version: '  2026-08-21  ',
        contact_sla_text: '  工作人员稍后与你联系  ',
      },
      { ...runtimeConfig, privacy_policy_version: '   ' },
      { ...runtimeConfig, unknown: true },
    ];

    for (const input of inputs) {
      expect(DouyinRuntimeConfigSchema.safeParse(input)).toEqual(
        DomainDouyinRuntimeConfigSchema.safeParse(input),
      );
    }
  });

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

  test('normalizes create, update and safe-record runtime configs', () => {
    const normalized = {
      ...runtimeConfig,
      contact_sla_text: DOUYIN_DEFAULT_CONTACT_SLA_TEXT,
    };
    expect(BindPlatformDouyinMiniappSchema.parse({
      tenant_id: '33333333-3333-4333-8333-333333333333',
      runtime_config: runtimeConfig,
    }).runtime_config).toEqual(normalized);
    expect(UpdatePlatformDouyinMiniappConfigSchema.parse({
      runtime_config: runtimeConfig,
    }).runtime_config).toEqual(normalized);
    expect(PlatformDouyinMiniappSafeRecordSchema.parse({
      id: '22222222-2222-4222-8222-222222222222',
      tenant_id: null,
      component_appid: 'component-appid',
      authorizer_appid: 'authorizer-appid',
      installation_kind: 'template_development',
      authorization_status: 'active',
      permission_snapshot: [],
      runtime_config: runtimeConfig,
      template_id: null,
      template_version: null,
      last_submitted_at: null,
      last_audited_at: null,
      last_released_at: null,
      revoked_at: null,
      created_at: '2026-08-21T00:00:00Z',
      updated_at: '2026-08-21T00:00:00Z',
      tenant: null,
    }).runtime_config).toEqual(normalized);

    const rawInput = runtimeConfig satisfies DouyinRuntimeConfigInput;
    const parsedOutput: DouyinRuntimeConfig =
      DouyinRuntimeConfigSchema.parse(rawInput);
    expect(parsedOutput.contact_sla_text).toBe(
      DOUYIN_DEFAULT_CONTACT_SLA_TEXT,
    );
    // @ts-expect-error normalized API output requires the defaulted field
    const invalidOutput: DouyinRuntimeConfig = rawInput;
    expect(invalidOutput.contact_sla_text).toBeUndefined();
  });
});
