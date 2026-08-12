import { describe, expect, test } from 'bun:test';
import { readdirSync, readFileSync } from 'node:fs';

const migrationDirectory = `${import.meta.dir}/../../../../supabase/migrations`;
const migrationNames = readdirSync(migrationDirectory)
  .filter((name) => name.endsWith('_expose_platform_trial_tenant_contacts.sql'));
const migrationName = migrationNames[0];
const sql = migrationName
  ? readFileSync(`${migrationDirectory}/${migrationName}`, 'utf8')
  : '';

describe('platform trial tenant contact forward migration', () => {
  test('exists once after the original dev fixture migration', () => {
    expect(migrationNames).toHaveLength(1);
    expect(migrationName).toBeDefined();
    expect(migrationName! > '20260811103000_seed_dev_platform_service_trial_fixtures.sql')
      .toBe(true);
  });

  test('keeps the list RPC bounded and masks tenant contacts at the SQL boundary', () => {
    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.platform_service_trial_list(');
    expect(sql).toContain("'contact_name', CASE WHEN tenant.contact_name IS NULL THEN NULL");
    expect(sql).toContain("char_length(btrim(tenant.contact_phone)) < 8");
    expect(sql).toContain("left(btrim(tenant.contact_phone), 3) || '****'");
    expect(sql).toContain("strpos(lower(coalesce(tenant_contact_name, ''))");
    expect(sql).toContain("strpos(lower(coalesce(tenant_contact_phone, ''))");
    expect(sql).toContain('LIMIT p_page_size OFFSET (p_page - 1) * p_page_size');
    expect(sql).toContain("'tenant_contact_name', 'tenant_contact_phone'");
    expect(sql).toContain('GRANT EXECUTE ON FUNCTION public.platform_service_trial_list');
    expect(sql).toContain('TO service_role');
    expect(sql).toContain('FROM authenticated');
  });

  test('backfills only the six exact develop fixture tenants', () => {
    expect(sql).toContain("key = 'WECHAT_MINIPROGRAM_ENV_VERSION'");
    expect(sql).toContain("lower(btrim(value_text)) = 'develop'");
    expect(sql).toContain('SERVICE_TRIAL_DEV_CONTACT_FIXTURE_PARTIAL');
    for (let suffix = 1; suffix <= 6; suffix += 1) {
      const tenantId = `9f090000-0000-4000-8000-${String(suffix).padStart(12, '0')}`;
      expect(sql).toContain(tenantId);
      expect(sql).toContain(`1990000910${suffix}`);
    }
    expect(sql).not.toMatch(/slug\s+like\s+'dev-trial-%'/i);
    expect(sql).not.toMatch(/update\s+public\.tenant_service_trials[\s\S]*?contact_/i);
  });
});
