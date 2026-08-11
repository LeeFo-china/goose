import { describe, expect, test } from 'bun:test';
import { existsSync, readFileSync } from 'node:fs';

const migrationPath = `${import.meta.dir}/../../../../supabase/migrations/20260811103000_seed_dev_platform_service_trial_fixtures.sql`;

describe('platform service trial dev fixture migration contract', () => {
  const sql = existsSync(migrationPath) ? readFileSync(migrationPath, 'utf8') : '';

  test('exists as a versioned migration', () => {
    expect(existsSync(migrationPath)).toBe(true);
  });

  test('is a strict develop-only no-op everywhere else', () => {
    expect(sql).toContain("key = 'WECHAT_MINIPROGRAM_ENV_VERSION'");
    expect(sql).toContain("lower(btrim(value_text)) = 'develop'");
    expect(sql).toMatch(/IF NOT v_is_develop THEN\s+RETURN;/);
    expect(sql.indexOf('IF NOT v_is_develop')).toBeLessThan(
      sql.indexOf('INSERT INTO public.tenants'),
    );
  });

  test('creates six isolated and discoverable fixture tenants', () => {
    for (const slug of [
      'dev-trial-application',
      'dev-trial-platform-grant',
      'dev-trial-active',
      'dev-trial-grace',
      'dev-trial-expired',
      'dev-trial-converted',
    ]) {
      expect(sql).toContain(slug);
    }
    expect(sql).toContain('SERVICE_TRIAL_DEV_FIXTURE_COLLISION');
    expect(sql).toContain("owner_type, scene, bucket, object_key, mime_type");
    expect(sql).toContain("'billing.service_trial.apply', 'billing.service_trial.read'");
    expect(sql).not.toContain("WHERE slug LIKE 'dev-trial-%'");
    expect(sql).toContain("WHERE id IN (");
  });

  test('keeps the time-derived acceptance matrix stable for a documented window', () => {
    expect(sql).toMatch(/21-day\s+-- acceptance window/);
    expect(sql).toContain("interval '21 days'");
    expect(sql).toContain('forward migration');
    expect(sql).toMatch(
      /Task9 Dev Fixture grace grant'[\s\S]*?30, 23, NULL, NULL, true/,
    );
  });

  test('uses the production commands for application, grant, and conversion', () => {
    expect(sql).toContain("profile_code = 'platform_direct_recharge'");
    expect(sql).not.toContain("profile_code = 'tenant_service_provider'");
    expect(sql).toContain('public.platform_service_trial_apply(');
    expect(sql.match(/public\.platform_service_trial_grant\(/g)?.length).toBe(5);
    expect(sql.match(/public\.platform_service_trial_normalize_effective_status\(/g)?.length)
      .toBe(2);
    expect(sql).toContain('public.platform_service_create_pending_order(');
    expect(sql).toContain('public.platform_service_confirm_payment(');
  });

  test('uses fake fixture identities and never calls an external payment gateway', () => {
    expect(sql).toContain("'Task9 Dev Fixture'");
    expect(sql).toContain("'19900009101'");
    expect(sql).toContain("'19900009106'");
    expect(sql).not.toMatch(/https?:|curl|request_refund|query_transaction/i);
  });
});
