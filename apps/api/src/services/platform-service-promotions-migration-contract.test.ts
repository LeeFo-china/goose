import { describe, expect, test } from "bun:test";

const migrationFile = Bun.file(new URL(
  "../../../../supabase/migrations/20260916170000_create_platform_service_promotions.sql",
  import.meta.url,
));
const readMigration = async () =>
  await migrationFile.exists() ? migrationFile.text() : "";
const functionSql = (sql: string, name: string) => {
  const start = sql.indexOf(`CREATE OR REPLACE FUNCTION public.${name}(`);
  expect(start).toBeGreaterThanOrEqual(0);
  return sql.slice(start, sql.indexOf("$$;", start) + 3);
};
const commands = [
  "platform_service_create_promotion_draft",
  "platform_service_save_promotion_draft",
  "platform_service_publish_promotion",
  "platform_service_stop_promotion",
];
const lists = [
  "platform_service_list_promotions",
  "platform_service_list_effective_products",
];

describe("platform service promotions migration", () => {
  test("creates versioned promotions without seeding an activity", async () => {
    const sql = await readMigration();
    expect(await migrationFile.exists()).toBe(true);
    const ddl = sql.split("CREATE OR REPLACE FUNCTION")[0] ?? "";
    for (const fragment of [
      "CREATE TABLE public.platform_service_promotions",
      "CREATE TABLE public.platform_service_promotion_versions",
      "discount_rate_basis_points integer NOT NULL DEFAULT 2000",
      "discount_rate_basis_points BETWEEN 1 AND 9999",
      "FOREIGN KEY (draft_version_id, id)",
      "FOREIGN KEY (published_version_id, id)",
      "UNIQUE (id, promotion_id)",
      "ENABLE ROW LEVEL SECURITY",
      "update_updated_at_column",
    ]) {
      expect(ddl).toContain(fragment);
    }
    expect(ddl).not.toMatch(/INSERT\s+INTO\s+public\.platform_service_promotions/i);
    expect(ddl).not.toMatch(/INSERT\s+INTO\s+public\.platform_service_promotion_versions/i);
  });

  test("resets service_role default privileges before granting only required table access", async () => {
    const sql = await readMigration();
    const tables = "public.platform_service_promotions, public.platform_service_promotion_versions";
    const revoke = `REVOKE ALL ON TABLE ${tables} FROM service_role;`;
    const grant = `GRANT SELECT, INSERT, UPDATE ON TABLE ${tables} TO service_role;`;
    expect(sql.indexOf(revoke)).toBeGreaterThanOrEqual(0);
    expect(sql.indexOf(grant)).toBeGreaterThan(sql.indexOf(revoke));
    for (const match of sql.matchAll(/GRANT ([^;]+?) ON TABLE ([^;]+?) TO service_role;/g)) {
      if (match[2]?.includes("platform_service_promotion")) {
        expect(match[1]).toBe("SELECT, INSERT, UPDATE");
        expect(match[1]).not.toMatch(/ALL|DELETE|TRUNCATE/);
      }
    }
    expect(sql).not.toMatch(/CREATE SEQUENCE/i);
  });

  test("enforces half-open global published overlap in the database", async () => {
    const sql = await readMigration();
    for (const fragment of [
      "EXCLUDE USING gist",
      "tstzrange(starts_at, ends_at, '[)')",
      "WHERE (publication_status = 'published')",
      "SERVICE_PROMOTION_OVERLAP",
      "WHEN exclusion_violation",
    ]) {
      expect(sql).toContain(fragment);
    }
  });

  test("authorizes and audits all commands and replays publish/stop commands", async () => {
    const sql = await readMigration();
    for (const name of commands) {
      const body = functionSql(sql, name);
      expect(body).toContain("assert_platform_operator_actor(p_actor_employee_id)");
      expect(body).toContain("write_platform_command_audit");
    }
    for (const name of commands.slice(1)) {
      const body = functionSql(sql, name);
      for (const fragment of [
        "FOR UPDATE",
        "p_expected_version",
        "SERVICE_PROMOTION_VERSION_CONFLICT",
        "SERVICE_PROMOTION_NOT_FOUND",
      ]) {
        expect(body).toContain(fragment);
      }
    }
    for (const name of commands.slice(2)) {
      expect(functionSql(sql, name)).toContain("get_platform_command_idempotent_result");
    }
    for (const action of ["create", "update", "publish", "stop"]) {
      expect(sql).toContain(`'platform_service_promotion_${action}'`);
    }
  });

  test("requires all three formal packages and strictly lower published prices", async () => {
    const sql = await readMigration();
    const publish = functionSql(sql, "platform_service_publish_promotion");
    for (const code of [
      "platform_service_1y",
      "platform_service_2y",
      "platform_service_3y",
    ]) {
      expect(publish).toContain(`'${code}'`);
    }
    expect(sql).not.toContain("platform_service_smoke_1fen");
    for (const fragment of [
      "SERVICE_PROMOTION_PRICE_NOT_LOWER",
      "SERVICE_PROMOTION_TIME_INVALID",
      "'superseded'",
      "v_product_count <> 3",
      "GREATEST(1, round(",
      "/ 10000.0",
    ]) {
      expect(publish).toContain(fragment);
    }
    const stop = functionSql(sql, "platform_service_stop_promotion");
    expect(stop).toContain("publication_status = 'stopped'");
    expect(stop).toContain("stop_reason = btrim(p_reason)");
    expect(stop).not.toMatch(/SET\s+(discount_rate_basis_points|starts_at|ends_at|title|name)\s*=/i);
  });

  test("rejects missing, disabled or archived formal products before price checks", async () => {
    const sql = await readMigration();
    const foundation = await Bun.file(new URL(
      "../../../../supabase/migrations/20260803110000_create_platform_service_sales_foundation.sql",
      import.meta.url,
    )).text();
    const productTable = foundation.split("CREATE TABLE public.platform_service_products (")[1]
      ?.split("CREATE TABLE public.platform_service_product_versions")[0] ?? "";
    // Product archival is a status, whereas promotions have archived_at.
    expect(productTable).toContain("'enabled', 'disabled', 'archived'");
    expect(productTable).not.toContain("archived_at");
    for (const name of [
      "platform_service_publish_promotion",
      "platform_service_promotion_price_preview",
      "platform_service_list_promotions",
    ]) {
      const body = functionSql(sql, name);
      expect(body).toContain("product.status = 'enabled'");
      expect(body).toContain("published.id = product.published_version_id");
      expect(body).toContain("published.product_id = product.id");
      expect(body).not.toContain("product.archived_at");
    }
    const publish = functionSql(sql, "platform_service_publish_promotion");
    expect(publish).toContain("archived_at IS NULL");
    expect(publish).toMatch(/IF v_product_count <> 3 THEN\s+RAISE EXCEPTION 'SERVICE_PROMOTION_PRODUCT_UNAVAILABLE'/);
    expect(publish).toContain("IF v_invalid_price THEN");
    expect(publish.indexOf("SERVICE_PROMOTION_PRODUCT_UNAVAILABLE"))
      .toBeLessThan(publish.indexOf("IF v_invalid_price THEN"));
  });

  test("protects published version content and history with a database update trigger", async () => {
    const sql = await readMigration();
    const guard = functionSql(sql, "platform_service_guard_promotion_version_update");
    expect(sql).toMatch(/CREATE TRIGGER tr_platform_service_promotion_versions_immutable\s+BEFORE UPDATE ON public\.platform_service_promotion_versions/);
    expect(sql).toContain("EXECUTE FUNCTION public.platform_service_guard_promotion_version_update()");
    expect(guard).toContain("SET search_path = public, pg_temp");
    expect(guard).toContain("OLD.publication_status = 'draft'");
    expect(guard).toContain("NEW.publication_status NOT IN ('draft', 'published')");
    expect(guard).toContain("OLD.publication_status = 'published' AND NEW.publication_status = 'stopped'");
    expect(guard).toContain("OLD.publication_status = 'published' AND NEW.publication_status = 'superseded'");
    expect(guard).toContain("IS DISTINCT FROM ROW(");
    for (const field of [
      "id", "promotion_id", "version_no", "name", "badge_text", "title", "summary",
      "rules_text", "discount_rate_basis_points", "starts_at", "ends_at", "created_at",
      "published_at", "published_by_employee_id", "stopped_at", "stopped_by_employee_id", "stop_reason",
    ]) {
      expect(guard).toContain(`NEW.${field}`);
      expect(guard).toContain(`OLD.${field}`);
    }
    expect(guard).toContain("SERVICE_PROMOTION_INVALID_STATE");
  });

  test("allows employee FK cleanup without permitting audit actor reassignment", async () => {
    const sql = await readMigration();
    const guard = functionSql(sql, "platform_service_guard_promotion_version_update");
    const immutableRows = [...guard.matchAll(/IF ROW\(([\s\S]+?)\)\s+IS DISTINCT FROM ROW\(([\s\S]+?)\)/g)]
      .map((match) => `${match[1]} ${match[2]}`).join(" ");
    for (const field of ["published_by_employee_id", "stopped_by_employee_id"]) {
      expect(sql).toContain(`${field} uuid REFERENCES public.employees(id) ON DELETE SET NULL`);
      expect(guard).toMatch(new RegExp(
        `NEW\\.${field} IS NOT NULL\\s+AND NEW\\.${field} IS DISTINCT FROM OLD\\.${field}`,
      ));
      expect(immutableRows).not.toContain(field);
    }
    for (const field of [
      "id", "promotion_id", "version_no", "name", "badge_text", "title", "summary",
      "rules_text", "discount_rate_basis_points", "starts_at", "ends_at", "created_at",
      "published_at", "stopped_at", "stop_reason",
    ]) {
      expect(immutableRows).toContain(`NEW.${field}`);
      expect(immutableRows).toContain(`OLD.${field}`);
    }
    const stopTransition = guard.indexOf("OLD.publication_status = 'published' AND NEW.publication_status = 'stopped'");
    expect(guard.indexOf("NEW.published_by_employee_id IS NOT NULL")).toBeLessThan(stopTransition);
    expect(guard.indexOf("NEW.stopped_by_employee_id IS NOT NULL")).toBeGreaterThan(stopTransition);
    // Initial publication still returns from the draft branch before actor protection.
    expect(guard.indexOf("RETURN NEW;")).toBeLessThan(guard.indexOf("NEW.published_by_employee_id IS NOT NULL"));
  });

  test("keeps established state and schedule error codes", async () => {
    const sql = await readMigration();
    expect(sql).toContain("SERVICE_PROMOTION_INVALID_STATE");
    expect(sql).toContain("SERVICE_PROMOTION_TIME_INVALID");
    expect(sql).not.toContain("SERVICE_PROMOTION_STATE_CONFLICT");
    expect(sql).not.toContain("SERVICE_PROMOTION_INVALID_SCHEDULE");
  });

  test("guards product repricing against unexpired published promotions", async () => {
    const publish = functionSql(await readMigration(), "platform_service_publish_product_version");
    for (const fragment of [
      "SERVICE_PROMOTION_PRICE_NOT_LOWER",
      "publication_status = 'published'",
      "ends_at > v_now",
      "pg_advisory_xact_lock",
      "p_amount_fen",
    ]) {
      expect(publish).toContain(fragment);
    }
  });

  test("bounds lists and returns database time, prices and pagination", async () => {
    const sql = await readMigration();
    for (const name of lists) {
      const body = functionSql(sql, name);
      for (const fragment of [
        "p_page < 1",
        "p_page_size NOT BETWEEN 1 AND 100",
        "LIMIT p_page_size OFFSET ((p_page - 1) * p_page_size)",
        "clock_timestamp()",
        "'list'",
        "'pagination'",
        "'totalPages'",
        "ceil(",
        "'server_time'",
      ]) {
        expect(body).toContain(fragment);
      }
    }
    const effective = functionSql(sql, "platform_service_list_effective_products");
    for (const fragment of [
      "'base_amount_fen'",
      "'effective_amount_fen'",
      "'amount_fen'",
      "'promotion'",
      "product.status = 'enabled'",
      "published_version_id",
    ]) {
      expect(effective).toContain(fragment);
    }
    const admin = functionSql(sql, "platform_service_list_promotions");
    for (const field of ["draft", "published", "phase", "price_preview"]) {
      expect(admin).toContain(`'${field}'`);
    }
  });

  test("preserves the trial-aware order signature and lock checks", async () => {
    const previous = await Bun.file(new URL("../../../../supabase/migrations/20260811005555_create_platform_service_trials.sql", import.meta.url)).text();
    const order = functionSql(await readMigration(), "platform_service_create_pending_order");
    const oldOrder = functionSql(previous, "platform_service_create_pending_order");
    expect(order.split("RETURNS")[0]).toBe(oldOrder.split("RETURNS")[0]);
    for (const fragment of [
      "p_source_trial_id uuid DEFAULT NULL",
      "service-trial-enterprise:",
      "service-trial-tenant:",
      "platform_service_trial_normalize_effective_status",
      "SERVICE_TRIAL_ORDER_SOURCE_INVALID",
      "employee.tenant_id = p_tenant_id",
      "conflicting.payment_status <> 'closed'",
    ]) {
      expect(order).toContain(fragment);
    }
  });

  test("freezes database pricing and returns original historical order replay", async () => {
    const order = functionSql(await readMigration(), "platform_service_create_pending_order");
    for (const fragment of [
      "clock_timestamp()",
      "FOR SHARE OF product, published",
      "product.status = 'enabled'",
      "SERVICE_TERMS_VERSION_STALE",
      "p_amount_fen := v_effective_amount_fen",
      "p_product_snapshot := jsonb_build_object(",
      "'promotion', v_promotion_snapshot",
      "SERVICE_ORDER_IDEMPOTENCY_CONFLICT",
    ]) {
      expect(order).toContain(fragment);
    }
    for (const field of [
      "product_id",
      "product_version_id",
      "code",
      "title",
      "pricing_version",
      "term_years",
      "list_amount_fen",
      "base_amount_fen",
      "amount_fen",
      "service_scope",
      "terms_version",
      "terms_content",
    ]) {
      expect(order).toContain(`'${field}'`);
    }
    expect(order.indexOf("RETURN v_order;")).toBeLessThan(order.indexOf("p_amount_fen :="));
  });

  test("restricts all created and replaced functions to service_role", async () => {
    const sql = await readMigration();
    const names = [...sql.matchAll(/CREATE OR REPLACE FUNCTION public\.(\w+)\(/g)].map((match) => match[1]);
    expect(names.length).toBeGreaterThanOrEqual(8);
    for (const name of names) {
      expect(sql).toMatch(new RegExp(`REVOKE ALL ON FUNCTION public\\.${name}\\([^;]*\\) FROM PUBLIC, anon, authenticated;`));
      expect(sql).toMatch(new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${name}\\([^;]*\\) TO service_role;`));
    }
  });
});
