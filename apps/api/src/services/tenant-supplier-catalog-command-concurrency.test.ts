import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";

const verifierUrl = new URL(
  "../../../../scripts/verify-tenant-supplier-catalog-command-concurrency.sh",
  import.meta.url,
);
const verifier = existsSync(verifierUrl)
  ? readFileSync(verifierUrl, "utf8")
  : "";

describe("tenant supplier catalog category concurrency verifier", () => {
  test("owns one process-unique disposable database cloned from the B baseline", () => {
    expect(verifier).toContain('container_name="supabase_db_gooes"');
    expect(verifier).toMatch(
      /temporary_database="gooes_catalog_v2_cmd_concurrency_\$\{\$\}_\$\{database_suffix\}"/,
    );
    expect(verifier).toContain(
      'baseline_database="gooes_catalog_v2_b_baseline"',
    );
    expect(verifier).toContain("CREATE DATABASE");
    expect(verifier).toContain("TEMPLATE ${baseline_database}");
    expect(verifier).toContain('database_created="false"');
    expect(verifier).toContain('if [ "${database_created}" = "true" ]');
    expect(verifier).toContain("trap cleanup EXIT HUP INT TERM");
    expect(verifier).toContain("DROP DATABASE");
    expect(verifier).not.toContain("DROP DATABASE IF EXISTS");
    expect(verifier).not.toContain("temporary_database_already_exists");
    expect(verifier).toContain("cleanup_residue=0");
  });

  test("runs two category updates and distinguishes cycle from deadlock", () => {
    expect(verifier).toContain("update_tenant_catalog_category");
    expect(verifier).toContain('PGAPPNAME="catalog-category-session-a"');
    expect(verifier).toContain('PGAPPNAME="catalog-category-session-b"');
    expect(verifier).toContain("SUPPLIER_CATALOG_CYCLE");
    expect(verifier).toContain("40P01");
    expect(verifier).toContain("deadlock detected");
    expect(verifier).toContain("category_concurrency_ok");
  });

  test("coordinates unit and legacy category lock inversions in real sessions", () => {
    expect(verifier).toContain("tr_000_catalog_units_pause_insert");
    expect(verifier).toContain("tr_000_catalog_categories_pause_insert");
    expect(verifier).toContain("create_catalog_unit(");
    expect(verifier).toContain("create_catalog_category(");
    expect(verifier).toContain("catalog-unit-create-session");
    expect(verifier).toContain("catalog-unit-update-session");
    expect(verifier).toContain("legacy-category-create-session");
    expect(verifier).toContain("legacy-category-update-session");
    expect(verifier).toContain("unit_lock_order_ok");
    expect(verifier).toContain("legacy_category_lock_order_ok");
  });
});
