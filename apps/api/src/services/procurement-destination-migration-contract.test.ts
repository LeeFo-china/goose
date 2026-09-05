import { describe, expect, test } from "bun:test";

const migrationPath = new URL(
  "../../../../supabase/migrations/20260905211000_add_procurement_destinations.sql",
  import.meta.url,
);
const headers = [
  "supplier_purchase_batches",
  "supplier_purchase_requisitions",
  "supplier_purchase_orders",
] as const;

async function migrationSql(): Promise<string> {
  return Bun.file(migrationPath).text();
}

describe("procurement destination migration", () => {
  test("adds project and warehouse destinations to procurement headers", async () => {
    const sql = await migrationSql();

    for (const table of headers) {
      expect(sql).toContain(`ALTER TABLE public.${table}`);
      expect(sql).toContain("ADD COLUMN destination_type text");
      expect(sql).toContain("ADD COLUMN warehouse_id uuid NULL");
      expect(sql).toContain(`UPDATE public.${table}`);
      expect(sql).toContain("SET destination_type = 'project'");
      expect(sql).toMatch(new RegExp(
        `ALTER TABLE public\\.${table}[\\s\\S]+ALTER COLUMN project_id DROP NOT NULL`,
      ));
      expect(sql).toMatch(new RegExp(
        `${table}_warehouse_tenant_fkey[\\s\\S]+FOREIGN KEY \\(warehouse_id, tenant_id\\)[\\s\\S]+REFERENCES public\\.warehouses\\(id, tenant_id\\)`,
      ));
      expect(sql).toMatch(new RegExp(
        `${table}_destination_check[\\s\\S]+destination_type = 'project'[\\s\\S]+project_id IS NOT NULL[\\s\\S]+warehouse_id IS NULL[\\s\\S]+destination_type = 'warehouse'[\\s\\S]+project_id IS NULL[\\s\\S]+warehouse_id IS NOT NULL`,
      ));
      expect(sql).toContain(`${table}_tenant_warehouse_updated_idx`);
      expect(sql).toContain(`WHERE destination_type = 'warehouse'`);
    }
  });

  test("keeps warehouse procurement disabled in this stage", async () => {
    const sql = await migrationSql();

    expect(sql).toContain("warehouse_procurement_enabled");
    expect(sql).not.toMatch(/warehouse_procurement_enabled\s*=\s*true/);
    expect(sql).not.toContain("CREATE OR REPLACE FUNCTION public.save_supplier_purchase_batch");
    expect(sql).not.toContain("CREATE OR REPLACE FUNCTION public.submit_supplier_purchase_batch");
  });
});
