import { describe, expect, test } from 'bun:test';

const migrationPath = new URL(
  '../../../../supabase/migrations/20260906110000_create_inventory_ledger_stage_b.sql',
  import.meta.url,
);

async function migrationSql(): Promise<string> {
  return Bun.file(migrationPath).text();
}

function functionBody(sql: string, name: string): string {
  const match = sql.match(new RegExp(
    `CREATE OR REPLACE FUNCTION public\\.${name}\\([^)]*\\)[\\s\\S]+?AS \\$\\$([\\s\\S]+?)\\$\\$;`,
  ));

  expect(match).not.toBeNull();
  return match?.[1] ?? '';
}

describe('warehouse inventory stage b migration', () => {
  test('creates immutable tenant-scoped inventory ledger and balances', async () => {
    const sql = await migrationSql();

    expect(sql).toContain('BEGIN;\n\nSET LOCAL lock_timeout = \'5s\';\nSET LOCAL statement_timeout = \'5min\';');
    expect(sql.trimEnd()).toEndWith('COMMIT;');
    expect(sql).toContain('CREATE TABLE public.inventory_transactions');
    expect(sql).toContain('CREATE TABLE public.inventory_balances');
    expect(sql).toContain('warehouse_id uuid NOT NULL');
    expect(sql).toContain('supplier_sku_id uuid NOT NULL');
    expect(sql).toContain('transaction_type text NOT NULL');
    expect(sql).toContain('quantity_delta numeric(18, 4) NOT NULL');
    expect(sql).toContain('unit_cost numeric(18, 4) NOT NULL');
    expect(sql).toContain('value_delta numeric(18, 2) NOT NULL');
    expect(sql).toMatch(/UNIQUE \(tenant_id, source_type, source_id\)/);
    expect(sql).toMatch(/UNIQUE \(tenant_id, warehouse_id, supplier_sku_id\)/);
    expect(sql).toContain('quantity_on_hand numeric(18, 4) NOT NULL DEFAULT 0');
    expect(sql).toContain('inventory_value numeric(18, 2) NOT NULL DEFAULT 0');
    expect(sql).toContain('average_unit_cost numeric(18, 4) NOT NULL DEFAULT 0');
    expect(sql).toMatch(/quantity_on_hand >= 0/);
    expect(sql).toMatch(/inventory_value >= 0/);
    expect(sql).toMatch(/average_unit_cost >= 0/);
    expect(sql).toContain('ALTER TABLE public.inventory_transactions ENABLE ROW LEVEL SECURITY;');
    expect(sql).toContain('ALTER TABLE public.inventory_transactions FORCE ROW LEVEL SECURITY;');
    expect(sql).toContain('ALTER TABLE public.inventory_balances ENABLE ROW LEVEL SECURITY;');
    expect(sql).toContain('ALTER TABLE public.inventory_balances FORCE ROW LEVEL SECURITY;');
    expect(sql).toMatch(
      /CREATE TRIGGER inventory_transactions_immutable[\s\S]*BEFORE UPDATE OR DELETE[\s\S]*ON public\.inventory_transactions/,
    );
  });

  test('adds warehouse destination fields to payable and payment facts', async () => {
    const sql = await migrationSql();

    for (const table of [
      'supplier_payable_events',
      'supplier_payment_requests',
      'supplier_payments',
    ]) {
      expect(sql).toContain(`ALTER TABLE public.${table}`);
      expect(sql).toContain('ADD COLUMN destination_type text');
      expect(sql).toContain('ADD COLUMN warehouse_id uuid NULL');
      expect(sql).toContain(`UPDATE public.${table}`);
      expect(sql).toMatch(new RegExp(
        `${table}_warehouse_tenant_fkey[\\s\\S]+FOREIGN KEY \\(warehouse_id, tenant_id\\)[\\s\\S]+REFERENCES public\\.warehouses\\(id, tenant_id\\)`,
      ));
      expect(sql).toMatch(new RegExp(
        `${table}_destination_check[\\s\\S]+destination_type = 'project'[\\s\\S]+project_id IS NOT NULL[\\s\\S]+warehouse_id IS NULL[\\s\\S]+destination_type = 'warehouse'[\\s\\S]+project_id IS NULL[\\s\\S]+warehouse_id IS NOT NULL`,
      ));
    }
  });

  test('makes supplier purchase receipt destination-aware', async () => {
    const sql = await migrationSql();
    const body = functionBody(sql, 'create_supplier_purchase_order_receipt');

    expect(sql).toContain('RENAME TO create_supplier_purchase_order_receipt_fulfillment_v2');
    expect(body).toContain('create_supplier_purchase_order_receipt_fulfillment_v2');
    expect(body).toContain("v_order.destination_type");
    expect(body).toContain("IF v_order.destination_type = 'project' THEN");
    expect(body).toContain("ELSIF v_order.destination_type = 'warehouse' THEN");
    expect(body).toContain('INSERT INTO public.project_cost_events');
    expect(body).toContain('INSERT INTO public.inventory_transactions');
    expect(body).toContain('INSERT INTO public.supplier_payable_events');
    expect(body).toMatch(
      /IF v_order\.destination_type = 'warehouse' THEN[\s\S]*INSERT INTO public\.inventory_transactions[\s\S]*INSERT INTO public\.supplier_payable_events[\s\S]*END IF;/,
    );
    expect(body).not.toMatch(
      /IF v_order\.destination_type = 'warehouse' THEN[\s\S]*INSERT INTO public\.project_cost_events[\s\S]*END IF;/,
    );
    expect(body).toContain('WAREHOUSE_NOT_FOUND');
    expect(body).toContain('WAREHOUSE_INACTIVE');
    expect(body).toContain('PURCHASE_DESTINATION_INVALID');
    expect(body).toContain('INVENTORY_SOURCE_CONFLICT');
  });

  test('provides paginated inventory read RPCs', async () => {
    const sql = await migrationSql();

    for (const name of [
      'list_inventory_balances',
      'list_inventory_transactions',
    ]) {
      const body = functionBody(sql, name);

      expect(body).toContain('least(greatest(p_page_size, 1), 100)');
      expect(body).toContain('jsonb_build_object');
      expect(body).toContain("'items'");
      expect(body).toContain("'total'");
      expect(body).toContain("'page'");
      expect(body).toContain("'page_size'");
      expect(sql).toMatch(new RegExp(
        `GRANT EXECUTE ON FUNCTION public\\.${name}\\([\\s\\S]+\\) TO service_role;`,
      ));
    }
  });
});
