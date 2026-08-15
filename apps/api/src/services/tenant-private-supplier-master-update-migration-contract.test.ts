import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const migrationPath = new URL(
  "../../../../supabase/migrations/20260813160500_create_tenant_private_supplier_master_update.sql",
  import.meta.url,
);
const sql = readFileSync(migrationPath, "utf8");
const auditMigrationPath = new URL(
  "../../../../supabase/migrations/20260813160600_audit_tenant_private_supplier_master_updates.sql",
  import.meta.url,
);

function compact(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function extractFunction(name: string) {
  return sql.match(
    new RegExp(
      `CREATE(?: OR REPLACE)? FUNCTION public\\.${name}\\([\\s\\S]*?\\n\\$\\$;`,
    ),
  )?.[0] ?? "";
}

describe("tenant private supplier master update migration contract", () => {
  test("updates the master atomically through its tenant relationship", () => {
    const command = compact(
      extractFunction("update_tenant_private_supplier_master"),
    );

    expect(sql).toMatch(/^-- Rollback: forward-only\./);
    expect(sql).toContain("SET LOCAL lock_timeout = '5s';");
    expect(command).toContain("relationship.id = p_tenant_supplier_id");
    expect(command).toContain("relationship.tenant_id = p_tenant_id");
    expect(command).toContain("FOR UPDATE");
    expect(command).toContain("supplier.ownership_scope <> 'tenant'");
    expect(command).toContain(
      "supplier.owner_tenant_id IS DISTINCT FROM p_tenant_id",
    );
    expect(command).toContain("supplier.version <> p_expected_version");
    expect(command).toContain("public.assert_tenant_supplier_actor");
    expect(sql).toMatch(
      /REVOKE ALL ON FUNCTION public\.update_tenant_private_supplier_master\([\s\S]+?FROM PUBLIC, anon, authenticated, service_role;/,
    );
    expect(sql).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.update_tenant_private_supplier_master\([\s\S]+?TO service_role;/,
    );
  });

  test("records actor and before-after snapshots in a forward audit migration", () => {
    const auditSql = readFileSync(auditMigrationPath, "utf8");
    const command = compact(auditSql);

    expect(auditSql).toMatch(/^-- Rollback: forward-only\./);
    expect(command).toContain("CREATE OR REPLACE FUNCTION public.update_tenant_private_supplier_master");
    expect(command).toContain("v_from_state := jsonb_build_object");
    expect(command).toContain("INSERT INTO public.supplier_command_events");
    expect(command).toContain("'update_tenant_private_supplier_master'");
    expect(command).toContain("p_actor_user_id");
    expect(command).toContain("p_actor_employee_id");
    expect(command).toContain("v_from_state");
    expect(command).toContain("v_to_state");
  });
});
