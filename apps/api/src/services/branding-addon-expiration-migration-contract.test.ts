import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";

const migrationPath = new URL(
  "../../../../supabase/migrations/20260728120000_create_branding_addon_commerce.sql",
  import.meta.url,
);
const migrationSql = existsSync(migrationPath)
  ? readFileSync(migrationPath, "utf8")
  : "";

function normalizeSql(sql: string): string {
  return sql
    .replace(/\s+/g, " ")
    .replace(/\(\s+/g, "(")
    .replace(/\s+\)/g, ")")
    .trim()
    .toLowerCase();
}

function extractFunction(sql: string, functionName: string): string {
  return sql.match(
    new RegExp(
      `CREATE(?: OR REPLACE)? FUNCTION public\\.${functionName}\\([\\s\\S]*?\\$\\$;`,
      "i",
    ),
  )?.[0] ?? "";
}

function extractFunctionBody(sql: string, functionName: string): string {
  return normalizeSql(
    extractFunction(sql, functionName)
      .match(/\bAS\s+\$\$([\s\S]*?)\$\$;/i)?.[1] ?? "",
  );
}

function expectClaimContract(sql: string): void {
  const name = "branding_claim_expired_addon_orders";
  const definition = normalizeSql(extractFunction(sql, name));
  const body = extractFunctionBody(sql, name);
  expect(definition).toContain(
    "create or replace function public.branding_claim_expired_addon_orders(p_limit integer, p_lease_seconds integer, p_excluded_ids uuid[] default array[]::uuid[]) returns setof public.tenant_addon_orders language plpgsql security definer set search_path = public",
  );
  expect(definition).not.toContain("p_now");
  expect(body).toContain("v_now timestamptz := clock_timestamp()");
  expect(body).toMatch(
    /if coalesce\(cardinality\(p_excluded_ids\), 0\) > 100 then[\s\S]*errcode = '22023'[\s\S]*branding_addon_claim_exclusions_too_large[\s\S]*end if;/,
  );

  const candidates = body.match(
    /with candidates as \(select orders\.id[\s\S]*?for update skip locked\)/,
  )?.[0] ?? "";
  for (const contract of [
    "from public.tenant_addon_orders as orders",
    "orders.channel = 'wechat_pay'",
    "orders.status = 'pending'",
    "orders.payment_expires_at <= v_now",
    "and not (orders.id = any(coalesce(p_excluded_ids, array[]::uuid[])))",
    "orders.close_claim_expires_at is null",
    "orders.close_claim_expires_at <= v_now",
    "order by orders.payment_expires_at asc, orders.id asc",
    "limit least(greatest(coalesce(p_limit, 100), 1), 100)",
    "for update skip locked",
  ]) expect(candidates).toContain(contract);

  const update = body.match(
    /update public\.tenant_addon_orders as orders set[\s\S]*?returning orders\.\*/,
  )?.[0] ?? "";
  for (const contract of [
    "close_claim_token = gen_random_uuid()",
    "close_claim_expires_at = v_now + make_interval(secs => least(greatest(coalesce(p_lease_seconds, 60), 10), 600))",
    "close_attempt_count = orders.close_attempt_count + 1",
    "close_last_error = null",
    "from candidates",
    "orders.id = candidates.id",
    "returning orders.*",
  ]) expect(update).toContain(contract);
}

function expectRenewContract(sql: string): void {
  const name = "branding_renew_addon_close_claim";
  const definition = normalizeSql(extractFunction(sql, name));
  const body = extractFunctionBody(sql, name);
  expect(definition).toContain(
    "create or replace function public.branding_renew_addon_close_claim(p_order_id uuid, p_claim_token uuid, p_lease_seconds integer) returns public.tenant_addon_orders language plpgsql security definer set search_path = public",
  );
  expect(definition).not.toContain("p_now");
  const update = body.match(
    /update public\.tenant_addon_orders as orders set[\s\S]*?returning orders\.\* into v_order/,
  )?.[0] ?? "";
  for (const contract of [
    "close_claim_expires_at = clock_timestamp() + make_interval(secs => least(greatest(coalesce(p_lease_seconds, 60), 10), 600))",
    "orders.id = p_order_id",
    "orders.status = 'pending'",
    "orders.close_claim_token = p_claim_token",
    "returning orders.* into v_order",
  ]) expect(update).toContain(contract);
  expect(body).toContain("if not found then return null; end if");
  expect(body).toContain("return v_order");
}

