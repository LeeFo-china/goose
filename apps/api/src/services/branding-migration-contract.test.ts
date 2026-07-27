import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const migrationPath = new URL(
  "../../../../supabase/migrations/20260727120000_create_tenant_support_branding_batch_a.sql",
  import.meta.url,
);
const migrationSql = readFileSync(migrationPath, "utf8");

function normalizeSql(sql: string): string {
  return sql
    .replace(/\s+/g, " ")
    .replace(/\(\s+/g, "(")
    .replace(/\s+\)/g, ")")
    .trim()
    .toLowerCase();
}

function extractFunction(sql: string, functionName: string): string {
  return (
    sql.match(
      new RegExp(
        `CREATE(?: OR REPLACE)? FUNCTION public\\.${functionName}\\([\\s\\S]*?\\$\\$;`,
        "i",
      ),
    )?.[0] ?? ""
  );
}

function extractBranch(
  functionSql: string,
  action: string,
  nextAction?: string,
): string {
  const normalized = normalizeSql(functionSql);
  const start = normalized.indexOf(`p_action = '${action}'`);
  if (start < 0) return "";
  if (!nextAction) return normalized.slice(start);
  const end = normalized.indexOf(`p_action = '${nextAction}'`, start + 1);
  return normalized.slice(start, end < 0 ? undefined : end);
}

function expectServiceRoleOnly(functionName: string, signature: string): void {
  const normalized = normalizeSql(migrationSql);
  const qualifiedFunction = `public.${functionName}(${signature})`;

  expect(normalized).toContain(
    `revoke all on function ${qualifiedFunction} from public`,
  );
  expect(normalized).toContain(
    `revoke all on function ${qualifiedFunction} from anon`,
  );
  expect(normalized).toContain(
    `revoke all on function ${qualifiedFunction} from authenticated`,
  );
  expect(normalized).toContain(
    `grant execute on function ${qualifiedFunction} to service_role`,
  );
}

