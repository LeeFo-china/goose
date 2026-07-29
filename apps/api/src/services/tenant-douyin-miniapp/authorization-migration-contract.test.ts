import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const sql = readFileSync(
  new URL(
    "../../../../../supabase/migrations/20260726110000_tenant_douyin_authorization_intents.sql",
    import.meta.url,
  ),
  "utf8",
).replace(/\s+/g, " ");

describe("tenant douyin authorization intent migration", () => {
  test("stores only opaque intent and authorization code digests", () => {
    expect(sql).toContain(
      "CREATE TABLE public.douyin_miniapp_authorization_intents",
    );
    expect(sql).toContain("intent_digest text NOT NULL UNIQUE");
    expect(sql).toContain("authorization_code_digest text NULL UNIQUE");
    expect(sql).not.toContain("authorization_code text");
  });

  test("correlates event delivery by code digest", () => {
    expect(sql).toContain(
      "ALTER TABLE public.douyin_authorization_event_deliveries ADD COLUMN authorization_code_digest text NULL",
    );
  });

  test("binds an authorized installation to the intent tenant atomically", () => {
    expect(sql).toContain(
      "CREATE OR REPLACE FUNCTION public.complete_tenant_douyin_authorization_intent",
    );
    expect(sql).toContain("DOUYIN_AUTHORIZATION_INTENT_CONFLICT");
  });
});
