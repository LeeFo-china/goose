import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const migrationPath = join(
  import.meta.dir,
  "../../../../../supabase/migrations/20260825102000_split_douyin_release_qr_stages.sql",
);
const baseReleaseMigrationPath = join(
  import.meta.dir,
  "../../../../../supabase/migrations/20260719102000_create_douyin_miniapp_releases.sql",
);
const claimRepairMigrationPath = join(
  import.meta.dir,
  "../../../../../supabase/migrations/20260826113000_allow_douyin_release_audit_qr_claim.sql",
);

function sql(): string {
  expect(existsSync(migrationPath)).toBe(true);
  return readFileSync(migrationPath, "utf8")
    .replace(/--.*$/gm, "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeSql(source: string): string {
  return source.replace(/--.*$/gm, "").replace(/\s+/g, " ").trim();
}

function exactRoleSet(actual: readonly string[], expected: readonly string[]): boolean {
  return actual.length === expected.length
    && actual.every((role, index) => role === expected[index]);
}

function satisfiesClaimRepairContract(source: string): boolean {
  const normalized = normalizeSql(source);
  const functionSignature = "public\\.claim_douyin_miniapp_release_operation\\( uuid, text\\[\\], text, uuid, timestamptz, uuid \\)";
  const definitions = normalized.match(
    /CREATE OR REPLACE FUNCTION public\.claim_douyin_miniapp_release_operation\(/g,
  ) ?? [];
  const operationBlock = normalized.match(
    /p_operation_name <> ALL\(ARRAY\[([^\]]+)\]::text\[\]\)/,
  )?.[1];
  const operations = operationBlock?.match(/'[^']+'/g)?.map((value) => value.slice(1, -1)) ?? [];
  const locks = normalized.match(/\bFOR UPDATE\b/g) ?? [];
  const installationLock = "SELECT installation.id INTO v_installation_id "
    + "FROM public.douyin_miniapp_installations AS installation "
    + "WHERE installation.id = v_installation_id FOR UPDATE;";
  const competingClaimCheck = "IF EXISTS ( SELECT 1 "
    + "FROM public.douyin_miniapp_releases AS other_release";
  const targetReleaseLock = "SELECT release.* INTO v_release "
    + "FROM public.douyin_miniapp_releases AS release "
    + "WHERE release.id = p_release_id FOR UPDATE;";
  const installationLockIndex = normalized.indexOf(installationLock);
  const competingClaimCheckIndex = normalized.indexOf(competingClaimCheck);
  const targetReleaseLockIndex = normalized.indexOf(targetReleaseLock);
  const grantStatements = normalized.match(
    new RegExp(`GRANT [^;]+ ON FUNCTION ${functionSignature} TO [^;]+;`, "g"),
  ) ?? [];
  const exactServiceGrant = "GRANT EXECUTE ON FUNCTION "
    + "public.claim_douyin_miniapp_release_operation( "
    + "uuid, text[], text, uuid, timestamptz, uuid ) TO service_role;";
  const revokeRoles = [...normalized.matchAll(
    new RegExp(`REVOKE ALL ON FUNCTION ${functionSignature} FROM ([A-Za-z_]+)`, "g"),
  )].map((match) => match[1] ?? "").sort();

  return definitions.length === 1
    && exactRoleSet(operations, [
      "upload", "test_qr", "audit_qr", "submit_audit", "sync_status", "publish",
    ])
    && locks.length === 2
    && installationLockIndex >= 0
    && competingClaimCheckIndex > installationLockIndex
    && targetReleaseLockIndex > competingClaimCheckIndex
    && /UPDATE public\.douyin_miniapp_releases AS release SET operation_name = p_operation_name, operation_claim_token = p_claim_token, operation_claim_expires_at = p_claim_expires_at, platform_operator_id = p_operator_id WHERE release\.id = p_release_id; RETURN QUERY/.test(normalized)
    && normalized.includes("SECURITY DEFINER SET search_path = pg_catalog, public")
    && exactRoleSet(grantStatements, [exactServiceGrant])
    && exactRoleSet(revokeRoles, ["PUBLIC", "anon", "authenticated", "service_role"].sort());
}

describe("douyin release QR stage migration", () => {
  test("adds distinct persisted latest and audit QR URLs without dropping legacy data", () => {
    const source = sql();

    expect(source).toContain("ADD COLUMN IF NOT EXISTS latest_test_qr_url text NULL");
    expect(source).toContain("ADD COLUMN IF NOT EXISTS audit_qr_url text NULL");
    expect(source).toMatch(/latest_test_qr_url = COALESCE\(latest_test_qr_url, test_qr_url\)/);
    expect(source).toContain("douyin_miniapp_releases_latest_test_qr_url_check");
    expect(source).toContain("douyin_miniapp_releases_audit_qr_url_check");
    expect(source).not.toMatch(/DROP COLUMN\s+test_qr_url/i);
  });

  test("extends release operation leases with an audit QR operation", () => {
    const source = sql();

    expect(source).toContain("DROP CONSTRAINT IF EXISTS douyin_miniapp_releases_operation_name_check");
    expect(source).toMatch(/operation_name IN \([^)]*'test_qr'[^)]*'audit_qr'[^)]*\)/);
  });

  test("repairs the atomic claim command to accept the audit QR operation", () => {
    const baseMigration = readFileSync(baseReleaseMigrationPath, "utf8");
    expect(createHash("sha256").update(baseMigration).digest("hex"))
      .toBe("ad5846334b2f48231df9962cc772affccddf06160abf60017605b3e052a37165");
    const original = readFileSync(migrationPath, "utf8");
    expect(createHash("sha256").update(original).digest("hex"))
      .toBe("7605db6550cca661d3cb7b554d24f1eea3620bcb971dcd473863d22072fcbaad");
    expect(existsSync(claimRepairMigrationPath)).toBe(true);

    const source = readFileSync(claimRepairMigrationPath, "utf8")
      .replace(/--.*$/gm, "")
      .replace(/\s+/g, " ")
      .trim();
    const signature = "public\\.claim_douyin_miniapp_release_operation\\( uuid, text\\[\\], text, uuid, timestamptz, uuid \\)";

    expect(source).toContain("CREATE OR REPLACE FUNCTION public.claim_douyin_miniapp_release_operation");
    expect(source).toMatch(/p_operation_name <> ALL\(ARRAY\[[^\]]*'test_qr'[^\]]*'audit_qr'[^\]]*'submit_audit'/);
    expect(source).toContain("SECURITY DEFINER SET search_path = pg_catalog, public");
    for (const role of ["PUBLIC", "anon", "authenticated"]) {
      expect(source).toMatch(new RegExp(`REVOKE ALL ON FUNCTION ${signature} FROM ${role}`));
    }
    expect(source).toMatch(new RegExp(`GRANT EXECUTE ON FUNCTION ${signature} TO service_role`));
  });

  test("locks the exact claim function concurrency and ACL contract", () => {
    const source = readFileSync(claimRepairMigrationPath, "utf8");
    expect(satisfiesClaimRepairContract(source)).toBe(true);

    const misplacedInstallationLock = source
      .replace(
        "WHERE release.id = p_release_id;\n  IF NOT FOUND THEN RETURN; END IF;",
        "WHERE release.id = p_release_id\n  FOR UPDATE;\n  IF NOT FOUND THEN RETURN; END IF;",
      )
      .replace(
        "WHERE installation.id = v_installation_id\n  FOR UPDATE;",
        "WHERE installation.id = v_installation_id;",
      );

    const mutations = [
      source.replace("FOR UPDATE;", ";"),
      misplacedInstallationLock,
      source.replace("WHERE release.id = p_release_id;\n\n  RETURN QUERY", "WHERE true;\n\n  RETURN QUERY"),
      source.replace("'audit_qr', 'submit_audit'", "'audit_qr', 'debug', 'submit_audit'"),
      `${source}\nGRANT EXECUTE ON FUNCTION public.claim_douyin_miniapp_release_operation(\n`
        + "  uuid, text[], text, uuid, timestamptz, uuid\n) TO authenticated;\n",
      `${source}\nGRANT ALL ON FUNCTION public.claim_douyin_miniapp_release_operation(\n`
        + "  uuid, text[], text, uuid, timestamptz, uuid\n) TO authenticated;\n",
    ];
    for (const mutation of mutations) {
      expect(satisfiesClaimRepairContract(mutation)).toBe(false);
    }
  });
});
