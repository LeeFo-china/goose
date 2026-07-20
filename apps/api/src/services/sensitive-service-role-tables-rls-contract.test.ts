import { describe, expect, test } from "bun:test";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const migrationPath = join(
  import.meta.dir,
  "../../../../supabase/migrations/20260720120000_harden_sensitive_service_role_tables_rls.sql",
);
const migrationDir = join(import.meta.dir, "../../../../supabase/migrations");

describe("sensitive service-role tables RLS contract", () => {
  test("enables deny-by-default RLS for partner rebind and refund requests", () => {
    const sql = readFileSync(migrationPath, "utf8");

    for (const table of [
      "platform_partner_member_rebind_requests",
      "tenant_credit_refund_requests",
    ]) {
      expect(sql).toContain(
        `ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY;`,
      );
      expect(sql).toContain(
        `REVOKE ALL ON TABLE public.${table} FROM PUBLIC, anon, authenticated;`,
      );
      expect(sql).toContain(
        `GRANT SELECT, INSERT, UPDATE ON TABLE public.${table} TO service_role;`,
      );
    }
  });

  test("does not expose client policies or force RLS on definer RPC tables", () => {
    const sql = readFileSync(migrationPath, "utf8");

    expect(sql).not.toMatch(/^\s*CREATE POLICY\b/im);
    expect(sql).not.toMatch(
      /^\s*ALTER TABLE\b[^;]*\bFORCE ROW LEVEL SECURITY;/im,
    );
    expect(sql).toContain(
      "REVOKE DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE",
    );
    expect(sql).toContain("COMMIT;");
  });

  test("keeps every public table created after the RLS baseline covered", () => {
    const sources = readdirSync(migrationDir)
      .filter(
        (name) =>
          name.endsWith(".sql") &&
          name > "20260706110000_harden_public_direct_access.sql",
      )
      .sort()
      .map((name) => readFileSync(join(migrationDir, name), "utf8"));
    const combined = sources.join("\n");
    const tables = new Set(
      sources.flatMap((source) =>
        [
          ...source.matchAll(
            /CREATE TABLE(?: IF NOT EXISTS)? public\.([a-z0-9_]+)/gi,
          ),
        ].map((match) => match[1] as string),
      ),
    );

    for (const table of tables) {
      expect(combined).toMatch(
        new RegExp(
          `ALTER TABLE\\s+public\\.${table}\\s+ENABLE ROW LEVEL SECURITY`,
          "i",
        ),
      );
    }
  });
});
