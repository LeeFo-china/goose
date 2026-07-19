import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";

const migration = new URL(
  "../../../../../supabase/migrations/20260719190232_create_douyin_authorization_event_ledger.sql",
  import.meta.url,
);

function sql(): string {
  return existsSync(migration)
    ? readFileSync(migration, "utf8").replace(/--.*$/gm, "").replace(/\s+/g, " ").trim()
    : "";
}

describe("douyin authorization event ledger migration", () => {
  test("creates a fixed HMAC-keyed ledger with strict claim state invariants", () => {
    const source = sql();
    expect(existsSync(migration)).toBe(true);
    expect(source).toContain("CREATE TABLE public.douyin_authorization_event_deliveries");
    expect(source).toContain("event_key text PRIMARY KEY");
    expect(source).toContain("CHECK (event_key ~ '^[0-9a-f]{64}$')");
    expect(source).toContain("processing_state IN ('processing', 'completed')");
    expect(source).toContain("processing_state = 'processing'");
    expect(source).toContain("claim_token IS NOT NULL");
    expect(source).toContain("claim_expires_at IS NOT NULL");
    expect(source).toContain("processing_state = 'completed'");
    expect(source).toContain("completed_at IS NOT NULL");
    expect(source).toContain("ENABLE ROW LEVEL SECURITY");
    expect(source).toContain("douyin_authorization_events_completed_cleanup_idx");
  });

  test("claims, observes and reclaims one delivery under a sixty-second lease", () => {
    const source = sql();
    expect(source).toContain("FUNCTION public.claim_douyin_authorization_event(");
    expect(source).toContain("v_claim_expires_at timestamptz := v_now + interval '60 seconds'");
    expect(source).toContain("ON CONFLICT (event_key) DO NOTHING");
    expect(source).toContain("FOR UPDATE");
    expect(source).toContain("'claimed'::text");
    expect(source).toContain("'completed'::text");
    expect(source).toContain("'busy'::text");
    expect(source).toContain("'reclaimed'::text");
    expect(source).toContain("FUNCTION public.get_douyin_authorization_event_state(");
  });

  test("finalizes ticket, authorization, revocation and ack only for the active claim", () => {
    const source = sql();
    for (const name of [
      "complete_douyin_ticket_event",
      "complete_douyin_authorization_event",
      "complete_douyin_revocation_event",
      "complete_douyin_unsupported_event",
    ]) {
      const start = source.indexOf(`FUNCTION public.${name}(`);
      expect(start).toBeGreaterThan(-1);
      const body = source.slice(start, source.indexOf("$$;", start));
      expect(body).toContain("delivery.processing_state = 'processing'");
      expect(body).toContain("delivery.claim_token = p_claim_token");
      expect(body).toContain("delivery.claim_expires_at > v_now");
      expect(body).toContain("FOR UPDATE");
      expect(body).toContain("processing_state = 'completed'");
      expect(body).toContain("claim_token = NULL");
      expect(body).toContain("claim_expires_at = NULL");
    }
  });

  test("keeps authorization lifecycle state and credentials atomic", () => {
    const source = sql();
    expect(source).toContain("p_event_name NOT IN ('AUTHORIZED', 'UPDATE_AUTHORIZED')");
    expect(source).toContain("v_existing.component_appid IS DISTINCT FROM p_component_appid");
    expect(source).toContain("WHEN p_event_name = 'AUTHORIZED' THEN NULL");
    expect(source).toContain("WHEN p_event_name = 'UPDATE_AUTHORIZED' THEN installation.tenant_id");
    expect(source).toContain("WHEN p_event_name = 'UPDATE_AUTHORIZED' THEN installation.deployment_key");
    expect(source).toContain("WHEN p_event_name = 'UPDATE_AUTHORIZED' THEN installation.runtime_config");
    expect(source).toContain("authorization_status = 'revoked'");
    expect(source).toContain("v_existing.installation_kind <> 'merchant'");
    expect(source).toContain("MESSAGE = 'DOUYIN_AUTHORIZATION_KIND_CONFLICT'");
    expect(source).toContain("installation_kind = 'merchant'");
    expect(source).toContain("INSERT INTO public.douyin_miniapp_installations( component_appid, authorizer_appid, installation_kind, authorization_status, runtime_config, revoked_at, authorization_event_occurred_at ) VALUES ( p_component_appid, p_authorizer_appid, 'merchant', 'revoked'");
    expect(source).toContain("installation.authorization_event_occurred_at < p_occurred_at");
    expect(source).toContain("installation.authorization_event_occurred_at <= p_occurred_at");
    expect(source).toContain("installation.authorization_status <> 'revoked'");
    for (const column of [
      "access_token_ciphertext", "access_token_iv", "access_token_tag",
      "access_token_key_version", "access_token_expires_at",
      "refresh_token_ciphertext", "refresh_token_iv", "refresh_token_tag",
      "refresh_token_key_version", "refresh_token_expires_at",
      "token_refresh_claim_token", "token_refresh_claim_expires_at", "token_refresh_last_error",
    ]) {
      expect(source).toContain(`${column} = NULL`);
    }
  });

  test("keeps a revoke tombstone authoritative over an older or same-time authorization", () => {
    const source = sql();
    const tombstone = source.indexOf(
      "p_component_appid, p_authorizer_appid, 'merchant', 'revoked'",
    );
    const authorizeStrictlyNewer = source.indexOf(
      "installation.authorization_event_occurred_at < p_occurred_at",
    );
    const revokeNotOlder = source.indexOf(
      "installation.authorization_event_occurred_at <= p_occurred_at",
    );
    expect(tombstone).toBeGreaterThan(-1);
    expect(authorizeStrictlyNewer).toBeGreaterThan(-1);
    expect(revokeNotOlder).toBeGreaterThan(-1);
    expect(source).toContain(
      "installation.authorization_event_occurred_at = p_occurred_at AND installation.authorization_status <> 'revoked'",
    );
  });

  test("exposes only bounded service-role RPC access and a batched retention operation", () => {
    const source = sql();
    expect(source).toContain("SET search_path = pg_catalog, public");
    expect(source).toContain("FUNCTION public.prune_douyin_authorization_event_deliveries(");
    expect(source).toContain("p_limit > 1000");
    expect(source).toContain("LIMIT p_limit");
    expect(source).toContain("REVOKE ALL ON TABLE public.douyin_authorization_event_deliveries FROM PUBLIC, anon, authenticated, service_role");
    expect(source).not.toMatch(/GRANT (?:SELECT|INSERT|UPDATE|DELETE|ALL)[^;]*douyin_authorization_event_deliveries/);
    for (const name of [
      "claim_douyin_authorization_event", "get_douyin_authorization_event_state",
      "complete_douyin_ticket_event", "complete_douyin_authorization_event",
      "complete_douyin_revocation_event", "complete_douyin_unsupported_event",
      "prune_douyin_authorization_event_deliveries",
    ]) {
      expect(source).toMatch(new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${name}\\([\\s\\S]*?TO service_role`));
    }
    expect(source).not.toMatch(/GRANT EXECUTE[\s\S]*?TO (?:PUBLIC|anon|authenticated)/);
  });
});
