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

const qualification = {
  title: '建筑业企业资质',
  image_url: 'https://cdn.example.com/qualification.png',
} as const;

const homeBanner = {
  image_url: 'https://cdn.example.com/banner.png',
  title: '品质装修',
  subtitle: '让家更有温度',
} as const;

const trustMetric = { label: '服务家庭', value: '1200+' } as const;

const runtimeConfig = {
  brand: {
    logo_url: 'https://cdn.example.com/logo.png',
    qualifications: [qualification],
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
  home_banners: [homeBanner],
  trust_metrics: [trustMetric],
  privacy_policy_version: '2026-07-19',
} satisfies DouyinRuntimeConfigDto;

interface CollectionBoundaryCase {
  name: string;
  max: number;
  createConfig: (size: number) => unknown;
}

interface TextBoundaryCase {
  name: string;
  accepted: readonly string[];
  rejected: readonly string[];
  createConfig: (value: string) => unknown;
}

interface InvalidConfigCase {
  name: string;
  config: unknown;
}

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

  const collectionBoundaryCases: readonly CollectionBoundaryCase[] = [
    {
      name: 'qualifications',
      max: 12,
      createConfig: (size) => ({
        ...runtimeConfig,
        brand: {
          ...runtimeConfig.brand,
          qualifications: Array.from({ length: size }, () => qualification),
        },
      }),
    },
    {
      name: 'home banners',
      max: 5,
      createConfig: (size) => ({
        ...runtimeConfig,
        home_banners: Array.from({ length: size }, () => homeBanner),
      }),
    },
    {
      name: 'trust metrics',
      max: 4,
      createConfig: (size) => ({
        ...runtimeConfig,
        trust_metrics: Array.from({ length: size }, () => trustMetric),
      }),
    },
  ];

  for (const boundary of collectionBoundaryCases) {
    test(`accepts exactly the maximum ${boundary.name}`, () => {
      expect(
        DouyinRuntimeConfigSchema.safeParse(
          boundary.createConfig(boundary.max),
        ).success,
      ).toBe(true);
    });

    test(`rejects ${boundary.name} above the maximum`, () => {
      expect(
        DouyinRuntimeConfigSchema.safeParse(
          boundary.createConfig(boundary.max + 1),
        ).success,
      ).toBe(false);
    });
  }

  const textBoundaryCases: readonly TextBoundaryCase[] = [
    {
      name: 'qualification title',
      accepted: ['x', 'x'.repeat(40)],
      rejected: ['', 'x'.repeat(41)],
      createConfig: (title) => ({
        ...runtimeConfig,
        brand: {
          ...runtimeConfig.brand,
          qualifications: [{ ...qualification, title }],
        },
      }),
    },
    {
      name: 'banner title',
      accepted: ['', 'x'.repeat(40)],
      rejected: ['x'.repeat(41)],
      createConfig: (title) => ({
        ...runtimeConfig,
        home_banners: [{ ...homeBanner, title }],
      }),
    },
    {
      name: 'banner subtitle',
      accepted: ['', 'x'.repeat(80)],
      rejected: ['x'.repeat(81)],
      createConfig: (subtitle) => ({
        ...runtimeConfig,
        home_banners: [{ ...homeBanner, subtitle }],
      }),
    },
    {
      name: 'trust metric label',
      accepted: ['', 'x'.repeat(16)],
      rejected: ['x'.repeat(17)],
      createConfig: (label) => ({
        ...runtimeConfig,
        trust_metrics: [{ ...trustMetric, label }],
      }),
    },
    {
      name: 'trust metric value',
      accepted: ['', 'x'.repeat(16)],
      rejected: ['x'.repeat(17)],
      createConfig: (value) => ({
        ...runtimeConfig,
        trust_metrics: [{ ...trustMetric, value }],
      }),
    },
    {
      name: 'privacy policy version',
      accepted: ['x', 'x'.repeat(40)],
      rejected: ['', 'x'.repeat(41)],
      createConfig: (privacy_policy_version) => ({
        ...runtimeConfig,
        privacy_policy_version,
      }),
    },
  ];

  for (const boundary of textBoundaryCases) {
    test(`enforces the ${boundary.name} text boundaries`, () => {
      for (const value of boundary.accepted) {
        expect(
          DouyinRuntimeConfigSchema.safeParse(boundary.createConfig(value))
            .success,
        ).toBe(true);
      }
      for (const value of boundary.rejected) {
        expect(
          DouyinRuntimeConfigSchema.safeParse(boundary.createConfig(value))
            .success,
        ).toBe(false);
      }
    });
  }

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

  const insecureAssetCases: readonly InvalidConfigCase[] = [
    {
      name: 'brand logo',
      config: {
        ...runtimeConfig,
        brand: {
          ...runtimeConfig.brand,
          logo_url: 'http://cdn.example.com/logo.png',
        },
      },
    },
    {
      name: 'qualification image',
      config: {
        ...runtimeConfig,
        brand: {
          ...runtimeConfig.brand,
          qualifications: [
            {
              ...qualification,
              image_url: 'http://cdn.example.com/qualification.png',
            },
          ],
        },
      },
    },
    {
      name: 'home banner image',
      config: {
        ...runtimeConfig,
        home_banners: [
          {
            ...homeBanner,
            image_url: 'http://cdn.example.com/banner.png',
          },
        ],
      },
    },
  ];

  for (const invalidCase of insecureAssetCases) {
    test(`rejects a non-HTTPS ${invalidCase.name}`, () => {
      expect(
        DouyinRuntimeConfigSchema.safeParse(invalidCase.config).success,
      ).toBe(false);
    });
  }

  const nestedUnknownKeyCases: readonly InvalidConfigCase[] = [
    {
      name: 'brand',
      config: {
        ...runtimeConfig,
        brand: { ...runtimeConfig.brand, unknown: true },
      },
    },
    {
      name: 'theme',
      config: {
        ...runtimeConfig,
        theme: { ...runtimeConfig.theme, unknown: true },
      },
    },
    {
      name: 'features',
      config: {
        ...runtimeConfig,
        features: { ...runtimeConfig.features, unknown: true },
      },
    },
    {
      name: 'qualification',
      config: {
        ...runtimeConfig,
        brand: {
          ...runtimeConfig.brand,
          qualifications: [{ ...qualification, unknown: true }],
        },
      },
    },
    {
      name: 'home banner',
      config: {
        ...runtimeConfig,
        home_banners: [{ ...homeBanner, unknown: true }],
      },
    },
    {
      name: 'trust metric',
      config: {
        ...runtimeConfig,
        trust_metrics: [{ ...trustMetric, unknown: true }],
      },
    },
  ];

  for (const invalidCase of nestedUnknownKeyCases) {
    test(`rejects an unknown key in ${invalidCase.name}`, () => {
      expect(
        DouyinRuntimeConfigSchema.safeParse(invalidCase.config).success,
      ).toBe(false);
    });
  }
});