describe("tenant support branding batch A migration contract", () => {
  test("is transactional, reversible by a forward migration, and billing-model independent", () => {
    expect(migrationSql).toMatch(/^-- Rollback:/);
    expect(normalizeSql(migrationSql)).toMatch(/\bbegin;[\s\S]*commit;$/);
    expect(migrationSql).not.toMatch(
      /tenant_credit_(?:orders|accounts|ledger)/i,
    );
  });

  test("creates the three private tables with focused read indexes", () => {
    const normalized = normalizeSql(migrationSql);
    const tables = [
      "brand_profiles",
      "tenant_entitlements",
      "tenant_entitlement_events",
    ] as const;

    expect(
      [...migrationSql.matchAll(/CREATE TABLE public\.([a-z0-9_]+)\s*\(/gi)].map(
        (match) => match[1],
      ),
    ).toEqual([...tables]);

    for (const table of tables) {
      expect(normalized).toContain(
        `alter table public.${table} enable row level security`,
      );
      expect(normalized).toContain(
        `alter table public.${table} force row level security`,
      );
      expect(normalized).toContain(
        `revoke all on table public.${table} from public, anon, authenticated`,
      );
    }
    expect(normalized).toContain(
      "grant select, insert, update, delete on table public.brand_profiles to service_role",
    );
    expect(normalized).toContain(
      "grant select, insert, update, delete on table public.tenant_entitlements to service_role",
    );
    expect(normalized).toContain(
      "grant select, insert on table public.tenant_entitlement_events to service_role",
    );
    expect(normalized).toContain(
      "revoke all on table public.tenant_entitlement_events from service_role",
    );
    expect(normalized).not.toContain(
      "grant select, insert, update, delete on table public.tenant_entitlement_events",
    );

    expect(normalized).toContain(
      "create index tenant_entitlements_status_expiry_idx on public.tenant_entitlements(status, expires_at, tenant_id)",
    );
    expect(normalized).toContain(
      "create index tenant_entitlement_events_tenant_created_idx on public.tenant_entitlement_events(tenant_id, created_at desc, id desc)",
    );
    expect(normalized).toContain(
      "create index tenant_entitlement_events_entitlement_created_idx on public.tenant_entitlement_events(entitlement_id, created_at desc, id desc)",
    );
  });

  test("locks brand scope, snapshots, versions, names, and uniqueness", () => {
    const normalized = normalizeSql(migrationSql);

    expect(normalized).toContain("scope in ('platform', 'tenant')");
    expect(normalized).toContain(
      "(scope = 'platform' and tenant_id is null) or (scope = 'tenant' and tenant_id is not null)",
    );
    expect(normalized).toContain(
      "char_length(display_name) between 2 and 40",
    );
    expect(normalized).toContain("check (version > 0)");
    expect(normalized).toContain("published_version <= version");
    expect(normalized).toMatch(
      /status <> 'published' or \(published_display_name is not null and published_logo_file_id is not null and published_version is not null and published_at is not null\)/,
    );
    expect(normalized).toContain(
      "create unique index brand_profiles_platform_unique_idx on public.brand_profiles(scope) where scope = 'platform'",
    );
    expect(normalized).toContain(
      "create unique index brand_profiles_tenant_unique_idx on public.brand_profiles(tenant_id) where scope = 'tenant'",
    );
    expect(normalized).toContain(
      "create trigger tr_brand_profiles_updated_at before update on public.brand_profiles for each row execute function public.update_updated_at_column()",
    );
  });

  test("locks entitlement state, sources, term dates, and append-only snapshots", () => {
    const normalized = normalizeSql(migrationSql);

    expect(normalized).toContain(
      "unique (tenant_id, entitlement_code)",
    );
    expect(normalized).toContain(
      "status in ('active', 'suspended', 'expired', 'revoked')",
    );
    expect(normalized).toContain("expires_at > starts_at");
    expect(normalized).toContain(
      "source_type in ('manual_grant', 'purchase')",
    );
    expect(normalized).toContain(
      "event_type in ('granted', 'renewed', 'suspended', 'resumed', 'expired', 'revoked')",
    );
    expect(normalized).toContain(
      "source_type in ('manual_grant', 'purchase', 'system')",
    );
    expect(normalized).toContain("jsonb_typeof(old_value) = 'object'");
    expect(normalized).toContain("jsonb_typeof(new_value) = 'object'");
    expect(normalized).toContain(
      "create trigger tr_tenant_entitlements_updated_at before update on public.tenant_entitlements for each row execute function public.update_updated_at_column()",
    );
    expect(normalized).not.toContain(
      "create trigger tr_tenant_entitlement_events_updated_at",
    );
  });

  test("seeds exactly four permissions into correctly tenant-scoped roles", () => {
    const permissionInsert =
      migrationSql.match(
        /INSERT INTO public\.permissions \([\s\S]*?ON CONFLICT \(code\) DO UPDATE SET[\s\S]*?status = EXCLUDED\.status;/i,
      )?.[0] ?? "";
    const permissionCodes = [
      ...permissionInsert.matchAll(/\('([^']+)'/g),
    ].map((match) => match[1]);

    expect(permissionCodes).toEqual([
      "platform.branding.manage",
      "platform.tenant_entitlement.manage",
      "brand.settings.read",
      "brand.settings.update",
    ]);

    const normalized = normalizeSql(migrationSql);
    expect(normalized).toMatch(
      /permissions\.code in \('platform\.branding\.manage', 'platform\.tenant_entitlement\.manage'\)[\s\S]*roles\.code = 'platform_admin' and roles\.tenant_id is null/,
    );
    expect(normalized).toMatch(
      /permissions\.code in \('brand\.settings\.read', 'brand\.settings\.update'\)[\s\S]*roles\.code = 'system_admin' and roles\.tenant_id is not null/,
    );
  });

  test("creates four locked service-role-only RPCs with stable failures", () => {
    const signatures = {
      save_brand_profile_draft: "text, uuid, text, uuid, integer, uuid",
      publish_brand_profile: "text, uuid, integer, uuid",
      apply_tenant_entitlement_action:
        "uuid, text, text, integer, text, integer, uuid, uuid",
      expire_tenant_entitlement_if_due: "uuid, text, timestamptz",
    } as const;

    expect(
      migrationSql.match(
        /CREATE(?: OR REPLACE)? FUNCTION public\.[a-z0-9_]+\(/gi,
      ),
    ).toHaveLength(4);

    for (const [functionName, signature] of Object.entries(signatures)) {
      const functionSql = extractFunction(migrationSql, functionName);
      const normalized = normalizeSql(functionSql);

      expect(functionSql).not.toBe("");
      expect(normalized).toContain("security definer");
      expect(normalized).toContain("set search_path = public, pg_temp");
      expect(normalized).toContain("for update");
      expectServiceRoleOnly(functionName, signature);
    }

    expect(migrationSql).toContain(
      "DETAIL = 'BRANDING_PROFILE_VERSION_CONFLICT'",
    );
    expect(migrationSql).toContain(
      "DETAIL = 'TENANT_ENTITLEMENT_VERSION_CONFLICT'",
    );
    expect(migrationSql).toContain("ERRCODE = 'P0001'");
  });

  test("preserves published brand snapshots while saving drafts", () => {
    const saveDraft = normalizeSql(
      extractFunction(migrationSql, "save_brand_profile_draft"),
    );
    const updateStatement =
      saveDraft.match(
        /update public\.brand_profiles[\s\S]*?returning brand_profiles\.\*/,
      )?.[0] ?? "";

    expect(updateStatement).not.toBe("");
    expect(updateStatement).not.toMatch(
      /published_(?:display_name|logo_file_id|version|at)\s*=/,
    );
  });

  test("implements entitlement terms and atomic event plus audit writes", () => {
    const command = extractFunction(
      migrationSql,
      "apply_tenant_entitlement_action",
    );
    const normalized = normalizeSql(command);
    const suspendBranch = extractBranch(command, "suspend", "resume");
    const resumeBranch = extractBranch(command, "resume", "revoke");
    const revokeBranch = extractBranch(command, "revoke");

    expect(normalized).toContain(
      "make_interval(years => p_term_years)",
    );
    expect(normalized).toContain(
      "insert into public.tenant_entitlement_events",
    );
    expect(normalized).toContain("insert into public.platform_audit_logs");
    expect(suspendBranch).toContain("expires_at <= v_now");
    expect(resumeBranch).not.toBe("");
    expect(resumeBranch).toContain("expires_at <= v_now");
    expect(resumeBranch).not.toMatch(/\bexpires_at\s*=/);
    expect(revokeBranch).not.toMatch(/expires_at <= v_now/);
    expect(revokeBranch).not.toMatch(/\bexpires_at\s*=/);
  });

  test("expires due active entitlements idempotently without platform audit", () => {
    const expire = normalizeSql(
      extractFunction(migrationSql, "expire_tenant_entitlement_if_due"),
    );

    expect(expire).toContain("status = 'active'");
    expect(expire).toContain("expires_at <= p_now");
    expect(expire).toContain(
      "insert into public.tenant_entitlement_events",
    );
    expect(expire).not.toContain("insert into public.platform_audit_logs");
  });
});
