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
  test("uses one disposable local database cloned from the B baseline", () => {
    expect(verifier).toContain('container_name="supabase_db_gooes"');
    expect(verifier).toContain(
      'temporary_database="gooes_catalog_v2_command_concurrency_tmp"',
    );
    expect(verifier).toContain(
      'baseline_database="gooes_catalog_v2_b_baseline"',
    );
    expect(verifier).toContain("CREATE DATABASE");
    expect(verifier).toContain("TEMPLATE ${baseline_database}");
    expect(verifier).toContain("trap cleanup EXIT HUP INT TERM");
    expect(verifier).toContain("DROP DATABASE");
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
});
