import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const migration = readFileSync(
  fileURLToPath(
    new URL(
      "../../../../supabase/migrations/20260725143000_create_wechat_pay_settlement_rules.sql",
      import.meta.url,
    ),
  ),
  "utf8",
);
const databaseTypes = readFileSync(
  fileURLToPath(new URL("../types/database.ts", import.meta.url)),
  "utf8",
);

describe("wechat pay settlement rules migration", () => {
  test("creates a service-role managed active dictionary table", () => {
    expect(migration).toContain(
      "CREATE TABLE public.wechat_pay_settlement_rules",
    );
    expect(migration).toContain(
      "wechat_pay_settlement_rules_subject_settlement_industry_key",
    );
    expect(migration).toContain(
      "wechat_pay_settlement_rules_active_order_idx",
    );
    expect(migration).toContain(
      "ALTER TABLE public.wechat_pay_settlement_rules FORCE ROW LEVEL SECURITY",
    );
    expect(migration).toContain(
      "GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.wechat_pay_settlement_rules",
    );
  });

  test("seeds official WeChat industry names rather than internal paths", () => {
    expect(migration).toContain("'716'");
    expect(migration).toContain("'719'");
    expect(migration).toContain("'零售'");
    expect(migration).not.toContain("零售批发/生活娱乐");
  });

  test("exposes settlement rules in generated database types", () => {
    expect(databaseTypes).toContain("wechat_pay_settlement_rules: {");
    expect(databaseTypes).toContain("qualification_type: string");
    expect(databaseTypes).toContain("requires_special_qualification: boolean");
  });
});
