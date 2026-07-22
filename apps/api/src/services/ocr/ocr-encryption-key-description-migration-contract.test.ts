import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const migrationPath = resolve(
  import.meta.dir,
  "../../../../../supabase/migrations/20260722180000_clarify_ocr_encryption_public_key.sql",
);
const normalizationMigrationPath = resolve(
  import.meta.dir,
  "../../../../../supabase/migrations/20260722190000_align_ocr_public_key_admin_copy.sql",
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

  test("aligns the stored description with Admin Base64 normalization", () => {
    expect(existsSync(normalizationMigrationPath)).toBeTrue();
    if (!existsSync(normalizationMigrationPath)) return;

    const sql = readFileSync(normalizationMigrationPath, "utf8");
    const definitions = readFileSync(
      resolve(import.meta.dir, "../system-settings/legacy/definitions-integrations.ts"),
      "utf8",
    );

    for (const source of [sql, definitions]) {
      expect(source).toContain(
        "支持上传原始PKCS#1 PEM，或粘贴该PEM的外层Base64编码，保存时自动规范化",
      );
      expect(source).not.toContain("Base64包裹内容，须先解码再保存");
    }
    expect(sql).not.toContain("value_text");
  });
});
