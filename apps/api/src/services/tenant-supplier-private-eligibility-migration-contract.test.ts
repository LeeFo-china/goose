import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";

const migrationsDir = new URL("../../../../supabase/migrations/", import.meta.url);

function readEffectiveMigrationSql() {
  return readdirSync(migrationsDir)
    .filter((name) => name.endsWith(".sql"))
    .sort()
    .map((name) => readFileSync(new URL(name, migrationsDir), "utf8"))
    .join("\n");
}

function latestFunction(sql: string, name: string) {
  const pattern = new RegExp(
    `CREATE (?:OR REPLACE )?FUNCTION public\\.${name}\\s*\\(`,
    "g",
  );
  const starts = [...sql.matchAll(pattern)].map((match) => match.index ?? -1);
  const start = starts.at(-1) ?? -1;
  if (start < 0) return "";
  const end = sql.indexOf("\n$$;", start);
  return end < 0 ? sql.slice(start) : sql.slice(start, end + 4);
}

describe("tenant private supplier order eligibility migration contract", () => {
  test("does not use blocking qualification requirements as tenant-private supplier order gates", () => {
    const latestEligibilitySet = latestFunction(
      readEffectiveMigrationSql(),
      "get_tenant_supplier_order_eligibility_set",
    );

    expect(latestEligibilitySet).toContain("supplier.ownership_scope");
    expect(latestEligibilitySet).toContain("supplier.owner_tenant_id");
    expect(latestEligibilitySet).toMatch(
      /qualification_type\.blocks_new_orders[\s\S]*relationship\.ownership_scope <> 'tenant'[\s\S]*relationship\.owner_tenant_id IS DISTINCT FROM relationship\.tenant_id/,
    );
    expect(latestEligibilitySet).toMatch(
      /'required_qualification_missing'[\s\S]*'required_qualification_expired'/,
    );
    expect(latestEligibilitySet).toMatch(
      /cardinality\(evaluated\.blocking_reasons\) = 0 AS eligible/,
    );
  });
});
