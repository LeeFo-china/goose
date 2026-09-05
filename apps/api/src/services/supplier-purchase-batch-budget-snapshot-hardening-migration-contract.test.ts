import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";

const migrationUrl = new URL(
  "../../../../supabase/migrations/20260905200000_harden_supplier_purchase_batch_budget_snapshot.sql",
  import.meta.url,
);
const sql = existsSync(migrationUrl) ? readFileSync(migrationUrl, "utf8") : "";
const compactSql = sql.replace(/\s+/g, " ").trim();

describe("supplier purchase batch budget snapshot hardening migration", () => {
  test("cleans malformed dev snapshots before tightening the table check", () => {
    expect(existsSync(migrationUrl)).toBe(true);
    expect(compactSql).toMatch(
      /UPDATE public\.supplier_purchase_batches AS batch SET budget_snapshot = '\{\}'::jsonb/,
    );
    expect(compactSql).toContain(
      "WHERE NOT public.is_valid_supplier_purchase_batch_budget_snapshot( batch.budget_snapshot )",
    );
    expect(compactSql).toMatch(
      /DROP CONSTRAINT IF EXISTS supplier_purchase_batches_budget_snapshot_check/,
    );
    expect(compactSql).toMatch(
      /ADD CONSTRAINT supplier_purchase_batches_budget_snapshot_check CHECK \(public\.is_valid_supplier_purchase_batch_budget_snapshot\(budget_snapshot\)\)/,
    );
  });

  test("rejects non UUID keys and non canonical budget entries", () => {
    expect(sql).toContain(
      "CREATE OR REPLACE FUNCTION public.is_valid_supplier_purchase_batch_budget_snapshot",
    );
    expect(sql).toContain("key_text::uuid");
    expect(sql).toContain("jsonb_each(p_snapshot)");
    expect(sql).toContain("'requested_amount'");
    expect(sql).toContain("'budget_amount'");
    expect(sql).toContain("'expense_amount'");
    expect(sql).toContain("'other_commitment_amount'");
    expect(sql).toContain("'available_amount'");
    expect(sql).toContain("count(*) FROM jsonb_object_keys(entry.value)");
    expect(sql).toContain("#>> '{}'");
    expect(sql).toContain("^-?\\d+(?:\\.\\d{1,2})?$");
  });
});
