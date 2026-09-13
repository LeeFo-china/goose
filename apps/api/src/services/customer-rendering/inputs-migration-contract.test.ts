import { describe, expect, test } from 'bun:test';
import { readFileSync, readdirSync } from 'node:fs';

const migrations = new URL('../../../../../supabase/migrations/', import.meta.url);

function readMigration(): string {
  const matches = readdirSync(migrations).filter((name) =>
    /^\d{14}_create_customer_rendering_private_inputs\.sql$/.test(name),
  );
  expect(matches).toHaveLength(1);
  return readFileSync(new URL(matches[0]!, migrations), 'utf8')
    .replace(/--[^\n]*/g, '')
    .replace(/\s+/g, ' ')
    .replace(/\s*([(),;=<>+])\s*/g, '$1')
    .trim();
}

describe('customer rendering private inputs migration contract', () => {
  test('creates a transactional tenant-scoped private ledger without raw identities or credentials', () => {
    const sql = readMigration();
    expect(sql).toMatch(/^BEGIN;.*COMMIT;$/);
    expect(sql).toContain("SET LOCAL lock_timeout='5s';");
    expect(sql).toContain("SET LOCAL statement_timeout='60s';");
    expect(sql).toContain('CREATE TABLE public.customer_rendering_inputs(');
    expect(sql).toContain('tenant_id uuid NOT NULL REFERENCES public.tenants(id)ON DELETE RESTRICT');
    expect(sql).toContain('UNIQUE(tenant_id,id)');
    expect(sql).toContain('subject_key_version smallint NOT NULL CHECK(subject_key_version>0)');
    expect(sql).toContain("subject_digest text NOT NULL CHECK(subject_digest ~ '^[0-9a-f]{64}$')");
    expect(sql).toContain("CHECK(channel IN('wechat','douyin'))");
    expect(sql).toContain("CHECK((channel='wechat' AND application_id IS NULL AND installation_id IS NULL)OR(channel='douyin' AND application_id IS NOT NULL AND installation_id IS NOT NULL))");
    expect(sql).not.toMatch(/\b(openid|phone|signed_url|secret_key|access_key)\s+text\b/i);
  });

  test('enforces private object uniqueness, bounded images and processing invariants', () => {
    const sql = readMigration();
    expect(sql).toContain("bucket text NOT NULL CHECK(btrim(bucket)<>'')");
    expect(sql).toContain("region text NOT NULL CHECK(btrim(region)<>'')");
    expect(sql).toContain('raw_object_key text NOT NULL UNIQUE');
    expect(sql).toContain('normalized_object_key text UNIQUE');
    expect(sql).toContain("CHECK(purpose IN('room','floor_plan'))");
    expect(sql).toContain("CHECK(declared_mime_type IN('image/jpeg','image/png','image/webp'))");
    expect(sql).toContain('declared_size_bytes integer NOT NULL CHECK(declared_size_bytes BETWEEN 1 AND 10485760)');
    expect(sql).toContain('normalized_size_bytes integer CHECK(normalized_size_bytes BETWEEN 1 AND 10485760)');
    expect(sql).toContain('width integer CHECK(width>0)');
    expect(sql).toContain('height integer CHECK(height>0)');
    expect(sql).toContain("checksum text CHECK(checksum ~ '^[0-9a-f]{64}$')");
    expect(sql).toContain("status text NOT NULL DEFAULT 'issued' CHECK(status IN('issued','processing','pending_review','approved','rejected','failed','deleted'))");
    expect(sql).toContain("CHECK(status NOT IN('pending_review','approved')OR(normalized_object_key IS NOT NULL AND normalized_size_bytes IS NOT NULL AND width IS NOT NULL AND height IS NOT NULL AND checksum IS NOT NULL))");
    expect(sql).toContain("CHECK(status<>'processing' OR processing_lease_expires_at IS NOT NULL)");
  });

  test('restricts access to service role and indexes ownership and raw expiry cleanup', () => {
    const sql = readMigration();
    expect(sql).toContain('ALTER TABLE public.customer_rendering_inputs ENABLE ROW LEVEL SECURITY;');
    expect(sql).toContain('REVOKE ALL ON TABLE public.customer_rendering_inputs FROM PUBLIC,anon,authenticated,service_role;');
    expect(sql.match(/GRANT [^;]+;/g)).toEqual([
      'GRANT SELECT,INSERT,UPDATE ON TABLE public.customer_rendering_inputs TO service_role;',
    ]);
    expect(sql).not.toMatch(/CREATE POLICY/i);
    expect(sql).toContain('ON public.customer_rendering_inputs(tenant_id,channel,subject_key_version,subject_digest,created_at DESC,id)');
    expect(sql).toContain('expires_at timestamptz NOT NULL');
    expect(sql).toContain("raw_cleanup_after timestamptz NOT NULL DEFAULT(now()+interval '24 hours')");
    expect(sql).toContain('ON public.customer_rendering_inputs(raw_cleanup_after,id)WHERE raw_deleted_at IS NULL');
    expect(sql).toContain('BEFORE UPDATE ON public.customer_rendering_inputs FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column()');
  });
});
