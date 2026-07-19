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

function functionBody(source: string, name: string): string {
  const start = source.indexOf(`FUNCTION public.${name}(`);
  const end = source.indexOf("$$;", start);
  return start < 0 || end < 0 ? "" : source.slice(start, end);
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
    expect(source).toContain("CREATE TABLE public.douyin_authorization_event_subject_leases");
    expect(source).toContain("PRIMARY KEY (component_appid, authorizer_appid)");
    expect(source).toContain("active_event_name IN ('AUTHORIZED', 'UPDATE_AUTHORIZED', 'UNAUTHORIZED')");
    expect(source).toContain("ALTER TABLE public.douyin_authorization_event_subject_leases ENABLE ROW LEVEL SECURITY");
  });

  test("serializes lifecycle claims per authorizer without blocking unrelated subjects", () => {
    const claim = functionBody(sql(), "claim_douyin_authorization_event");
    const lifecycleStart = claim.indexOf(
      "INSERT INTO public.douyin_authorization_event_subject_leases",
    );
    const subjectLock = claim.indexOf(
      "FROM public.douyin_authorization_event_subject_leases AS subject",
      lifecycleStart,
    );
    const deliveryLock = claim.indexOf(
      "FROM public.douyin_authorization_event_deliveries AS delivery",
      subjectLock,
    );
    expect(lifecycleStart).toBeGreaterThan(-1);
    expect(subjectLock).toBeGreaterThan(lifecycleStart);
    expect(deliveryLock).toBeGreaterThan(subjectLock);
    expect(claim.slice(subjectLock, deliveryLock)).toContain(
      "subject.component_appid = p_component_appid AND subject.authorizer_appid = p_authorizer_appid FOR UPDATE",
    );
    expect(claim).toContain(
      "IF v_subject.claim_expires_at > v_now THEN RETURN QUERY SELECT 'busy'::text",
    );
    expect(claim).not.toContain("pg_advisory");
    expect(claim).not.toMatch(/LOCK TABLE/);
  });

  test("supersedes only an expired older lifecycle claim and completes ignored deliveries", () => {
    const claim = functionBody(sql(), "claim_douyin_authorization_event");
    expect(claim).toContain(
      "v_incoming_priority := CASE WHEN p_event_name = 'UNAUTHORIZED' THEN 2 ELSE 1 END",
    );
    expect(claim).toContain(
      "p_occurred_at < v_subject.active_occurred_at OR (p_occurred_at = v_subject.active_occurred_at AND v_incoming_priority <= v_active_priority)",
    );
    expect(claim).toContain(
      "p_occurred_at, 'completed', v_now",
    );
    expect(claim).toContain(
      "WHERE delivery.event_key = v_subject.active_event_key",
    );
    expect(claim).toContain(
      "SET active_event_key = p_event_key, active_event_name = p_event_name, active_occurred_at = p_occurred_at",
    );
  });

  test("ignores stale lifecycle events against the persisted installation before provider work", () => {
    const claim = functionBody(sql(), "claim_douyin_authorization_event");
    const subject = claim.indexOf(
      "FROM public.douyin_authorization_event_subject_leases AS subject",
    );
    const delivery = claim.indexOf(
      "FROM public.douyin_authorization_event_deliveries AS delivery",
      subject,
    );
    const installation = claim.indexOf(
      "FROM public.douyin_miniapp_installations AS installation",
      delivery,
    );
    const persistedComparison = claim.indexOf(
      "p_occurred_at < v_installation.authorization_event_occurred_at",
      installation,
    );
    const busy = claim.indexOf(
      "IF v_subject.claim_expires_at > v_now",
      persistedComparison,
    );
    expect(subject).toBeGreaterThan(-1);
    expect(delivery).toBeGreaterThan(subject);
    expect(installation).toBeGreaterThan(delivery);
    expect(persistedComparison).toBeGreaterThan(installation);
    expect(busy).toBeGreaterThan(persistedComparison);
    expect(claim).toContain(
      "v_installation.authorization_status = 'revoked' THEN 2 ELSE 1",
    );
    expect(claim).toContain(
      "v_incoming_priority <= v_installation_priority",
    );
    expect(claim).toContain(
      "v_installation.installation_kind <> 'merchant'",
    );
    expect(claim).toContain(
      "v_installation.component_appid IS DISTINCT FROM p_component_appid",
    );
  });

  test("uses subject then delivery then installation lock order for lifecycle finalization", () => {
    const source = sql();
    for (const name of [
      "complete_douyin_authorization_event",
      "complete_douyin_revocation_event",
    ]) {
      const body = functionBody(source, name);
      const subject = body.indexOf(
        "FROM public.douyin_authorization_event_subject_leases AS subject",
      );
      const delivery = body.indexOf(
        "FROM public.douyin_authorization_event_deliveries AS delivery",
        subject,
      );
      const installation = body.indexOf(
        "FROM public.douyin_miniapp_installations AS installation",
        delivery,
      );
      expect(subject).toBeGreaterThan(-1);
      expect(delivery).toBeGreaterThan(subject);
      expect(installation).toBeGreaterThan(delivery);
      expect(body).toContain(
        "SET active_event_key = NULL, active_event_name = NULL, active_occurred_at = NULL, claim_token = NULL, claim_expires_at = NULL",
      );
    }
    expect(functionBody(source, "complete_douyin_ticket_event"))
      .not.toContain("douyin_authorization_event_subject_leases");
    expect(functionBody(source, "complete_douyin_unsupported_event"))
      .not.toContain("douyin_authorization_event_subject_leases");
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
    expect(source).toContain("REVOKE ALL ON TABLE public.douyin_authorization_event_subject_leases FROM PUBLIC, anon, authenticated, service_role");
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
