import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";

const migrationPath = new URL(
  "../../../../supabase/migrations/20260813160000_create_tenant_private_suppliers.sql",
  import.meta.url,
);
const sql = existsSync(migrationPath)
  ? readFileSync(migrationPath, "utf8")
  : "";
const repairMigrationPath = new URL(
  "../../../../supabase/migrations/20260813160100_harden_tenant_private_supplier_codes.sql",
  import.meta.url,
);
const repairSql = existsSync(repairMigrationPath)
  ? readFileSync(repairMigrationPath, "utf8")
  : "";

function compact(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function extractFunction(name: string, source = sql) {
  return source.match(
    new RegExp(
      `CREATE(?: OR REPLACE)? FUNCTION public\\.${name}\\([\\s\\S]*?\\n\\$\\$;`,
    ),
  )?.[0] ?? "";
}

describe("tenant private supplier migration contract", () => {
  test("uses the fixed transactional migration with bounded release locks", () => {
    expect(sql).toMatch(/^-- Rollback: forward-only\./);
    expect(sql).toMatch(/disable private supplier writes[\s\S]*forward migration/i);
    expect(sql).toContain("BEGIN;");
    expect(sql).toContain("SET LOCAL lock_timeout = '5s';");
    expect(sql).toContain("SET LOCAL statement_timeout = '5min';");
    expect(sql).toMatch(/COMMIT;\s*$/);
  });

  test("creates a tenant counter with a bounded generated range", () => {
    const table = compact(
      sql.match(
        /CREATE TABLE public\.tenant_supplier_code_counters \([\s\S]*?\n\);/,
      )?.[0] ?? "",
    );

    expect(table).toContain("tenant_id uuid PRIMARY KEY");
    expect(table).toContain("REFERENCES public.tenants(id) ON DELETE RESTRICT");
    expect(table).toContain("next_value bigint NOT NULL");
    expect(table).toContain("version integer NOT NULL DEFAULT 1");
    expect(table).toContain("updated_at timestamptz NOT NULL DEFAULT now()");
    expect(table).toMatch(/CHECK \(next_value BETWEEN 1 AND 1000000\)/);
  });

  test("creates an append-only code registry whose codes are never reusable", () => {
    const table = compact(
      sql.match(
        /CREATE TABLE public\.tenant_supplier_code_registry \([\s\S]*?\n\);/,
      )?.[0] ?? "",
    );

    for (const field of [
      "id uuid PRIMARY KEY DEFAULT gen_random_uuid()",
      "tenant_id uuid NOT NULL",
      "normalized_code text NOT NULL",
      "display_code text NOT NULL",
      "source text NOT NULL",
      "status text NOT NULL",
      "idempotency_key text NULL",
      "request_digest jsonb NULL",
      "tenant_supplier_id uuid NULL",
      "actor_user_id uuid NULL",
      "actor_employee_id uuid NULL",
      "created_at timestamptz NOT NULL DEFAULT now()",
      "consumed_at timestamptz NULL",
      "abandoned_at timestamptz NULL",
    ]) {
      expect(table).toContain(field);
    }
    expect(table).toContain("CHECK (source IN ('generated', 'manual', 'migration'))");
    expect(table).toContain("CHECK (status IN ('reserved', 'used', 'abandoned'))");
    expect(table).toContain("UNIQUE (tenant_id, normalized_code)");
    expect(sql).toMatch(
      /CREATE UNIQUE INDEX tenant_supplier_code_registry_generated_idempotency_idx[\s\S]*\(tenant_id, idempotency_key\)[\s\S]*WHERE source = 'generated'/,
    );
    expect(sql).not.toMatch(/DELETE FROM public\.tenant_supplier_code_registry/);
  });

  test("forces RLS and exposes both registry tables only to service_role", () => {
    for (const table of [
      "tenant_supplier_code_counters",
      "tenant_supplier_code_registry",
    ]) {
      expect(sql).toContain(
        `ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY;`,
      );
      expect(sql).toContain(
        `ALTER TABLE public.${table} FORCE ROW LEVEL SECURITY;`,
      );
      expect(sql).toContain(
        `REVOKE ALL ON TABLE public.${table} FROM PUBLIC, anon, authenticated, service_role;`,
      );
      expect(sql).toContain(
        `GRANT SELECT ON TABLE public.${table} TO service_role;`,
      );
    }
  });

  test("validates the bound active tenant actor in one private helper", () => {
    const fn = compact(extractFunction("assert_tenant_supplier_actor"));

    expect(fn).toContain("SECURITY DEFINER");
    expect(fn).toContain("SET search_path = pg_catalog, public");
    expect(fn).toContain("employee.id = p_actor_employee_id");
    expect(fn).toContain("employee.tenant_id = p_tenant_id");
    expect(fn).toContain("employee.user_id = p_actor_user_id");
    expect(fn).toContain("employee.status = 'active'");
    expect(fn).toContain("SUPPLIER_PROXY_ACTOR_INVALID");
    expect(sql).toContain(
      "REVOKE ALL ON FUNCTION public.assert_tenant_supplier_actor(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated, service_role;",
    );
  });

  test("allocates codes with replay protection, a locked counter, and registry skipping", () => {
    const fn = compact(extractFunction("allocate_tenant_supplier_code"));

    for (const parameter of [
      "p_tenant_id uuid",
      "p_actor_user_id uuid",
      "p_actor_employee_id uuid",
      "p_idempotency_key text",
    ]) {
      expect(fn).toContain(parameter);
    }
    expect(fn).toContain("PERFORM public.assert_tenant_supplier_actor");
    expect(fn).toContain("private_supplier_writes_enabled");
    expect(fn).toContain("FOR UPDATE");
    expect(fn).toContain("SUP-([0-9]{6})");
    expect(fn).toContain("tenant_supplier_code_registry");
    expect(fn).toContain("tenant_suppliers");
    expect(fn).toContain("SUPPLIER_CODE_ALLOCATION_CONFLICT");
    expect(fn).toContain("'idempotent', true");
    expect(fn).toContain("'idempotent', false");
    expect(fn).toContain("allocate_tenant_supplier_code");
    expect(fn).toContain("public.supplier_command_events");
  });

  test("scopes allocation replay to tenant and key instead of the acting employee", () => {
    const sourceFunction = compact(
      extractFunction("allocate_tenant_supplier_code"),
    );
    const repairFunction = compact(
      extractFunction("allocate_tenant_supplier_code", repairSql),
    );

    expect(repairSql).toContain("BEGIN;");
    expect(repairSql).toContain(
      "CREATE OR REPLACE FUNCTION public.allocate_tenant_supplier_code",
    );

    for (const source of [sql, repairSql]) {
      const eventGuard = compact(
        extractFunction("guard_tenant_supplier_allocation_event_key", source),
      );
      expect(eventGuard).toContain(
        "NEW.command IN ( 'create_tenant_private_supplier', 'create_tenant_shared_supplier_relationship', 'create_tenant_supplier' )",
      );
      expect(eventGuard).toContain(
        "registry.tenant_id = NEW.tenant_id",
      );
      expect(eventGuard).toContain(
        "registry.idempotency_key = NEW.idempotency_key",
      );
      expect(eventGuard).toContain("SUPPLIER_CODE_ALLOCATION_CONFLICT");
      expect(source).toContain(
        "CREATE TRIGGER tr_supplier_command_events_guard_allocation_key",
      );
    }

    for (const fn of [sourceFunction, repairFunction]) {
      expect(fn).toContain(
        "'supplier-code-allocation:' || p_tenant_id::text || ':' || p_idempotency_key",
      );
      expect(fn).not.toContain(
        "'supplier-command:' || p_actor_user_id::text || ':' || p_idempotency_key",
      );
      expect(fn).toContain(
        "WHERE registry.tenant_id = p_tenant_id AND registry.source = 'generated' AND registry.idempotency_key = p_idempotency_key",
      );
      expect(fn).toContain(
        "RETURN jsonb_build_object( 'allocation_id', v_existing_registry.id, 'code', v_existing_registry.normalized_code, 'idempotent', true )",
      );
      expect(fn).not.toContain(
        "WHERE event.actor_user_id = p_actor_user_id AND event.idempotency_key = p_idempotency_key",
      );
    }
  });

  test("creates private supplier, relationship, optional contact and address atomically", () => {
    const fn = compact(extractFunction("create_tenant_private_supplier"));
    const codeConsumer = compact(
      extractFunction("consume_tenant_supplier_code"),
    );

    expect(fn).toContain("PERFORM public.assert_tenant_supplier_actor");
    expect(fn).toContain("private_supplier_writes_enabled");
    expect(fn).toContain("ownership_scope, owner_tenant_id");
    expect(fn).toContain("'tenant', p_tenant_id");
    expect(fn).toContain("upper(btrim(p_unified_social_credit_code))");
    expect(fn).toContain("INSERT INTO public.tenant_suppliers");
    expect(fn).toContain("relationship_status");
    expect(fn).toContain("'evaluating'");
    expect(fn).toContain("internal_supplier_code");
    expect(fn).toContain("INSERT INTO public.supplier_contacts");
    expect(fn).toContain("INSERT INTO public.supplier_addresses");
    expect(codeConsumer).toContain("status = 'used'");
    expect(fn).toContain("SUPPLIER_CODE_CONFLICT");
    expect(fn).toContain("SUPPLIER_CODE_ALLOCATION_CONFLICT");
    expect(fn).toContain("create_tenant_private_supplier");
    expect(fn).toContain("public.supplier_command_events");
  });

  test("creates shared relationships only for platform suppliers with explicit codes", () => {
    const fn = compact(
      extractFunction("create_tenant_shared_supplier_relationship"),
    );

    expect(fn).toContain("PERFORM public.assert_tenant_supplier_actor");
    expect(fn).toContain("v_supplier.ownership_scope <> 'platform'");
    expect(fn).toContain("SUPPLIER_OWNERSHIP_CONFLICT");
    expect(fn).toContain("INSERT INTO public.tenant_suppliers");
    expect(fn).toContain("internal_supplier_code");
    expect(fn).toContain("relationship_status");
    expect(fn).toContain("'evaluating'");
    expect(fn).toContain("create_tenant_shared_supplier_relationship");
  });

  test("backfills all relationships deterministically before enforcing immutable codes", () => {
    expect(sql).toContain(
      "ALTER TABLE public.tenant_suppliers\nADD COLUMN internal_supplier_code text NULL;",
    );
    expect(sql).toMatch(
      /row_number\(\) OVER \([\s\S]*PARTITION BY relationship\.tenant_id[\s\S]*ORDER BY relationship\.created_at, relationship\.id/,
    );
    expect(sql).toMatch(/'migration',\s*'used'/);
    expect(sql).toContain(
      "ALTER COLUMN internal_supplier_code SET NOT NULL",
    );
    expect(compact(sql)).toMatch(
      /CONSTRAINT tenant_suppliers_tenant_internal_code_key UNIQUE \(\s*tenant_id, internal_supplier_code\s*\)/,
    );
    expect(sql).toContain(
      "CONSTRAINT tenant_suppliers_internal_code_normalized_check",
    );
    expect(sql).toMatch(
      /BEFORE UPDATE OF internal_supplier_code[\s\S]*MESSAGE = 'SUPPLIER_CODE_IMMUTABLE'/,
    );
  });

  test("replaces global supplier identity uniqueness with scoped partial indexes", () => {
    expect(sql).toContain(
      "ALTER TABLE public.suppliers DROP CONSTRAINT suppliers_code_key;",
    );
    expect(sql).toContain("DROP INDEX public.suppliers_credit_code_unique_idx;");
    for (const index of [
      "suppliers_platform_code_unique_idx",
      "suppliers_tenant_code_unique_idx",
      "suppliers_platform_credit_code_unique_idx",
      "suppliers_tenant_credit_code_unique_idx",
    ]) {
      expect(sql).toContain(`CREATE UNIQUE INDEX ${index}`);
    }
    expect(sql).toMatch(
      /SUPPLIER_CODE_SCOPE_DUPLICATE[\s\S]*SUPPLIER_CREDIT_CODE_SCOPE_DUPLICATE/,
    );
  });

  test("abandons expired reservations without releasing their codes", () => {
    const fn = compact(
      extractFunction("abandon_tenant_supplier_code_reservations"),
    );

    expect(fn).toContain("created_at <= now() - interval '24 hours'");
    expect(fn).toContain("status = 'abandoned'");
    expect(fn).toContain("abandoned_at = now()");
    expect(fn).not.toContain("DELETE");
  });

  test("keeps the legacy shared-supplier RPC deploy-compatible without silent generation", () => {
    const fn = compact(extractFunction("create_tenant_supplier"));

    expect(fn).toContain("CREATE OR REPLACE FUNCTION");
    expect(fn).toContain("v_supplier.ownership_scope <> 'platform'");
    expect(fn).toContain("upper(btrim(v_supplier.code))");
    expect(fn).toContain("'migration', 'used'");
    expect(fn).not.toContain("allocate_tenant_supplier_code");
    expect(fn).toContain("internal_supplier_code");
  });

  test("exposes only service-role command execution", () => {
    for (const signature of [
      "public.allocate_tenant_supplier_code(uuid, uuid, uuid, text)",
      "public.create_tenant_private_supplier(uuid, text, text, text, text, text, text, uuid, jsonb, jsonb, uuid, uuid, text)",
      "public.create_tenant_shared_supplier_relationship(uuid, uuid, text, text, uuid, uuid, uuid, text)",
      "public.abandon_tenant_supplier_code_reservations(integer)",
    ]) {
      expect(sql).toContain(
        `REVOKE ALL ON FUNCTION ${signature} FROM PUBLIC, anon, authenticated, service_role;`,
      );
      expect(sql).toContain(
        `GRANT EXECUTE ON FUNCTION ${signature} TO service_role;`,
      );
    }
  });
});
