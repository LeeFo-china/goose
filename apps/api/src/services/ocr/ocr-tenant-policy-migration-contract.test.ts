import { describe, expect, test } from "bun:test";

const MIGRATION = new URL(
  "../../../../../supabase/migrations/20260723110000_create_ocr_tenant_policies.sql",
  import.meta.url,
);

describe("OCR tenant rollout policy migration", () => {
  test("creates a default-deny tenant policy control plane", async () => {
    const file = Bun.file(MIGRATION);

    expect(await file.exists()).toBe(true);
    const sql = await file.text();
    expect(sql).toContain("CREATE TABLE public.ocr_tenant_policies");
    expect(sql).toContain("enabled boolean NOT NULL DEFAULT false");
    expect(sql).toContain("allowed_document_types text[] NOT NULL DEFAULT '{}'::text[]");
    expect(sql).toContain("business_license");
    expect(sql).toContain("id_card_front");
    expect(sql).toContain("id_card_back");
    expect(sql).toContain("bank_card");
    expect(sql).toContain("daily_limit IS NULL OR daily_limit BETWEEN 1 AND 10000");
    expect(sql).toContain("NOT enabled OR cardinality(allowed_document_types) > 0");
    expect(sql).toContain("ENABLE ROW LEVEL SECURITY");
    expect(sql).toContain("FORCE ROW LEVEL SECURITY");
    expect(sql).toContain("CREATE VIEW public.platform_ocr_tenant_policy_overview");
    expect(sql).toContain("platform.ocr.tenant_policy.manage");
    expect(sql).toContain("roles.code = 'platform_admin'");
  });
});