function expectAccessContract(sql: string): void {
  const normalized = normalizeSql(sql);
  const functions = [
    ["branding_claim_expired_addon_orders", "integer, integer, uuid[]"],
    ["branding_renew_addon_close_claim", "uuid, uuid, integer"],
  ] as const;
  for (const [name, signature] of functions) {
    for (const role of ["public", "anon", "authenticated"]) {
      expect(normalized).toContain(
        `revoke all on function public.${name}(${signature}) from ${role}`,
      );
    }
    expect(normalized).toContain(
      `grant execute on function public.${name}(${signature}) to service_role`,
    );
    expect(normalized).toContain(`comment on function public.${name}(${signature})`);
  }
}

describe("branding add-on expiration migration contract", () => {
  test("claims expired pending WeChat add-on orders atomically", () => {
    expectClaimContract(migrationSql);
  });

  test("renews only the exact pending add-on close claim", () => {
    expectRenewContract(migrationSql);
  });

  test("keeps both lease commands service-role-only and forward-reversible", () => {
    expectAccessContract(migrationSql);
    const rollback = normalizeSql(
      migrationSql.slice(0, migrationSql.indexOf("BEGIN;")),
    );
    expect(rollback).toContain("revoke and drop branding_claim_expired_addon_orders");
    expect(rollback).toContain("branding_renew_addon_close_claim");
  });

  const mutations = [
    {
      name: "missing SKIP LOCKED",
      sql: migrationSql.replace(/FOR UPDATE SKIP LOCKED/i, "FOR UPDATE"),
      contract: expectClaimContract,
    },
    {
      name: "missing renew token scope",
      sql: migrationSql.replace(
        /\s+AND orders\.close_claim_token = p_claim_token/i,
        "",
      ),
      contract: expectRenewContract,
    },
    {
      name: "missing exclusion bound",
      sql: migrationSql.replace(
        /IF coalesce\(cardinality\(p_excluded_ids\), 0\) > 100 THEN[\s\S]*?END IF;/i,
        "",
      ),
      contract: expectClaimContract,
    },
    {
      name: "inverted exclusion predicate",
      sql: migrationSql.replace(
        /\bAND NOT \((?=\s*orders\.id = ANY\(coalesce\(p_excluded_ids)/i,
        "AND (",
      ),
      contract: expectClaimContract,
    },
    {
      name: "changed exclusion error code",
      sql: migrationSql.replace(
        /ERRCODE = '22023'(?=\s*,\s*MESSAGE = 'BRANDING_ADDON_CLAIM_EXCLUSIONS_TOO_LARGE')/i,
        "ERRCODE = 'P0001'",
      ),
      contract: expectClaimContract,
    },
    {
      name: "missing limit bound",
      sql: migrationSql.replace(
        /LIMIT least\(greatest\(coalesce\(p_limit, 100\), 1\), 100\)/i,
        "LIMIT 100",
      ),
      contract: expectClaimContract,
    },
    {
      name: "missing public revoke",
      sql: migrationSql.replace(
        /REVOKE ALL ON FUNCTION public\.branding_claim_expired_addon_orders\(\s*integer,\s*integer,\s*uuid\[\]\s*\)\s+FROM PUBLIC;/i,
        "",
      ),
      contract: expectAccessContract,
    },
  ] as const;

  for (const mutation of mutations) {
    test(`mutation fixture rejects ${mutation.name}`, () => {
      expect(mutation.sql).not.toBe(migrationSql);
      expect(() => mutation.contract(mutation.sql)).toThrow();
    });
  }
});
