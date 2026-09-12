import { describe, expect, test } from 'bun:test';
import {
  RenderingAdviceSchema,
  RenderingJobRequestSchema,
  RenderingListQuerySchema,
  RenderingSettingsSchema,
  projectRenderingQuota,
} from './customer-rendering';

const id = '11111111-1111-4111-8111-111111111111';

describe('customer rendering public contract', () => {
  test('allows one trial then requires a verified phone', () => {
    expect(projectRenderingQuota({ phoneVerified: false, consumed: 0, reserved: 0, activeJobId: null }))
      .toMatchObject({ remaining: 1, can_generate: true, blocked_reason: null });
    expect(projectRenderingQuota({ phoneVerified: false, consumed: 1, reserved: 0, activeJobId: null }))
      .toMatchObject({ remaining: 0, can_generate: false, blocked_reason: 'phone_required' });
  });

  test('includes the trial within five and counts merged channel usage', () => {
    expect(projectRenderingQuota({ phoneVerified: true, consumed: 1, reserved: 0, activeJobId: null }))
      .toMatchObject({ trial_used: true, remaining: 4, can_generate: true, blocked_reason: null });
    expect(projectRenderingQuota({ phoneVerified: true, consumed: 2, reserved: 0, activeJobId: null }).remaining).toBe(3);
    expect(projectRenderingQuota({ phoneVerified: true, consumed: 7, reserved: 0, activeJobId: null }))
      .toMatchObject({ remaining: 0, can_generate: false, blocked_reason: 'quota_exhausted' });
  });

  test('reserved jobs cannot be ignored when projecting remaining uses', () => {
    expect(projectRenderingQuota({ phoneVerified: true, consumed: 3, reserved: 1, activeJobId: id }))
      .toMatchObject({ remaining: 1, can_generate: false, blocked_reason: 'job_active', active_job_id: id });
    expect(() => projectRenderingQuota({ phoneVerified: true, consumed: -1, reserved: 0, activeJobId: null })).toThrow();
  });

  test('either a reservation or an active job independently blocks admission', () => {
    for (const state of [{ reserved: 1, activeJobId: null }, { reserved: 0, activeJobId: id }]) {
      expect(projectRenderingQuota({ phoneVerified: true, consumed: 1, ...state }))
        .toMatchObject({ can_generate: false, blocked_reason: 'job_active' });
    }
  });

  test('bounds lists and rejects client authority or arbitrary image URLs', () => {
    expect(RenderingListQuerySchema.parse({})).toEqual({ page: 1, pageSize: 20 });
    expect(RenderingListQuerySchema.safeParse({ pageSize: 101 }).success).toBe(false);
    const request = { style_asset_id: id, room_file_id: id, space: 'living_room', mode: 'soft_furnishing', idempotency_key: id };
    expect(RenderingJobRequestSchema.safeParse(request).success).toBe(true);
    for (const extra of [{ tenant_id: id }, { phone_verified: true }, { image: 'https://example.com/room.jpg' }, { model: 'override' }]) {
      expect(RenderingJobRequestSchema.safeParse({ ...request, ...extra }).success).toBe(false);
    }
  });

  test('requires finite positive budgets before enabling the feature', () => {
    expect(RenderingSettingsSchema.safeParse({ enabled: true, daily_task_limit: null, daily_budget_fen: null }).success).toBe(false);
    expect(RenderingSettingsSchema.safeParse({ enabled: true, daily_task_limit: 50, daily_budget_fen: 10000 }).success).toBe(true);
    expect(RenderingSettingsSchema.safeParse({ enabled: false, daily_task_limit: null, daily_budget_fen: null }).success).toBe(true);
    for (const invalid of [-1, 0, NaN, Infinity, 1.5]) {
      expect(RenderingSettingsSchema.safeParse({ enabled: true, daily_task_limit: invalid, daily_budget_fen: 10000 }).success).toBe(false);
      expect(RenderingSettingsSchema.safeParse({ enabled: true, daily_task_limit: 50, daily_budget_fen: invalid }).success).toBe(false);
    }
  });

  test('separates observed appearances from suggestions in each advice group', () => {
    const item = { observed: '画面墙面呈暖白色', suggested: '选择暖白色系并现场对照色卡' };
    const advice = { colors: [item], materials: [item], furniture: [item], onsite_checks: ['现场确认家具尺寸'] };
    expect(RenderingAdviceSchema.safeParse(advice).success).toBe(true);
    expect(RenderingAdviceSchema.safeParse({ ...advice, brand: '未经证实的品牌' }).success).toBe(false);
    expect(RenderingAdviceSchema.safeParse({ ...advice, colors: [{ ...item, exact_color_code: '#fff' }] }).success).toBe(false);
  });
});
