import { describe, expect, test } from "bun:test";

const MIGRATION_PATH = new URL(
  "../../../../supabase/migrations/20260801105000_atomic_platform_payment_secret_settings.sql",
  import.meta.url,
);

describe("atomic platform payment secret settings migration", () => {
  test("upserts the protected setting and sanitized log in one guarded function", async () => {
    const sql = await Bun.file(MIGRATION_PATH).text();
    const body = sql.match(
      /CREATE OR REPLACE FUNCTION public\.upsert_platform_payment_secret_setting[\s\S]+?AS \$\$([\s\S]+?)\$\$;/,
    )?.[1];

    expect(body).toBeDefined();
    expect(sql).toContain("SECURITY DEFINER");
    expect(sql).toContain("SET search_path = public, pg_temp");
    expect(body).toContain("INSERT INTO public.system_settings");
    expect(body).toContain("ON CONFLICT (key) WHERE tenant_id IS NULL");
    expect(body).toContain("INSERT INTO public.system_setting_change_logs");
    expect(body).toMatch(/old_value_text,[\s\S]+new_value_text/);
    expect(body).toMatch(/VALUES \([\s\S]+NULL,[\s\S]+NULL,/);
    expect(body).not.toMatch(/EXCEPTION\s+WHEN/i);
  });

  test("accepts only the AES-GCM base64url envelope emitted by the service", async () => {
    const sql = await Bun.file(MIGRATION_PATH).text();
    const encryptedPattern = sql.match(/p_value_text !~\s*'([^']+)'/)?.[1];

    expect(encryptedPattern).toBeDefined();
    const matchesEncryptedEnvelope = new RegExp(encryptedPattern ?? "");
    expect(matchesEncryptedEnvelope.test(
      "enc:v1:AbCdEfGhIjKlMnOp:AbCdEfGhIjKlMnOpQrStUv:ciphertext_123-ABC",
    )).toBe(true);

    for (const malformed of [
      "enc:v1:",
      "enc:v1:AbCdEfGhIjKlMnO:AbCdEfGhIjKlMnOpQrStUv:ciphertext",
      "enc:v1:AbCdEfGhIjKlMnOp:AbCdEfGhIjKlMnOpQrStU:ciphertext",
      "enc:v1:AbCdEfGhIjKlMnOp:AbCdEfGhIjKlMnOpQrStUv:",
      "enc:v1:AbCdEfGhIjKlMnO+:AbCdEfGhIjKlMnOpQrStUv:ciphertext",
      "enc:v1:AbCdEfGhIjKlMnOp:AbCdEfGhIjKlMnOpQrStUv:cipher:text",
    ]) {
      expect(matchesEncryptedEnvelope.test(malformed)).toBe(false);
    }
  });

  test("keeps the whitelist and execute privileges fixed", async () => {
    const sql = await Bun.file(MIGRATION_PATH).text();

    for (const key of [
      "PLATFORM_WECHAT_PAY_SECRET_BUNDLE",
      "PLATFORM_WECHAT_PAY_SERVICE_PROVIDER_SECRET_BUNDLE",
      "WECHAT_VIRTUAL_PAYMENT_SANDBOX_SECRET_BUNDLE",
      "WECHAT_VIRTUAL_PAYMENT_PRODUCTION_SECRET_BUNDLE",
      "WECHAT_VIRTUAL_PAYMENT_MESSAGE_TOKEN",
    ]) {
      expect(sql).toContain(`'${key}'`);
    }
    expect(sql).toMatch(
      /REVOKE ALL[\s\S]+upsert_platform_payment_secret_setting[\s\S]+FROM PUBLIC, anon, authenticated/,
    );
    expect(sql).toMatch(
      /GRANT EXECUTE[\s\S]+upsert_platform_payment_secret_setting[\s\S]+TO service_role/,
    );
  });
});
