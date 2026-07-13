import { describe, expect, mock, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

const repositoryModule = import("@/repositories/sms-verification-codes");

const migrationPath = join(
  import.meta.dir,
  "../../../../supabase/migrations/20260711120000_reserve_sms_verification_code.sql",
);

describe("reserve SMS verification code migration", () => {
  test("uses sorted advisory locks and restricts the atomic reservation RPC", () => {
    const sql = readFileSync(migrationPath, "utf8");

    expect(sql).toContain("CREATE OR REPLACE FUNCTION public.reserve_sms_verification_code");
    expect(sql).toContain("pg_advisory_xact_lock");
    expect(sql).toMatch(/ORDER BY[\s\S]*lock_key/);
    expect(sql).toContain("p_request_ip_limit");
    expect(sql).toContain("p_request_ip_limit IS NULL");
    expect(sql).toContain("SECURITY DEFINER");
    expect(sql).toContain("SET search_path = pg_catalog, public");
    expect(sql).toContain("REVOKE ALL ON FUNCTION");
    expect(sql).toContain("FROM PUBLIC");
    expect(sql).toContain("FROM anon, authenticated");
    expect(sql).toContain("GRANT EXECUTE ON FUNCTION");
    expect(sql).toContain("TO service_role");
  });
});

describe("SmsVerificationCodeRepository.reservePending", () => {
  test("calls the RPC and validates a successful reservation", async () => {
    const { SmsVerificationCodeRepository } = await repositoryModule;
    const rpc = mock(async () => ({
      data: [{ reserved: true, reservation_id: "00000000-0000-4000-8000-000000000001", limited_dimension: null }],
      error: null,
    }));
    const repository = new SmsVerificationCodeRepository({ rpc });

    await expect(repository.reservePending({
      phone: "13800138000",
      scene: "partner_application",
      code: "123456",
      expiredAt: "2026-07-11T12:05:00.000Z",
      since: "2026-07-11T11:59:00.000Z",
      requestIp: "127.0.0.1",
      requestDevice: "web-device",
      requestIpLimit: 5,
    })).resolves.toEqual({
      reserved: true,
      id: "00000000-0000-4000-8000-000000000001",
      limitedDimension: null,
    });
    expect(rpc).toHaveBeenCalledWith("reserve_sms_verification_code", {
      p_phone: "13800138000",
      p_scene: "partner_application",
      p_code: "123456",
      p_expired_at: "2026-07-11T12:05:00.000Z",
      p_since: "2026-07-11T11:59:00.000Z",
      p_request_ip: "127.0.0.1",
      p_request_device: "web-device",
      p_request_ip_limit: 5,
    });
  });

  test("wraps RPC failures and malformed results as database errors", async () => {
    const { SmsVerificationCodeRepository } = await repositoryModule;
    const rpcFailure = new SmsVerificationCodeRepository({
      rpc: async () => ({ data: null, error: { message: "rpc failed" } }),
    });
    await expect(rpcFailure.reservePending({
      phone: "13800138000",
      scene: "partner_application",
      code: "123456",
      expiredAt: "2026-07-11T12:05:00.000Z",
      since: "2026-07-11T11:59:00.000Z",
      requestIp: null,
      requestDevice: null,
      requestIpLimit: 5,
    })).rejects.toMatchObject({ statusCode: 500, code: "DB_ERROR" });

    const malformed = new SmsVerificationCodeRepository({
      rpc: async () => ({ data: [{ reserved: true }], error: null }),
    });
    await expect(malformed.reservePending({
      phone: "13800138000",
      scene: "partner_application",
      code: "123456",
      expiredAt: "2026-07-11T12:05:00.000Z",
      since: "2026-07-11T11:59:00.000Z",
      requestIp: null,
      requestDevice: null,
      requestIpLimit: 5,
    })).rejects.toMatchObject({ statusCode: 500, code: "DB_ERROR" });
  });
});
