import { describe, expect, mock, test } from 'bun:test';

process.env.SUPABASE_URL ??= 'http://127.0.0.1:54321';
process.env.SUPABASE_PUBLISH ??= 'test-publish-key';
process.env.SUPABASE_SERVICE_ROLE_KEY ??= 'test-service-role-key';

describe('PlatformServiceTrialRollout', () => {
  test('fails closed and reads the two rollout switches independently', async () => {
    const {
      PLATFORM_SERVICE_TRIAL_ACCESS_ENABLED_KEY,
      PLATFORM_SERVICE_TRIAL_APPLICATION_ENABLED_KEY,
      PlatformServiceTrialRollout,
    } = await import('./platform-service-trial-rollout');
    const getBoolean = mock(async (_key: string, fallback: boolean) => fallback);
    const rollout = new PlatformServiceTrialRollout(getBoolean);

    expect(await rollout.isApplicationEnabled()).toBe(false);
    expect(await rollout.isAccessEnabled()).toBe(false);
    expect(getBoolean).toHaveBeenNthCalledWith(
      1,
      PLATFORM_SERVICE_TRIAL_APPLICATION_ENABLED_KEY,
      false,
    );
    expect(getBoolean).toHaveBeenNthCalledWith(
      2,
      PLATFORM_SERVICE_TRIAL_ACCESS_ENABLED_KEY,
      false,
    );
  });
});
