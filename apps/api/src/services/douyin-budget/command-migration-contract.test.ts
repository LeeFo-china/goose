import { createHash } from "node:crypto";

import { describe, expect, test } from "bun:test";

const migrationsDirectory = new URL(
  "../../../../../supabase/migrations/",
  import.meta.url,
);
const commandMigration = new URL(
  "20260821102000_create_douyin_budget_estimate_command.sql",
  migrationsDirectory,
);
const insertRestrictionMigration = new URL(
  "20260821102100_restrict_douyin_budget_estimate_inserts.sql",
  migrationsDirectory,
);

function compact(value: string): string {
  return value.replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/--[^\n]*/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

async function migrationSql(): Promise<string> {
  return Bun.file(commandMigration).text();
}

function functionDefinition(source: string): string {
  return compact(source.match(
    /CREATE FUNCTION public\.create_douyin_budget_estimate\([\s\S]*?\n\$function\$;/,
  )?.[0] ?? "");
}

describe("douyin budget atomic estimate command migration", () => {
  test("does not rewrite applied budget migrations", async () => {
    const hashes = new Map([
      [
        "20260821100000_create_douyin_budget_estimates.sql",
        "eb48541bd898a574f140b593d9458b6684474af17b5115df71d11a864ce15980",
      ],
      [
        "20260821101000_fix_douyin_budget_estimate_ownership.sql",
        "a4a9f8cc944b3621202684f3b05245e01dafc84c139c1644c357bb566497e525",
      ],
      [
        "20260821102000_create_douyin_budget_estimate_command.sql",
        "c7cef16093948b334c62c83f6a32d9d6d3ffcd65ce4cf4adce2da5575442cae1",
      ],
    ]);

    for (const [name, expectedHash] of hashes) {
      const contents = await Bun.file(new URL(name, migrationsDirectory)).text();
      expect(createHash("sha256").update(contents).digest("hex")).toBe(
        expectedHash,
      );
    }
  });

  test("is a forward-only bounded DDL transaction without invocation or data DML", async () => {
    const source = await migrationSql();
    const sql = compact(source);
    const topLevelSql = compact(
      source.replace(/\$function\$[\s\S]*?\$function\$/g, "$function_body$"),
    );
    expect(source.startsWith("-- Rollback: forward-only.")).toBe(true);
    expect(sql).toMatch(/^begin; set local lock_timeout = '5s'; set local statement_timeout = '30s';/);
    expect(sql).toMatch(/commit;$/);
    expect(topLevelSql).not.toMatch(
      /\b(insert|update|delete|merge|copy|call|truncate)\b/,
    );
    expect(topLevelSql).not.toMatch(
      /\bselect public\.create_douyin_budget_estimate\b/,
    );
    expect(sql).not.toContain("if not exists");
  });

  test("defines the exact service-role-only command signature", async () => {
    const source = await migrationSql();
    const fn = functionDefinition(source);
    expect(fn).toContain(
      "create function public.create_douyin_budget_estimate( p_tenant_id uuid, p_douyin_miniapp_installation_id uuid, p_subject_hash text, p_request_ip_hash text, p_pricing_version_id uuid, p_estimate_no text, p_request_payload jsonb, p_result_payload jsonb, p_expires_at timestamptz ) returns jsonb language plpgsql security definer set search_path = pg_catalog, public",
    );
    expect(source).toMatch(
      /REVOKE ALL ON FUNCTION public\.create_douyin_budget_estimate\(\s*uuid, uuid, text, text, uuid, text, jsonb, jsonb, timestamptz\s*\)\s*FROM PUBLIC, anon, authenticated;/,
    );
    expect(source).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.create_douyin_budget_estimate\(\s*uuid, uuid, text, text, uuid, text, jsonb, jsonb, timestamptz\s*\)\s*TO service_role;/,
    );
    expect(source).not.toMatch(
      /GRANT EXECUTE[\s\S]*?TO (?:PUBLIC|anon|authenticated)/,
    );
  });

  test("validates server-owned scope and bounded snapshots before mutation", async () => {
    const fn = functionDefinition(await migrationSql());
    expect(fn).toContain("p_subject_hash !~ '^[0-9a-f]{64}$'");
    expect(fn).toContain("p_request_ip_hash !~ '^[0-9a-f]{64}$'");
    expect(fn).toContain("p_estimate_no !~ '^dyys-[0-9]{8}-[0-9]{6}$'");
    expect(fn).toContain("jsonb_typeof(p_request_payload) <> 'object'");
    expect(fn).toContain("jsonb_typeof(p_result_payload) <> 'object'");
    expect(fn).toContain("p_expires_at <= v_now");
    expect(fn).toContain("p_expires_at > v_now + interval '31 days'");
    expect(fn).toContain("installation.installation_kind = 'merchant'");
    expect(fn).toContain("installation.authorization_status = 'active'");
    expect(fn).toContain("installation.tenant_id = p_tenant_id");
    expect(fn).toContain("tenant.status = 'active'");
    expect(fn).toContain("pricing_version.tenant_id = p_tenant_id");
    expect(fn).toContain("pricing_version.status = 'active'");
    expect(fn).toContain("pricing_version.effective_from <= v_now");
    expect(fn).toContain("pricing_version.effective_to > v_now");
    expect(fn).toContain("'code', 'douyin_budget_command_invalid'");
    expect(fn).toContain("'code', 'douyin_budget_installation_unsupported'");
    expect(fn).toContain("'code', 'douyin_budget_not_configured'");
  });

  test("serializes both rate dimensions in deterministic advisory-lock order", async () => {
    const fn = functionDefinition(await migrationSql());
    expect(fn).toContain("'douyin-budget-rate:' || p_tenant_id::text || ':subject:' || p_subject_hash");
    expect(fn).toContain("'douyin-budget-rate:' || p_tenant_id::text || ':ip:' || p_request_ip_hash");
    expect(fn).toContain("order by lock_key");
    expect(fn).toContain("pg_catalog.pg_advisory_xact_lock");
    expect(fn).toContain("pg_catalog.hashtextextended(v_lock_key, 6720260821102000)");
  });

  test("counts at most the rejection threshold on each indexed dimension", async () => {
    const fn = functionDefinition(await migrationSql());
    expect(fn.match(/created_at >= v_now - interval '10 minutes'/g)).toHaveLength(2);
    expect(fn.match(/order by estimate\.created_at desc/g)).toHaveLength(2);
    expect(fn.match(/limit 20/g)).toHaveLength(2);
    expect(fn).toContain("estimate.subject_hash = p_subject_hash");
    expect(fn).toContain("estimate.request_ip_hash = p_request_ip_hash");
    expect(fn).toContain("if v_subject_count >= 20 or v_ip_count >= 20 then");
    expect(fn).toContain("'status_code', 429");
    expect(fn).toContain("'code', 'douyin_budget_rate_limited'");
  });

  test("generates the id in the database and returns strict success or collision envelopes", async () => {
    const fn = functionDefinition(await migrationSql());
    expect(fn).toContain("v_id := gen_random_uuid()");
    expect(fn).toContain("p_result_payload - 'id' - 'estimate_no'");
    expect(fn).toContain("'id', v_id");
    expect(fn).toContain("'estimate_no', p_estimate_no");
    expect(fn).toContain("insert into public.douyin_budget_estimates");
    expect(fn).toContain("'ai_status', 'pending'");
    expect(fn).toContain("when unique_violation then");
    expect(fn).toContain("get stacked diagnostics v_constraint_name = constraint_name");
    expect(fn).toContain("v_constraint_name = 'douyin_budget_estimates_estimate_no_key'");
    expect(fn).toContain("'status_code', 409");
    expect(fn).toContain("'code', 'douyin_budget_estimate_number_conflict'");
  });

  test("makes the definer command the only service-role insert boundary", async () => {
    const source = await Bun.file(insertRestrictionMigration).text();
    const sql = compact(source);
    expect(source.startsWith("-- Rollback: forward-only.")).toBe(true);
    expect(sql).toBe(
      "begin; set local lock_timeout = '5s'; set local statement_timeout = '30s'; revoke insert on table public.douyin_budget_estimates from service_role; commit;",
    );
    expect(sql).not.toMatch(/grant\s+insert/);
    expect(sql).not.toMatch(/revoke\s+(?:select|update)/);
  });
});
