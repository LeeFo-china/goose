import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const migrationUrl = new URL(
  "../../../../supabase/migrations/20260802150000_add_branding_virtual_goods_lifecycle.sql",
  import.meta.url,
);

function normalizedSql(): string {
  return readFileSync(migrationUrl, "utf8")
    .replace(/--.*$/gm, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

describe("branding virtual goods lifecycle migration", () => {
  test("adds a backwards-compatible HTTPS image URL with a database boundary", () => {
    const sql = normalizedSql();

    expect(sql).toContain("add column item_url text null");
    expect(sql).toContain(
      "constraint platform_virtual_payment_products_item_url_check",
    );
    expect(sql).toContain("item_url ~* '^https://");
    expect(sql).toContain("char_length(item_url) <= 2048");
  });

  test("treats the image URL as validation-sensitive and returns it in snapshots", () => {
    const sql = normalizedSql();

    expect(sql).toContain("old.item_url is distinct from new.item_url");
    expect(sql).toContain("'item_url', mapping.item_url");
    expect(sql).toContain("new.validation_status := 'pending'");
    expect(sql).toContain("new.validated_at := null");
  });

  test("wraps the existing atomic command with an image-aware write", () => {
    const sql = normalizedSql();
    const manageStart = sql.indexOf(
        "create or replace function public.branding_manage_virtual_product_configuration",
    );
    const manageRpc = sql.slice(
      manageStart,
      sql.indexOf(
        "revoke all on function public.branding_manage_virtual_product_configuration(",
        manageStart,
      ),
    );

    expect(sql).toContain(
      "rename to branding_manage_virtual_product_configuration_without_item_url",
    );
    expect(manageRpc).toContain("p_virtual_product_patch - 'item_url'");
    expect(manageRpc).toContain("jsonb_typeof(p_virtual_product_patch->'item_url') <> 'string'");
    expect(manageRpc).toContain("item_url = p_virtual_product_patch->>'item_url'");
    expect(manageRpc).toContain("jsonb_set(v_result, '{virtual_product}'");
    expect(sql).toContain(
      "revoke all on function public.branding_manage_virtual_product_configuration_without_item_url(",
    );
    expect(sql).toContain("from public, anon, authenticated, service_role");
  });

  test("preserves optimistic locking and service-role-only command access", () => {
    const sql = normalizedSql();

    expect(sql).toContain(
      "hashtextextended('branding_virtual_payment_config', 20260801)",
    );
    expect(sql).toContain(
      "public.branding_manage_virtual_product_configuration_without_item_url(",
    );
    expect(sql).toContain(
      "revoke all on function public.branding_manage_virtual_product_configuration(",
    );
    expect(sql).toContain("from public, anon, authenticated");
    expect(sql).toContain(
      "grant execute on function public.branding_manage_virtual_product_configuration(",
    );
    expect(sql).toContain("to service_role");
    expect(sql).toContain(
      "revoke insert, update on table public.platform_virtual_payment_products from service_role",
    );
    expect(sql).not.toContain(
      "grant insert, update on table public.platform_virtual_payment_products to service_role",
    );
  });

  test("does not embed credentials or a fabricated business image", () => {
    const sql = readFileSync(migrationUrl, "utf8");

    expect(sql).not.toMatch(/app[_-]?key\s*[:=]/i);
    expect(sql).not.toMatch(/access[_-]?token\s*[:=]/i);
    expect(sql).not.toMatch(/https:\/\/[^'\s]+\.(png|jpe?g)/i);
  });
});
