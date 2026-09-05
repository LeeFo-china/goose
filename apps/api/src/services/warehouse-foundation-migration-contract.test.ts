import { describe, expect, test } from 'bun:test';

const migrationPath = new URL(
  '../../../../supabase/migrations/20260905210000_create_warehouse_foundation.sql',
  import.meta.url,
);

async function migrationSql(): Promise<string> {
  return Bun.file(migrationPath).text();
}

function functionSignature(sql: string, name: string): string {
  const match = sql.match(new RegExp(
    `CREATE FUNCTION public\\.${name}\\(([^)]*)\\)`,
    's',
  ));

  expect(match).not.toBeNull();
  const signature = match?.[1];
  return signature?.replace(/\s+/g, ' ').trim() ?? '';
}

function functionBody(sql: string, name: string): string {
  const match = sql.match(new RegExp(
    `CREATE FUNCTION public\\.${name}\\([^)]*\\)[\\s\\S]+?AS \\$\\$([\\s\\S]+?)\\$\\$;`,
  ));

  expect(match).not.toBeNull();
  return match?.[1] ?? '';
}

describe('warehouse foundation migration', () => {
  test('creates tenant-scoped warehouses and rollout gate', async () => {
    const sql = await migrationSql();

    expect(sql).toContain(
      'CREATE SEQUENCE public.warehouse_code_seq AS bigint START WITH 1',
    );
    expect(sql).toContain('CREATE TABLE public.warehouses');
    expect(sql).toContain('warehouse_code text NOT NULL DEFAULT (');
    expect(sql).toContain(
      "'WH-' || lpad(nextval('public.warehouse_code_seq')::text, 6, '0')",
    );
    expect(sql).toContain('address text NULL');
    expect(sql).toContain('contact_name text NULL');
    expect(sql).toContain('contact_phone text NULL');
    expect(sql).toContain('manager_employee_id uuid NULL');
    expect(sql).toMatch(/CHECK \(char_length\(btrim\(name\)\) BETWEEN 1 AND 80\)/);
    expect(sql).not.toContain('char_length(btrim(name)) <= 100');
    expect(sql).toMatch(/UNIQUE \(id, tenant_id\)/);
    expect(sql).toMatch(/UNIQUE \(tenant_id, warehouse_code\)/);
    expect(sql).toMatch(
      /FOREIGN KEY \(manager_employee_id, tenant_id\)\s+REFERENCES public\.employees\(id, tenant_id\)\s+ON DELETE RESTRICT/,
    );
    expect(sql).toContain('warehouse_procurement_enabled boolean NOT NULL DEFAULT false');
    expect(sql).toMatch(
      /NOT warehouse_procurement_enabled\s+OR \(\s*module_enabled\s+AND procurement_snapshot_v1_enabled\s+AND purchase_batch_workflow_enabled\s+\)/,
    );
    expect(sql).toContain('CREATE TABLE public.warehouse_command_events');
    expect(sql).toContain('warehouse_id uuid NOT NULL');
    expect(sql).toContain("command text NOT NULL CHECK (command IN ('create', 'update'))");
    expect(sql).toContain('request_fingerprint text NOT NULL');
    expect(sql).toContain('warehouses_one_default_per_tenant_idx');
    expect(sql).toContain('ALTER TABLE public.warehouses ENABLE ROW LEVEL SECURITY');
    expect(sql).toContain('ALTER TABLE public.warehouses FORCE ROW LEVEL SECURITY');
  });

  test('keeps RPC signatures aligned with warehouse fields', async () => {
    const sql = await migrationSql();

    expect(functionSignature(sql, 'create_tenant_warehouse')).toBe(
      'p_warehouse_id uuid, p_tenant_id uuid, p_name text, p_address text, ' +
        'p_contact_name text, p_contact_phone text, ' +
        'p_manager_employee_id uuid, p_is_default boolean, ' +
        'p_actor_user_id uuid, p_actor_employee_id uuid, ' +
        'p_idempotency_key text',
    );
    expect(functionSignature(sql, 'update_tenant_warehouse')).toBe(
      'p_warehouse_id uuid, p_tenant_id uuid, p_expected_version integer, ' +
        'p_name text, p_address text, p_address_set boolean, ' +
        'p_contact_name text, p_contact_name_set boolean, ' +
        'p_contact_phone text, p_contact_phone_set boolean, ' +
        'p_manager_employee_id uuid, p_manager_employee_id_set boolean, ' +
        'p_is_default boolean, p_status text, p_actor_user_id uuid, ' +
        'p_actor_employee_id uuid, p_idempotency_key text',
    );

    for (const name of ['create_tenant_warehouse', 'update_tenant_warehouse']) {
      expect(sql).toMatch(new RegExp(
        `GRANT EXECUTE ON FUNCTION public\\.${name}\\([^;]+\\) TO service_role;`,
        's',
      ));
      expect(sql).not.toContain(`public.${name}(\n  uuid,\n  uuid,\n  text,\n  text,\n  boolean`);
    }
  });

  test('normalizes and validates warehouse optional fields', async () => {
    const sql = await migrationSql();

    for (const name of ['create_tenant_warehouse', 'update_tenant_warehouse']) {
      const body = functionBody(sql, name);

      expect(body).toContain("v_address := NULLIF(btrim(p_address), '')");
      expect(body).toContain("v_contact_name := NULLIF(btrim(p_contact_name), '')");
      expect(body).toContain("v_contact_phone := NULLIF(btrim(p_contact_phone), '')");
      expect(body).toContain('char_length(v_address) > 200');
      expect(body).toContain('char_length(v_contact_name) > 50');
      expect(body).toContain('char_length(v_contact_phone) > 30');
      expect(body).toContain('char_length(v_name) > 80');
      expect(body).toContain('p_manager_employee_id');
      expect(body).toContain('manager_employee_id');
    }
  });

  test('keeps update command partial and command names stable', async () => {
    const sql = await migrationSql();
    const createBody = functionBody(sql, 'create_tenant_warehouse');
    const updateBody = functionBody(sql, 'update_tenant_warehouse');

    expect(sql).not.toContain("command IN ('create_tenant_warehouse', 'update_tenant_warehouse')");
    expect(sql).not.toContain("'create_tenant_warehouse',");
    expect(sql).not.toContain("'update_tenant_warehouse',");
    expect(updateBody).not.toContain('OR v_name IS NULL');
    expect(updateBody).not.toContain('OR v_status IS NULL');
    expect(updateBody).not.toContain('OR p_is_default IS NULL');
    expect(updateBody).toContain(
      "v_name := COALESCE(v_name, v_warehouse.name)",
    );
    expect(updateBody).toContain('OR p_address_set IS NULL');
    expect(updateBody).toContain('AND NOT p_address_set');
    expect(updateBody).toContain('OR p_contact_name_set IS NULL');
    expect(updateBody).toContain('OR p_contact_phone_set IS NULL');
    expect(updateBody).toContain('OR p_manager_employee_id_set IS NULL');
    expect(updateBody).toContain(
      'v_address := CASE WHEN p_address_set THEN v_address ELSE v_warehouse.address END',
    );
    expect(updateBody).toContain(
      "v_status := COALESCE(v_status, v_warehouse.status)",
    );
    expect(updateBody).toContain(
      'v_is_default := COALESCE(p_is_default, v_warehouse.is_default)',
    );
    expect(updateBody).toContain('v_manager_employee_id uuid');
    expect(updateBody).toContain('WHEN p_manager_employee_id_set THEN p_manager_employee_id');
    expect(updateBody).toContain(
      'manager_employee_id = v_manager_employee_id',
    );
    expect(updateBody).toContain("v_event.command <> 'update'");
    expect(createBody).toMatch(
      /FROM public\.tenants AS tenant\s+WHERE tenant\.id = p_tenant_id\s+AND tenant\.status = 'active'\s+FOR UPDATE;/,
    );
    expect(updateBody).toMatch(
      /FROM public\.tenants AS tenant\s+WHERE tenant\.id = p_tenant_id\s+AND tenant\.status = 'active'\s+FOR UPDATE;/,
    );
  });

  test('stores request fingerprints for idempotent command replay', async () => {
    const sql = await migrationSql();

    for (const name of ['create_tenant_warehouse', 'update_tenant_warehouse']) {
      const body = functionBody(sql, name);

      expect(body).toContain('v_request_fingerprint text');
      expect(body).toContain('v_request_fingerprint := encode(sha256(v_request::text::bytea), \'hex\')');
      expect(body).toContain(
        'OR v_event.request_fingerprint <> v_request_fingerprint',
      );
      expect(body).toContain('request_fingerprint');
      expect(body).toContain('v_request_fingerprint');
    }
    expect(functionBody(sql, 'create_tenant_warehouse')).toContain(
      "v_event.command <> 'create'",
    );
  });

  test('keeps writes behind RPCs and creates defaults only on enablement', async () => {
    const sql = await migrationSql();
    const triggerBody = functionBody(sql, 'ensure_default_tenant_warehouse');

    expect(sql).toContain('GRANT SELECT ON TABLE public.warehouses');
    expect(sql).not.toContain('GRANT SELECT, INSERT, UPDATE ON TABLE public.warehouses');
    expect(sql).not.toContain('GRANT SELECT, INSERT ON TABLE public.warehouse_command_events');
    expect(triggerBody).toContain('(TG_OP = \'INSERT\' OR OLD.module_enabled IS DISTINCT FROM true)');
  });

  test('creates bounded commands and seeds permissions', async () => {
    const sql = await migrationSql();

    expect(sql).toContain('CREATE FUNCTION public.create_tenant_warehouse');
    expect(sql).toContain('CREATE FUNCTION public.update_tenant_warehouse');
    expect(sql).toContain("'inventory.warehouse.view'");
    expect(sql).toContain("'inventory.warehouse.manage'");
    expect(sql).toContain("'inventory.stock.view'");
    expect(sql).toContain("'inventory.issue.manage'");
    expect(sql).toContain("'inventory.issue.approve'");
    expect(sql).toMatch(/WHERE roles\.code = 'system_admin'/);
    expect(sql).not.toContain('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.warehouses');
  });
});
