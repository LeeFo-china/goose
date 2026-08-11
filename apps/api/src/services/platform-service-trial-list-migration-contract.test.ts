import { describe, expect, test } from 'bun:test';
import { readFile } from 'node:fs/promises';

const migrationPath = `${import.meta.dir}/../../../../supabase/migrations/20260811005555_create_platform_service_trials.sql`;

describe('platform service trial effective list migration', () => {
  test('provides one bounded service-role-only effective list RPC', async () => {
    const sql = (await readFile(migrationPath, 'utf8')).toLowerCase();
    const start = sql.indexOf('create or replace function public.platform_service_trial_list');
    const end = sql.indexOf('$$;', sql.indexOf('as $$', start)) + 3;
    const body = sql.slice(start, end);
    expect(start).toBeGreaterThan(0);
    expect(body).toContain('effective_status');
    expect(body).toContain('limit p_page_size');
    expect(body).toContain('offset (p_page - 1) * p_page_size');
    expect(body).toContain('order by created_at desc, id desc');
    expect(body).toContain('count(*)');
    expect(body).toContain("- array['enterprise_identity_hash', 'effective_status'");
    expect(body).toContain("substring(contact_phone from 1 for 3) || '****'");
    expect(body).toContain("substring(assignee.phone from 1 for 3) || '****'");
    expect(body).not.toContain('execute ');
    expect(sql).toContain('revoke all on function public.platform_service_trial_list');
    expect(sql).toContain('grant execute on function public.platform_service_trial_list');
  });

  test('makes lifecycle status facts exact and fail closed', async () => {
    const sql = (await readFile(migrationPath, 'utf8')).toLowerCase();
    const check = sql.slice(sql.indexOf('tenant_service_trials_status_facts_check'),
      sql.indexOf('tenant_service_trials_review_facts_check'));
    expect(check).toContain("status = 'rejected'");
    expect(check).toContain('granted_at is null');
    expect(check).toContain("status = 'withdrawn'");
    expect(check).toContain('review_decision is null');
    expect(check).toContain("status in ('active', 'grace_period', 'expired')");
    expect(check).toContain('withdrawn_at is null');
    expect(check).toContain(') is true),');
  });
});
