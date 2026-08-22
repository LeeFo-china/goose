import { describe, expect, test } from 'bun:test';

import * as domain from './index';
import * as shared from './shared';
import {
  DOUYIN_RELEASE_BLOCKER_CODES,
  DOUYIN_RELEASE_WARNING_CODES,
  DouyinReleaseReadinessSchema,
  type DouyinReleaseReadiness,
} from './douyin-release-readiness';

const checkedAt = '2026-08-20T10:00:00+08:00';
const tenant = {
  id: '11111111-1111-4111-8111-111111111111',
  name: '晴天装饰',
} as const;

const readyResult: DouyinReleaseReadiness = {
  ready: true,
  checked_at: checkedAt,
  tenant,
  blockers: [],
  warnings: [],
  metrics: {
    published_project_count: 6,
    in_progress_project_count: 2,
    completed_project_count: 2,
    active_service_area_count: 1,
  },
};

describe('douyin release readiness contracts', () => {
  test('keeps stable finding codes for release blockers and warnings', () => {
    expect(DOUYIN_RELEASE_BLOCKER_CODES).toContain(
      'PUBLIC_PROJECT_TEST_CONTENT',
    );
    expect(DOUYIN_RELEASE_BLOCKER_CODES).toContain('BUDGET_PRICING_MISSING');
    expect(DOUYIN_RELEASE_BLOCKER_CODES).toContain('SMS_UNAVAILABLE');
    expect(DOUYIN_RELEASE_BLOCKER_CODES).toContain('HOST_CONFIGURATION_MISSING');
    expect(DOUYIN_RELEASE_WARNING_CODES).toContain('PUBLIC_PROJECT_LOG_LOW');
  });

  test('rejects ready results with blockers and blocked results without blockers', () => {
    expect(DouyinReleaseReadinessSchema.parse(readyResult)).toEqual(
      readyResult,
    );

    expect(() =>
      DouyinReleaseReadinessSchema.parse({
        ...readyResult,
        blockers: [
          {
            severity: 'blocker',
            code: 'SMS_UNAVAILABLE',
            message: '短信不可用',
            details: {},
          },
        ],
      }),
    ).toThrow();

    expect(() =>
      DouyinReleaseReadinessSchema.parse({
        ...readyResult,
        ready: false,
      }),
    ).toThrow();
  });

  test('rejects unsafe finding details and unknown fields', () => {
    expect(
      DouyinReleaseReadinessSchema.safeParse({
        ...readyResult,
        blockers: [
          {
            severity: 'blocker',
            code: 'PUBLIC_PROJECT_PRIVACY_RISK',
            message: '公开内容疑似包含隐私信息',
            details: {
              phone: '13800138000',
            },
          },
        ],
      }).success,
    ).toBe(false);

    expect(
      DouyinReleaseReadinessSchema.safeParse({
        ...readyResult,
        internal_note: 'do not expose',
      }).success,
    ).toBe(false);
  });

  test('re-exports the same readiness contracts from shared and package root', () => {
    expect(shared.DouyinReleaseReadinessSchema).toBe(
      DouyinReleaseReadinessSchema,
    );
    expect(domain.DouyinReleaseReadinessSchema).toBe(
      DouyinReleaseReadinessSchema,
    );
    expect(shared.DOUYIN_RELEASE_BLOCKER_CODES).toBe(
      DOUYIN_RELEASE_BLOCKER_CODES,
    );
  });
});
