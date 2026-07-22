import { describe, expect, test } from "bun:test";

const MIGRATION = new URL(
  "../../../../../supabase/migrations/20260722150000_guard_encrypted_id_ocr_enablement.sql",
  import.meta.url,
);

describe("encrypted ID OCR enablement migration", () => {
  test("turns the global capability off only while the OCR master switch is off", async () => {
    const sql = await Bun.file(MIGRATION).text();

    expect(sql).toContain("TENCENT_OCR_ID_CARD_ENCRYPTED_ENABLED");
    expect(sql).toContain("TENCENT_OCR_ENABLED");
    expect(sql).toContain("id_card_setting.tenant_id IS NULL");
    expect(sql).toContain("master_setting.tenant_id IS NULL");
    expect(sql).toContain("value_text = 'false'");
    expect(sql).toContain("COALESCE(master_setting.value_text, 'false') = 'false'");
  });
});
