import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const packageJson = JSON.parse(readFileSync(
  new URL("../../package.json", import.meta.url),
  "utf8",
)) as { scripts?: Record<string, string> };
const runbook = readFileSync(new URL(
  "../../../../docs/runbooks/supplier-purchase-batch-nontransactional-migrations.md",
  import.meta.url,
), "utf8");
const design = readFileSync(new URL(
  "../../../../docs/superpowers/specs/2026-08-29-supplier-purchase-project-option-filters-design.md",
  import.meta.url,
), "utf8");
const plan = readFileSync(new URL(
  "../../../../docs/superpowers/plans/2026-08-29-supplier-purchase-project-option-filters.md",
  import.meta.url,
), "utf8");

const SCRIPT_NAME = "supplier:purchase-project-options:explain";

describe("supplier purchase project option EXPLAIN documentation", () => {
  test("publishes one focused runnable API package script", () => {
    expect(packageJson.scripts?.[SCRIPT_NAME]).toBe(
      "bun src/scripts/supplier-purchase-project-options-explain.ts",
    );
    expect(runbook).toContain(`bun run ${SCRIPT_NAME}`);
  });

  test("documents the dev-only gate, env contract, cases, evidence, and limits", () => {
    for (const value of [
      "SUPPLIER_PURCHASE_PROJECT_OPTIONS_EXPLAIN_CONFIRM",
      "SUPPLIER_PURCHASE_PROJECT_OPTIONS_EXPLAIN_DB_URL",
      "SUPPLIER_PURCHASE_PROJECT_OPTIONS_EXPLAIN_TENANT_ID",
      "SUPPLIER_PURCHASE_PROJECT_OPTIONS_EXPLAIN_UPDATED_AT_FROM",
      "SUPPLIER_PURCHASE_PROJECT_OPTIONS_EXPLAIN_KEYWORD",
      "SUPPLIER_PURCHASE_PROJECT_OPTIONS_EXPLAIN_VISIBLE_PROJECT_IDS",
      "tenant_time_page",
      "tenant_time_count",
      "tenant_time_keyword_page",
      "tenant_time_keyword_count",
      "bounded_visible_page",
      "50ms",
      "250ms",
      "20,000",
      "temp",
      "planningMs",
      "executionMs",
      "sharedReadBlocks",
      "cardinalityBucket",
    ]) {
      expect(runbook).toContain(value);
    }
    expect(runbook.indexOf(`bun run ${SCRIPT_NAME}`)).toBeLessThan(
      runbook.indexOf("Orange"),
    );
  });

  test("keeps design and acceptance plan synchronized with final contracts", () => {
    expect(design).toContain("status: string | null");
    expect(design).toContain(SCRIPT_NAME);
    expect(plan).not.toContain("bun test apps/api/src/");
    expect(plan).not.toContain("bun --cwd apps/api test");
    expect(plan).toContain("cd apps/api && bun test src/");

    for (const acceptanceCase of [
      "unfiltered",
      "last_7_days",
      "current_month",
      "keyword intersection",
      "empty filtered page",
      "multi-page no duplicate/missing stable order",
      "denied project scope",
      "timezone-only no-op",
      "invalid window",
      "invalid timezone",
    ]) {
      expect(plan).toContain(acceptanceCase);
    }
    expect(plan).toContain("updated_at_to?: never");
    expect(plan).toContain("updated_at_before?: never");
  });
});
