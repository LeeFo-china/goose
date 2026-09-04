import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";

const migrationPath = new URL(
  "../../../../supabase/migrations/20260904193000_add_supplier_purchase_personnel_snapshots.sql",
  import.meta.url,
);
const sql = existsSync(migrationPath)
  ? readFileSync(migrationPath, "utf8")
  : "";

describe("supplier purchase personnel snapshot migration contract", () => {
  test("persists readable personnel snapshots on batches and orders", () => {
    expect(sql).toContain("ALTER TABLE public.supplier_purchase_batches");
    expect(sql).toContain("creator_snapshot jsonb");
    expect(sql).toContain("applicant_snapshot jsonb");
    expect(sql).toContain("last_reviewer_snapshot jsonb");
    expect(sql).toContain("ALTER TABLE public.supplier_purchase_orders");
    expect(sql).toContain("creator_snapshot jsonb");
    expect(sql).toContain("applicant_snapshot jsonb");
  });

  test("builds snapshots without exposing full employee phones", () => {
    expect(sql).toContain(
      "CREATE OR REPLACE FUNCTION public.build_supplier_purchase_employee_snapshot",
    );
    expect(sql).toContain("'employee_id'");
    expect(sql).toContain("'name'");
    expect(sql).toContain("'phone_masked'");
    expect(sql).toContain("'role_name'");
    expect(sql).toMatch(/overlay\([\s\S]*employee\.phone[\s\S]*'\*\*\*\*'/);
    expect(sql).not.toContain("'phone', employee.phone");
    expect(sql).not.toContain("employee.role");
  });

  test("backfills and maintains snapshots from actor id fields", () => {
    expect(sql).toContain("UPDATE public.supplier_purchase_batches");
    expect(sql).toContain("UPDATE public.supplier_purchase_orders");
    expect(sql).toContain(
      "DISABLE TRIGGER supplier_purchase_orders_prevent_submitted_mutation",
    );
    expect(sql).toContain(
      "ENABLE TRIGGER supplier_purchase_orders_prevent_submitted_mutation",
    );
    expect(sql).toContain(
      "CREATE OR REPLACE FUNCTION public.sync_supplier_purchase_personnel_snapshots",
    );
    expect(sql).toContain(
      "CREATE TRIGGER supplier_purchase_batches_personnel_snapshots_tg",
    );
    expect(sql).toContain(
      "CREATE TRIGGER supplier_purchase_orders_personnel_snapshots_tg",
    );
  });

  test("keeps the paginated purchase order RPC returning source batch snapshots", () => {
    expect(sql).toContain(
      "CREATE OR REPLACE FUNCTION public.list_supplier_purchase_orders",
    );
    expect(sql).toContain("LEFT JOIN public.supplier_purchase_batches AS batch");
    expect(sql).toContain("'creator_snapshot', paged.creator_snapshot");
    expect(sql).toContain("'applicant_snapshot', paged.applicant_snapshot");
    expect(sql).toContain("'purchase_batch'");
    expect(sql).toContain(
      "'last_reviewer_snapshot', paged.batch_last_reviewer_snapshot",
    );
  });
});
