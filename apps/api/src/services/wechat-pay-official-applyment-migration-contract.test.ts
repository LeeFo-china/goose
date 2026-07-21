import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const migrationPath = fileURLToPath(
  new URL(
    "../../../../supabase/migrations/20260721130000_wechat_pay_official_applyment.sql",
    import.meta.url,
  ),
);
const migration = existsSync(migrationPath)
  ? readFileSync(migrationPath, "utf8")
  : "";
const databaseTypes = readFileSync(
  fileURLToPath(new URL("../types/database.ts", import.meta.url)),
  "utf8",
);

describe("official WeChat Pay applyment migration", () => {
  test("adds encrypted payload and official status evidence", () => {
    expect(migration).toContain("sensitive_payload_ciphertext text NULL");
    expect(migration).toContain("wechat_applyment_state_raw text NULL");
    expect(migration).toContain("sign_url text NULL");
    expect(migration).toContain(
      "audit_detail jsonb NOT NULL DEFAULT '[]'::jsonb",
    );
  });

  test("adds media reuse and an atomic submission claim", () => {
    expect(migration).toContain(
      "CREATE TABLE IF NOT EXISTS public.tenant_wechat_pay_applyment_media",
    );
    expect(migration).toContain(
      "CREATE OR REPLACE FUNCTION public.claim_wechat_pay_applyment_submission",
    );
    expect(migration).toContain("UNIQUE (applyment_id, object_key, sha256)");
  });

  test("registers dedicated submit sync and repair permissions", () => {
    expect(migration).toContain("platform.wechat_pay.applyment.submit");
    expect(migration).toContain("platform.wechat_pay.applyment.sync");
    expect(migration).toContain("platform.wechat_pay.applyment.repair");

    const defaultRoleGrant = migration.match(
      /INSERT INTO public\.role_permissions[\s\S]*?ON CONFLICT \(role_id, permission_id\)[\s\S]*?;/,
    )?.[0];
    expect(defaultRoleGrant).toContain("platform.wechat_pay.applyment.submit");
    expect(defaultRoleGrant).toContain("platform.wechat_pay.applyment.sync");
    expect(defaultRoleGrant).not.toContain("platform.wechat_pay.applyment.repair");
  });

  test("exposes the official applyment schema in generated database types", () => {
    expect(databaseTypes).toContain("tenant_wechat_pay_applyment_media: {");
    expect(databaseTypes).toContain("sensitive_payload_ciphertext: string | null");
    expect(databaseTypes).toContain("claim_wechat_pay_applyment_submission: {");
  });
});
