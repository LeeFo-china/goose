import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";

const migrationUrl = new URL(
  "../../../../../supabase/migrations/20260824131000_allow_douyin_testing_release_template_replacement.sql",
  import.meta.url,
);
const migration = existsSync(migrationUrl) ? readFileSync(migrationUrl, "utf8") : "";
const compactMigration = migration.replace(/\s+/g, " ");

describe("Douyin testing release template replacement migration", () => {
  test("exists as a forward-only migration", () => {
    expect(migration).toContain(
      "allow_douyin_testing_release_template_replacement",
    );
    expect(migration).not.toContain("UPDATE public.douyin_miniapp_releases");
    expect(migration).not.toContain("DELETE FROM public.douyin_miniapp_releases");
  });

  test("allows uploaded and testing tenant releases to be superseded by a newer template", () => {
    expect(compactMigration).toContain(
      "CREATE OR REPLACE FUNCTION public.prevent_douyin_unfinished_release_replacement()",
    );
    expect(compactMigration).toContain(
      "release.status IN ( 'created', 'audit_pending', 'audit_approved' )",
    );
    expect(compactMigration).not.toContain(
      "release.status IN ( 'created', 'uploaded', 'testing', 'audit_pending', 'audit_approved' )",
    );
    expect(compactMigration).toContain(
      "CREATE UNIQUE INDEX douyin_miniapp_releases_one_unfinished_installation_idx",
    );
    expect(compactMigration).toContain(
      "WHERE status IN ( 'created', 'audit_pending', 'audit_approved' )",
    );
    expect(compactMigration).not.toContain(
      "WHERE status IN ( 'created', 'uploaded', 'testing', 'audit_pending', 'audit_approved' )",
    );
  });

  test("still blocks active operations and protected release statuses", () => {
    expect(compactMigration).toContain(
      "release.operation_claim_token IS NOT NULL",
    );
    expect(compactMigration).toContain(
      "release.operation_claim_expires_at > clock_timestamp()",
    );
    expect(compactMigration).toContain(
      "MESSAGE = 'DOUYIN_TENANT_RELEASE_IN_PROGRESS'",
    );
    expect(compactMigration).toContain(
      "MESSAGE = 'DOUYIN_UNFINISHED_RELEASE_DUPLICATES_EXIST'",
    );
    expect(compactMigration).toContain("LOCK TABLE public.douyin_miniapp_releases");
  });

  test("preserves hardened trigger function ACL and search path", () => {
    expect(compactMigration).toContain("SECURITY DEFINER");
    expect(compactMigration).toContain("SET search_path = pg_catalog, public");
    expect(compactMigration).toContain(
      "REVOKE ALL ON FUNCTION public.prevent_douyin_unfinished_release_replacement() FROM PUBLIC, anon, authenticated",
    );
  });
});
