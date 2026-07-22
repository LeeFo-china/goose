import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const migrationPath = resolve(
  import.meta.dir,
  "../../../../../supabase/migrations/20260722180000_clarify_ocr_encryption_public_key.sql",
);

describe("OCR encryption public key description migration", () => {
  test("updates only the platform setting description without touching the secret value", () => {
    const sql = readFileSync(migrationPath, "utf8");

    expect(sql).toContain("UPDATE public.system_settings");
    expect(sql).toContain("TENCENT_OCR_ENCRYPTION_PUBLIC_KEY_PEM");
    expect(sql).toContain("tenant_id IS NULL");
    expect(sql).toContain("1024位PKCS#1 RSA公钥PEM");
    expect(sql).toContain("Base64包裹内容，须先解码再保存");
    expect(sql).not.toContain("value_text");
  });
});
