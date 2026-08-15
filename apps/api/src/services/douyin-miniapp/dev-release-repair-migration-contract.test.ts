import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";

const migrationUrl = new URL(
  "../../../../../supabase/migrations/20260813190000_reconcile_dev_douyin_testing_releases.sql",
  import.meta.url,
);
const migration = existsSync(migrationUrl)
  ? readFileSync(migrationUrl, "utf8").replace(/\s+/g, " ")
  : "";

describe("Douyin development release repair migration", () => {
  test("retires only the two superseded testing releases", () => {
    expect(migration).toContain("82061c96-29ac-4426-baff-5efc1061fbc8");
    expect(migration).toContain("2329c8c1-6eb2-4f15-9d7f-04dcf66047e7");
    expect(migration).toContain("ea547440-fb61-41fa-bf1c-8c0a6304b646");
    expect(migration).toContain("3073642f-4cf4-4f3a-9576-688247733659");
    expect(migration).toContain(
      "v_installation.authorizer_appid IS DISTINCT FROM 'ttd033a68e4e56ccd301'",
    );
    expect(migration).toContain(
      "v_installation.installation_kind IS DISTINCT FROM 'merchant'",
    );
    expect(migration).toContain(
      "v_installation.authorization_status IS DISTINCT FROM 'active'",
    );
    expect(migration).toContain("3eebca47-961f-4899-b976-a3d3208d326b");
    expect(migration).toContain("SET status = 'failed'");
    expect(migration).toContain("GET DIAGNOSTICS v_updated_count = ROW_COUNT");
    expect(migration).not.toContain("DELETE FROM public.douyin_miniapp_releases");
  });

  test("fails closed when the observed development data changed", () => {
    expect(migration).toContain("FOR UPDATE");
    expect(migration).toContain("operation_claim_token IS NULL");
    expect(migration).toContain("operation_claim_expires_at IS NULL");
    expect(migration).toContain("MESSAGE = 'DOUYIN_DEV_RELEASE_REPAIR_PRECONDITION_FAILED'");
    expect(migration).toContain("MESSAGE = 'DOUYIN_DEV_RELEASE_REPAIR_UPDATE_MISMATCH'");
    expect(migration).toContain("status IN ( 'created', 'uploaded', 'testing', 'audit_pending', 'audit_approved' )");
    expect(migration).toContain("v_unfinished_count <> 3");
    expect(migration).toContain("v_matched_count <> 3");
  });

  test("is harmless when the development installation is absent", () => {
    expect(migration).toContain("IF NOT FOUND THEN RETURN");
  });
});
