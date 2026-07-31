import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const migrationUrl = new URL(
  "../../../../supabase/migrations/20260731132000_create_branding_virtual_product_management_rpcs.sql",
  import.meta.url,
);

function normalizedSql(): string {
  return readFileSync(migrationUrl, "utf8")
    .replace(/--.*$/gm, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

describe("branding virtual product management migration", () => {
  test("resets validation evidence whenever sensitive coordinates change", () => {
    const sql = normalizedSql();

    expect(sql).toContain("guard_branding_virtual_product_validation_lifecycle");
    for (const field of [
      "app_id",
      "virtual_merchant_id",
      "offer_id",
      "provider_product_id",
      "expected_amount_fen",
      "encrypted_secret_ref",
      "secret_revision",
    ]) {
      expect(sql).toContain(`old.${field} is distinct from new.${field}`);
    }
    expect(sql).toContain("new.validation_status := 'pending'");
    expect(sql).toContain("new.validated_at := null");
    expect(sql).toContain("message = 'branding_virtual_product_revalidation_required'");
    expect(sql).toContain(
      "before insert or update on public.platform_virtual_payment_products",
    );
  });

  test("manages product and mapping versions in one database transaction", () => {
    const sql = normalizedSql();

    expect(sql).toContain("branding_manage_virtual_product_configuration");
    expect(sql).toContain("from public.platform_addon_products");
    expect(sql).toContain("for update");
    expect(sql).toContain("branding_addon_product_version_conflict");
    expect(sql).toContain("branding_virtual_product_version_conflict");
    expect(sql).toContain("branding_addon_purchase_mode_transition_invalid");
    expect(sql).toContain("branding_virtual_product_amount_too_low");
    expect(sql).toContain("update public.platform_addon_products");
    expect(sql).toContain("update public.platform_virtual_payment_products");
    expect(sql).toContain("insert into public.platform_virtual_payment_products");
    expect(sql).toContain("jsonb_build_object('product'");
  });

  test("writes local validation results with both optimistic versions", () => {
    const sql = normalizedSql();

    expect(sql).toContain("branding_set_virtual_product_configuration_validation");
    expect(sql).toContain("p_expected_product_version integer");
    expect(sql).toContain("p_expected_mapping_version integer");
    expect(sql).toContain("p_validation_status text");
    expect(sql).toContain("validation_status = p_validation_status");
    expect(sql).toContain(
      "when p_validation_status = 'invalid' and status = 'active' then 'disabled'",
    );
    expect(sql).toContain("validated_at = p_validated_at");
    expect(sql).toContain("version = version + 1");
  });

  test("keeps both management functions service-role only", () => {
    const sql = normalizedSql();

    expect(sql.match(/security definer/g)?.length).toBeGreaterThanOrEqual(2);
    expect(sql.match(/set search_path = public, pg_temp/g)?.length)
      .toBeGreaterThanOrEqual(2);
    for (const name of [
      "branding_manage_virtual_product_configuration",
      "branding_set_virtual_product_configuration_validation",
    ]) {
      expect(sql).toContain(`revoke all on function public.${name}`);
      expect(sql).toContain(`grant execute on function public.${name}`);
    }
    expect(sql).not.toContain("grant execute on function public.branding_manage_virtual_product_configuration() to authenticated");
  });
});
