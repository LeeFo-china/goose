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
const secondRepairMigrationPath = new URL(
  "../../../../supabase/migrations/20260813160200_close_tenant_supplier_code_invariants.sql",
  import.meta.url,
);
const secondRepairSql = existsSync(secondRepairMigrationPath)
  ? readFileSync(secondRepairMigrationPath, "utf8")
  : "";
const indexRepairMigrationPath = new URL(
  "../../../../supabase/migrations/20260813160300_index_supplier_allocation_conflict_events.sql",
  import.meta.url,
);
const indexRepairSql = existsSync(indexRepairMigrationPath)
  ? readFileSync(indexRepairMigrationPath, "utf8")
  : "";
const readVisibilityMigrationPath = new URL(
  "../../../../supabase/migrations/20260813160400_harden_tenant_supplier_read_visibility.sql",
  import.meta.url,
);
const readVisibilitySql = existsSync(readVisibilityMigrationPath)
  ? readFileSync(readVisibilityMigrationPath, "utf8")
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

  test("rejects allocation when the tenant key already belongs to a create command", () => {
    expect(secondRepairSql).toContain(
      "CREATE OR REPLACE FUNCTION public.allocate_tenant_supplier_code",
    );

    for (const source of [sql, repairSql, secondRepairSql]) {
      const allocator = compact(
        extractFunction("allocate_tenant_supplier_code", source),
      );
      const eventGuard = compact(
        extractFunction("guard_tenant_supplier_allocation_event_key", source),
      );

      expect(allocator).toContain(
        "event.tenant_id = p_tenant_id AND event.idempotency_key = p_idempotency_key AND event.command IN ( 'create_tenant_private_supplier', 'create_tenant_shared_supplier_relationship', 'create_tenant_supplier' )",
      );
      expect(allocator).toMatch(
        /IF FOUND THEN RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'SUPPLIER_CODE_ALLOCATION_CONFLICT'/,
      );
      expect(eventGuard).toContain(
        "'supplier-code-allocation:' || NEW.tenant_id::text || ':' || NEW.idempotency_key",
      );
    }
  });

  test("indexes only reverse-conflict create events by tenant idempotency scope", () => {
    const expectedIndex = /CREATE INDEX IF NOT EXISTS supplier_command_events_tenant_allocation_conflict_idx\s+ON public\.supplier_command_events\(tenant_id, idempotency_key\)\s+WHERE command IN \(\s*'create_tenant_private_supplier',\s*'create_tenant_shared_supplier_relationship',\s*'create_tenant_supplier'\s*\)/;

    expect(sql).toMatch(expectedIndex);
    expect(indexRepairSql).toMatch(/^-- Rollback: forward-only\./);
    expect(indexRepairSql).toContain("BEGIN;");
    expect(indexRepairSql).toContain("SET LOCAL lock_timeout = '5s';");
    expect(indexRepairSql).toContain("SET LOCAL statement_timeout = '5min';");
    expect(indexRepairSql).toMatch(expectedIndex);
    expect(indexRepairSql).not.toMatch(
      /supplier_command_events_tenant_allocation_conflict_idx[\s\S]*ON public\.supplier_command_events\([^)]*command/,
    );
    expect(indexRepairSql).toMatch(/COMMIT;\s*$/);
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

  test("keeps private supplier master codes immutable and aligned with relationship codes", () => {
    const sourceGuard = compact(
      extractFunction("guard_tenant_private_supplier_code_immutable"),
    );
    const repairGuard = compact(
      extractFunction(
        "guard_tenant_private_supplier_code_immutable",
        repairSql,
      ),
    );

    for (const guard of [sourceGuard, repairGuard]) {
      expect(guard).toContain(
        "OLD.ownership_scope = 'tenant' AND NEW.code IS DISTINCT FROM OLD.code",
      );
      expect(guard).toContain("SUPPLIER_CODE_IMMUTABLE");
      expect(guard).not.toContain("OLD.ownership_scope = 'platform'");
    }

    for (const source of [sql, repairSql]) {
      expect(source).toMatch(
        /CREATE TRIGGER tr_suppliers_guard_private_code_immutable\s+BEFORE UPDATE OF code\s+ON public\.suppliers/,
      );
    }

    const ownershipValidator = compact(
      extractFunction("validate_tenant_supplier_ownership"),
    );
    expect(ownershipValidator).toContain(
      "v_supplier.ownership_scope = 'tenant'",
    );
    expect(ownershipValidator).toContain(
      "upper(btrim(v_supplier.code)) IS DISTINCT FROM NEW.internal_supplier_code",
    );

    expect(compact(repairSql)).toContain(
      "supplier.ownership_scope = 'tenant' AND ( relationship.id IS NULL OR relationship.tenant_id IS DISTINCT FROM supplier.owner_tenant_id OR relationship.internal_supplier_code IS DISTINCT FROM upper(btrim(supplier.code)) )",
    );
    expect(repairSql).toContain("SUPPLIER_PRIVATE_CODE_INCONSISTENT");
  });

  test("normalizes safe legacy private codes before installing immutable protection", () => {
    expect(secondRepairSql).toMatch(/^-- Rollback: forward-only\./);
    expect(secondRepairSql).toContain("BEGIN;");
    expect(secondRepairSql).toContain(
      "DROP TRIGGER IF EXISTS tr_suppliers_guard_private_code_immutable",
    );
    expect(compact(secondRepairSql)).toContain(
      "relationship.internal_supplier_code IS DISTINCT FROM upper(btrim(supplier.code))",
    );
    expect(secondRepairSql).toContain("SUPPLIER_PRIVATE_CODE_INCONSISTENT");
    expect(compact(secondRepairSql)).toContain(
      "UPDATE public.suppliers AS supplier SET code = relationship.internal_supplier_code FROM public.tenant_suppliers AS relationship WHERE supplier.ownership_scope = 'tenant' AND relationship.supplier_id = supplier.id AND relationship.tenant_id = supplier.owner_tenant_id AND supplier.code IS DISTINCT FROM relationship.internal_supplier_code",
    );
    expect(secondRepairSql).toMatch(
      /CREATE TRIGGER tr_suppliers_guard_private_code_immutable\s+BEFORE UPDATE OF code\s+ON public\.suppliers/,
    );
    expect(compact(secondRepairSql)).toContain(
      "supplier.code IS DISTINCT FROM relationship.internal_supplier_code",
    );

    expect(compact(sql)).toContain(
      "SET internal_supplier_code = upper(btrim(supplier.code)) FROM public.suppliers AS supplier WHERE supplier.id = relationship.supplier_id AND supplier.ownership_scope = 'tenant' AND supplier.owner_tenant_id = relationship.tenant_id",
    );
    expect(compact(repairSql)).toContain(
      "UPDATE public.suppliers AS supplier SET code = relationship.internal_supplier_code FROM public.tenant_suppliers AS relationship",
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

  test("keeps relationship reads tenant-visible and the shared directory platform-only", () => {
    const relationshipList = compact(
      extractFunction("list_tenant_suppliers_for_tenant", readVisibilitySql),
    );
    const sharedDirectory = compact(
      extractFunction("list_available_suppliers_for_tenant", readVisibilitySql),
    );

    expect(readVisibilitySql).toMatch(/^-- Rollback: forward-only\./);
    expect(readVisibilitySql).toContain("BEGIN;");
    expect(readVisibilitySql).toContain("SET LOCAL lock_timeout = '5s';");
    expect(readVisibilitySql).toContain("SET LOCAL statement_timeout = '5min';");
    expect(relationshipList).toContain(
      "supplier.ownership_scope = 'platform' OR ( supplier.ownership_scope = 'tenant' AND supplier.owner_tenant_id = p_tenant_id )",
    );
    expect(relationshipList).toContain(
      "'ownership_scope', supplier.ownership_scope",
    );
    expect(relationshipList).toContain(
      "'owner_tenant_id', supplier.owner_tenant_id",
    );
    expect(sharedDirectory).toContain("supplier.ownership_scope = 'platform'");
    expect(sharedDirectory).toContain("supplier.owner_tenant_id IS NULL");
    expect(sharedDirectory).toContain("supplier.ownership_scope");
    expect(sharedDirectory).toContain("supplier.owner_tenant_id");
    expect(readVisibilitySql).toMatch(/COMMIT;\s*$/);
  });
});
