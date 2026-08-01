import { describe, expect, test } from "bun:test";

const MIGRATION_PATH = new URL(
  "../../../../supabase/migrations/20260801105000_atomic_platform_payment_secret_settings.sql",
  import.meta.url,
);

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

describe("atomic platform payment secret settings migration", () => {
  test("upserts the protected setting and sanitized log in one guarded function", async () => {
    const sql = await Bun.file(MIGRATION_PATH).text();
    const body = sql.match(
      /CREATE OR REPLACE FUNCTION public\.upsert_platform_payment_secret_setting[\s\S]+?AS \$\$([\s\S]+?)\$\$;/,
    )?.[1];

    expect(body).toBeDefined();
    expect(sql).toContain("SECURITY DEFINER");
    expect(sql).toContain("SET search_path = public, pg_temp");
    expect(body).not.toContain("ON CONFLICT");
    expect(body).toContain("INSERT INTO public.system_setting_change_logs");
    expect(body).toMatch(/old_value_text,[\s\S]+new_value_text/);
    expect(body).toMatch(/VALUES \([\s\S]+NULL,[\s\S]+NULL,/);
    expect(body).not.toMatch(/WHEN OTHERS/i);
    expect(body).toMatch(
      /WHEN unique_violation THEN[\s\S]+SYSTEM_SETTING_PAYMENT_SECRET_VERSION_CONFLICT/,
    );
  });

  test("serializes one update-first or insert-second mutation with an expected token", async () => {
    const sql = await Bun.file(MIGRATION_PATH).text();
    const body = sql.match(
      /CREATE OR REPLACE FUNCTION public\.upsert_platform_payment_secret_setting[\s\S]+?AS \$\$([\s\S]+?)\$\$;/,
    )?.[1] ?? "";
    const updateIndex = body.indexOf("UPDATE public.system_settings");
    const insertIndex = body.indexOf("INSERT INTO public.system_settings");

    expect(sql).toContain("p_expected_updated_at timestamptz");
    expect(body).toContain("pg_advisory_xact_lock");
    expect(body).toContain("updated_at = p_expected_updated_at");
    expect(body).toContain("SYSTEM_SETTING_PAYMENT_SECRET_VERSION_CONFLICT");
    expect(updateIndex).toBeGreaterThan(-1);
    expect(insertIndex).toBeGreaterThan(updateIndex);
    expect(body.slice(updateIndex, insertIndex)).toContain("IF NOT FOUND THEN");
  });

  test("guards first inserts without reading OLD in the INSERT branch", async () => {
    const sql = await Bun.file(MIGRATION_PATH).text();
    const guardBody = sql.match(
      /CREATE OR REPLACE FUNCTION public\.guard_pending_recharge_payment_secret\(\)[\s\S]+?AS \$\$([\s\S]+?)\$\$;/,
    )?.[1] ?? "";
    const insertBranch = guardBody.match(
      /IF TG_OP = 'INSERT' THEN([\s\S]+?)(?:ELSIF|ELSE)/,
    )?.[1] ?? "";

    expect(guardBody).toContain("IF TG_OP = 'INSERT' THEN");
    expect(insertBranch).toContain("NEW.key");
    expect(insertBranch).not.toContain("OLD.");
    expect(sql).toMatch(
      /CREATE TRIGGER tr_guard_pending_recharge_payment_secret_insert[\s\S]+BEFORE INSERT[\s\S]+ON public\.system_settings/,
    );
  });

  test("preserves every pending WeChat order guard for secret inserts", async () => {
    const sql = await Bun.file(MIGRATION_PATH).text();
    const guardBody = sql.match(
      /CREATE OR REPLACE FUNCTION public\.guard_pending_recharge_payment_secret\(\)[\s\S]+?AS \$\$([\s\S]+?)\$\$;/,
    )?.[1] ?? "";

    expect(guardBody).toContain("public.tenant_credit_orders");
    expect(guardBody).toContain("public.wechat_payment_orders");
    expect(guardBody).toContain("public.tenant_addon_orders");
    expect(guardBody).toContain("PLATFORM_PAYMENT_CONFIG_PENDING_RECHARGE_ORDERS");
  });

  test("accepts only the AES-GCM base64url envelope emitted by the service", async () => {
    const sql = await Bun.file(MIGRATION_PATH).text();
    const encryptedPattern = sql.match(/p_value_text !~\s*'([^']+)'/)?.[1];

    expect(encryptedPattern).toBeDefined();
    const matchesEncryptedEnvelope = new RegExp(encryptedPattern ?? "");
    const envelopePrefix =
      "enc:v1:AbCdEfGhIjKlMnOp:AbCdEfGhIjKlMnOpQrStUv:";
    expect(matchesEncryptedEnvelope.test(
      `${envelopePrefix}ciphertext_123-ABC`,
    )).toBe(true);

    for (const length of [2, 3, 4, 6, 7, 8]) {
      expect(matchesEncryptedEnvelope.test(
        `${envelopePrefix}${"A".repeat(length)}`,
      )).toBe(true);
    }
    for (const length of [1, 5, 9]) {
      expect(matchesEncryptedEnvelope.test(
        `${envelopePrefix}${"A".repeat(length)}`,
      )).toBe(false);
    }

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

  test("accepts an envelope emitted by encryptSecretValue", async () => {
    const previousKey = process.env.APP_CONFIG_ENCRYPTION_KEY;
    process.env.APP_CONFIG_ENCRYPTION_KEY = "migration-envelope-test-key";
    try {
      const { encryptSecretValue } = await import(
        "@/services/system-settings/legacy/crypto"
      );
      const sql = await Bun.file(MIGRATION_PATH).text();
      const pattern = sql.match(/p_value_text !~\s*'([^']+)'/)?.[1] ?? "";

      expect(new RegExp(pattern).test(encryptSecretValue("real-secret")))
        .toBe(true);
    } finally {
      if (previousKey === undefined) {
        delete process.env.APP_CONFIG_ENCRYPTION_KEY;
      } else {
        process.env.APP_CONFIG_ENCRYPTION_KEY = previousKey;
      }
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
