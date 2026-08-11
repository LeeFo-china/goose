import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'bun:test';

const migrationPath = `${import.meta.dir}/../../../../supabase/migrations/20260811090000_add_platform_service_trial_rollout_settings.sql`;

describe('platform service trial rollout settings migration', () => {
  test('keeps production closed and only enables both switches for develop', () => {
    const sql = readFileSync(migrationPath, 'utf8').toLowerCase();

    expect(sql).toContain('platform_service_trial_application_enabled');
    expect(sql).toContain('platform_service_trial_access_enabled');
    expect(sql).toContain('wechat_miniprogram_env_version');
    expect(sql).toContain("= 'develop'");
    expect(sql).toContain("else 'false'");
    expect(sql).toContain('where not exists');
    expect(sql).not.toContain('on conflict (key)');
  });
});
