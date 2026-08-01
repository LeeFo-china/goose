import { describe, expect, test } from "bun:test";

const migration = Bun.file(new URL(
  "../../../../supabase/migrations/20260731120000_add_supplier_payable_batch_facts.sql",
  import.meta.url,
));

describe("supplier payable batch facts migration", () => {
  test("exposes only a bounded, scoped and stable-order RPC", async () => {
    const sql = await migration.text();
    expect(sql).toContain("CREATE FUNCTION public.get_supplier_payables_by_ids");
    expect(sql).toContain("cardinality(p_payable_event_ids) BETWEEN 1 AND 100");
    expect(sql).toContain("p_visible_project_ids");
    expect(sql).toContain("payable.project_id = ANY (p_visible_project_ids)");
    expect(sql).toContain("payable.id = ANY (p_payable_event_ids)");
    expect(sql).toContain("ORDER BY payable.id");
    expect(sql).toContain("LIMIT 100");
    expect(sql).toContain("REVOKE ALL ON FUNCTION");
    expect(sql).toContain("GRANT EXECUTE ON FUNCTION");
  });
});
