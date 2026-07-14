import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const migration = new URL(
  "../../../../supabase/migrations/20260714212000_claim_tenant_onboarding_notifications.sql",
  import.meta.url,
);

function sql() {
  return readFileSync(migration, "utf8");
}

describe("tenant-onboarding notification claim migration", () => {
  test("adds an expiring token lease and a bounded processing index", () => {
    const source = sql();
    expect(source).toContain("claim_token uuid");
    expect(source).toContain("claim_expires_at timestamptz");
    expect(source).toContain("'processing'");
    expect(source).toContain("tenant_onboarding_notifications_processing_lease_idx");
    expect(source).toContain("WHERE status = 'processing'");
  });

  test("claims pending, failed, or expired work and increments once", () => {
    const source = sql();
    expect(source).toContain("claim_tenant_onboarding_notification");
    expect(source).toContain("attempt_count = delivery.attempt_count + 1");
    expect(source).toContain("delivery.attempt_count < p_max_attempts");
    expect(source).toContain("delivery.claim_expires_at <= p_now");
    expect(source).toContain("gen_random_uuid()");
  });

  test("finalizes only the currently processing claim token", () => {
    const source = sql();
    expect(source).toContain("finalize_tenant_onboarding_notification_sent");
    expect(source).toContain("finalize_tenant_onboarding_notification_failed");
    expect(source.match(/delivery\.status = 'processing'/g)?.length ?? 0)
      .toBeGreaterThanOrEqual(2);
    expect(source.match(/delivery\.claim_token = p_claim_token/g)).toHaveLength(2);
    expect(source.match(/claim_token = NULL/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
  });

  test("keeps claim/finalize RPCs service-role-only", () => {
    const source = sql();
    for (const name of [
      "claim_tenant_onboarding_notification",
      "finalize_tenant_onboarding_notification_sent",
      "finalize_tenant_onboarding_notification_failed",
    ]) {
      expect(source).toContain(`REVOKE ALL ON FUNCTION public.${name}`);
      expect(source).toMatch(new RegExp(
        `GRANT EXECUTE ON FUNCTION public\\.${name}[^;]+ TO service_role;`,
        "s",
      ));
    }
  });
});
