import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const migration = readFileSync(
  join(
    import.meta.dir,
    "../../../../supabase/migrations/20260719102000_create_douyin_miniapp_releases.sql",
  ),
  "utf8",
);

describe("Douyin miniapp release operation claims migration", () => {
  test("adds bounded all-or-none operation leases without changing release statuses", () => {
    expect(migration).toContain("operation_name text NULL");
    expect(migration).toContain("operation_claim_token uuid NULL");
    expect(migration).toContain("operation_claim_expires_at timestamptz NULL");
    expect(migration).toMatch(/operation_name IN \(\s*'upload',\s*'test_qr',\s*'submit_audit',\s*'sync_status',\s*'publish'\s*\)/);
    expect(migration).toMatch(/operation_name IS NULL[\s\S]*operation_claim_token IS NULL[\s\S]*operation_claim_expires_at IS NULL[\s\S]*OR[\s\S]*operation_name IS NOT NULL[\s\S]*operation_claim_token IS NOT NULL[\s\S]*operation_claim_expires_at IS NOT NULL/);
    expect(migration).toContain("douyin_miniapp_releases_operation_claim_expiry_idx");
    expect(migration).toContain(
      "(installation_id, operation_claim_expires_at)",
    );
    expect(migration).toMatch(/WHERE operation_claim_expires_at IS NOT NULL/);
    expect(migration).toContain("'created',\n      'uploaded',\n      'testing',\n      'audit_pending',\n      'audit_rejected',\n      'audit_approved',\n      'released',\n      'failed'");
  });

  test("enforces one release per delivery key", () => {
    expect(migration).toContain("douyin_miniapp_releases_delivery_key_unique");
    expect(migration).toMatch(/UNIQUE \(installation_id, template_version\)/);
    expect(migration).toMatch(/WHERE release\.installation_id = p_installation_id\s+AND release\.template_version = p_template_version/);
    expect(migration).toMatch(/v_release\.template_id IS DISTINCT FROM p_template_id[\s\S]*v_release\.channel IS DISTINCT FROM p_channel/);
  });

  test("defines service-role-only atomic bounded claim RPCs", () => {
    for (const name of [
      "claim_douyin_miniapp_release_operation",
      "get_or_create_and_claim_douyin_miniapp_release_upload",
    ]) {
      expect(migration).toContain(`FUNCTION public.${name}`);
      expect(migration).toMatch(new RegExp(
        `REVOKE ALL ON FUNCTION public\\.${name}[\\s\\S]*?FROM PUBLIC, anon, authenticated`,
      ));
      expect(migration).toMatch(new RegExp(
        `GRANT EXECUTE ON FUNCTION public\\.${name}[\\s\\S]*?TO service_role`,
      ));
    }
    expect(migration.match(/SECURITY DEFINER/g)).toHaveLength(3);
    expect(migration.match(/SET search_path = pg_catalog, public/g)).toHaveLength(3);
    expect(migration).toMatch(/p_claim_expires_at > v_now/);
    expect(migration).toMatch(/p_claim_expires_at > v_now \+ interval '5 minutes'/);
    expect(migration).toMatch(/status = ANY\(p_expected_statuses\)/);
    expect(migration).toMatch(/operation_claim_expires_at <= v_now/);
    expect(migration).toContain("recovery_required boolean");
    expect(migration).toMatch(/operation_claim_token IS NOT NULL[\s\S]*operation_claim_expires_at <= v_now/);
  });

  test("keeps upload reuse atomic and returns only release ledger fields", () => {
    expect(migration).toContain(
      "ON CONFLICT ON CONSTRAINT douyin_miniapp_releases_delivery_key_unique",
    );
    expect(migration).toContain("FOR UPDATE");
    expect(migration).toContain("DOUYIN_MINIAPP_RELEASE_DELIVERY_CONFLICT");
    expect(migration).toContain("v_recovery_required");
    expect(migration).toMatch(/status = 'failed'[\s\S]*submitted_at IS NULL[\s\S]*audited_at IS NULL[\s\S]*released_at IS NULL/);
    expect(migration).not.toMatch(/access_token|refresh_token|client_secret/i);
  });

  test("serializes active release operations per installation", () => {
    expect(migration.match(/FROM public\.douyin_miniapp_installations AS installation/g))
      .toHaveLength(3);
    expect(migration.match(/FOR UPDATE/g)?.length).toBeGreaterThanOrEqual(4);
    expect(migration.match(/other_release\.installation_id = v_installation_id/g))
      .toHaveLength(2);
    expect(migration.match(/other_release\.operation_claim_expires_at > v_now/g))
      .toHaveLength(2);
  });

  test("synchronizes installation metadata monotonically under the exact release claim", () => {
    expect(migration).toContain("template_release_id uuid NULL");
    expect(migration).toMatch(/UNIQUE \(id, installation_id\)/);
    expect(migration).toMatch(/FOREIGN KEY \(template_release_id, id\)\s+REFERENCES public\.douyin_miniapp_releases\(id, installation_id\) ON DELETE RESTRICT/);
    expect(migration).toContain("FUNCTION public.sync_douyin_miniapp_release_metadata");
    expect(migration).toMatch(/p_installation_id uuid,\s*p_release_id uuid,\s*p_claim_token uuid/);
    expect(migration).toMatch(/release\.operation_claim_token = p_claim_token/);
    expect(migration).toMatch(/\(v_release\.created_at, v_release\.id\)\s*>= \(v_current_release_created_at, v_template_release_id\)/);
    expect(migration).toMatch(/GREATEST\(installation\.last_submitted_at, v_release\.submitted_at\)/);
    expect(migration).toMatch(/GREATEST\(installation\.last_audited_at, v_release\.audited_at\)/);
    expect(migration).toMatch(/GREATEST\(installation\.last_released_at, v_release\.released_at\)/);
    expect(migration).toMatch(/REVOKE ALL ON FUNCTION public\.sync_douyin_miniapp_release_metadata[\s\S]*FROM PUBLIC, anon, authenticated, service_role/);
    expect(migration).toMatch(/GRANT EXECUTE ON FUNCTION public\.sync_douyin_miniapp_release_metadata[\s\S]*TO service_role/);
  });
});
