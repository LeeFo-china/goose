import { describe, expect, test } from 'bun:test';
import { existsSync, readFileSync } from 'node:fs';

const migration = new URL(
  '../../../../../supabase/migrations/20260912150000_create_customer_rendering_quota_ledger.sql',
  import.meta.url,
);

function readMigration(): string {
  return existsSync(migration) ? readFileSync(migration, 'utf8') : '';
}

describe('customer rendering quota ledger migration contract', () => {
  test('creates tenant-scoped accounts, identities, reservations and append-only events', () => {
    const sql = readMigration();

    expect(existsSync(migration)).toBe(true);
    expect(sql).toMatch(/^-- Rollback:/);
    expect(sql).toMatch(/\bBEGIN;[\s\S]*\bCOMMIT;\s*$/);
    for (const table of [
      'customer_rendering_quota_accounts',
      'customer_rendering_identity_bindings',
      'customer_rendering_quota_reservations',
      'customer_rendering_quota_events',
    ]) {
      expect(sql).toContain(`CREATE TABLE public.${table}`);
      expect(sql).toContain(`ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY`);
      expect(sql).toContain(`REVOKE ALL ON TABLE public.${table} FROM PUBLIC, anon, authenticated, service_role`);
    }
    expect(sql).toContain("status IN ('active', 'merged')");
    expect(sql).toContain("channel IN ('wechat', 'douyin')");
    expect(sql).toContain("status IN ('reserved', 'consumed', 'released')");
    expect(sql).toContain("event_type IN ('reserve', 'consume', 'release', 'merge')");
    expect(sql).toContain('customer_rendering_identity_bindings_subject_key');
    expect(sql).toContain('customer_rendering_quota_accounts_phone_key');
    expect(sql).toContain('customer_rendering_quota_reservations_idempotency_key');
    expect(sql).toContain('customer_rendering_quota_events_transition_key');
  });

  test('keeps raw identities out and enforces digest and tenant relationship constraints', () => {
    const sql = readMigration();

    expect(sql).toContain("subject_digest ~ '^[0-9a-f]{64}$'");
    expect(sql).toContain("phone_digest ~ '^[0-9a-f]{64}$'");
    expect(sql).toContain("request_hash ~ '^[0-9a-f]{64}$'");
    expect(sql).toContain('FOREIGN KEY (tenant_id, quota_account_id)');
    expect(sql).toContain('FOREIGN KEY (tenant_id, merged_into_account_id)');
    expect(sql).not.toMatch(/\b(phone|openid|subject_hash)\s+text\b/i);
  });

  test('creates atomic service-role-only quota commands', () => {
    const sql = readMigration();
    for (const functionName of [
      'get_customer_rendering_quota',
      'bind_customer_rendering_phone',
      'reserve_customer_rendering_quota',
      'settle_customer_rendering_quota',
    ]) {
      expect(sql).toContain(`CREATE FUNCTION public.${functionName}`);
      expect(sql).toMatch(new RegExp(
        `CREATE FUNCTION public\\.${functionName}\\([\\s\\S]+?SECURITY DEFINER[\\s\\S]+?SET search_path = pg_catalog, public`,
      ));
      expect(sql).toMatch(new RegExp(
        `REVOKE ALL ON FUNCTION public\\.${functionName}\\([^;]+FROM PUBLIC, anon, authenticated;`,
      ));
      expect(sql).toMatch(new RegExp(
        `GRANT EXECUTE ON FUNCTION public\\.${functionName}\\([^;]+TO service_role;`,
      ));
    }
    expect(sql).toContain('pg_advisory_xact_lock');
    expect(sql).toContain('FOR UPDATE');
    expect(sql).toContain("'phone_required'");
    expect(sql).toContain("'quota_exhausted'");
    expect(sql).toContain("'job_active'");
    expect(sql).toContain("'idempotency_conflict'");
  });

  test('grants no event mutation capability to service role', () => {
    const sql = readMigration();

    expect(sql).toContain(
      'GRANT SELECT, INSERT ON TABLE public.customer_rendering_quota_events TO service_role',
    );
    expect(sql).not.toContain(
      'GRANT SELECT, INSERT, UPDATE ON TABLE public.customer_rendering_quota_events TO service_role',
    );
  });
});
