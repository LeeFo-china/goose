import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";

const migration = new URL(
  "../../../../../supabase/migrations/20260905212000_submit_douyin_measurement_with_verified_phone.sql",
  import.meta.url,
);

function sql(): string {
  return existsSync(migration) ? readFileSync(migration, "utf8") : "";
}

describe("Douyin official phone appointment migration", () => {
  test("adds a service-role-only wrapper RPC without changing the existing submit signature", () => {
    const source = sql();
    expect(existsSync(migration)).toBe(true);
    expect(source).toContain(
      "CREATE OR REPLACE FUNCTION public.submit_douyin_measurement_appointment_with_douyin_phone",
    );
    expect(source).toContain("LANGUAGE plpgsql");
    expect(source).toContain("SECURITY DEFINER");
    expect(source).toContain("SET search_path = pg_catalog, public");
    expect(source).toContain(
      "REVOKE ALL ON FUNCTION public.submit_douyin_measurement_appointment_with_douyin_phone",
    );
    expect(source).toContain("FROM public, anon, authenticated");
    expect(source).toContain(
      "GRANT EXECUTE ON FUNCTION public.submit_douyin_measurement_appointment_with_douyin_phone",
    );
    expect(source).toContain("TO service_role");
    expect(source).not.toContain("CREATE OR REPLACE FUNCTION public.submit_douyin_measurement_appointment(\n");
  });

  test("replays idempotent submissions before creating a verification row", () => {
    const source = sql();
    const replayLookup = source.indexOf("FROM public.douyin_measurement_appointments AS appointment");
    const replayReturn = source.indexOf("'already_submitted', true", replayLookup);
    const verificationInsert = source.indexOf("INSERT INTO public.sms_verification_codes");
    expect(replayLookup).toBeGreaterThan(-1);
    expect(replayReturn).toBeGreaterThan(replayLookup);
    expect(verificationInsert).toBeGreaterThan(replayReturn);
    expect(source).toContain("v_appointment.create_request_hash IS DISTINCT FROM v_request_hash");
    expect(source).toContain("'DOUYIN_MEASUREMENT_IDEMPOTENCY_CONFLICT'");
  });

  test("delegates to the existing atomic submit command and deletes unused verification facts", () => {
    const source = sql();
    const verificationInsert = source.indexOf("INSERT INTO public.sms_verification_codes");
    const delegate = source.indexOf("public.submit_douyin_measurement_appointment(", verificationInsert);
    const cleanup = source.indexOf("DELETE FROM public.sms_verification_codes", delegate);
    expect(source).toContain("'douyin_lead'");
    expect(source).toContain("request_device");
    expect(delegate).toBeGreaterThan(verificationInsert);
    expect(cleanup).toBeGreaterThan(delegate);
    expect(source).toContain("IF v_result ? 'error' THEN");
    expect(source).toContain("sms.id = v_sms_id");
    expect(source).toContain("sms.status = 'pending'");
  });
});
