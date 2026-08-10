import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

import {
  PLATFORM_SERVICE_ACCESS_SMOKE_FAILED,
  PLATFORM_SERVICE_ACCESS_SMOKE_SCENARIOS,
  buildPlatformServiceAccessSmokeSummary,
  isBoundRefundReflow,
  requireLocalPlatformServiceDatabaseUrl,
  orderServiceOrdersByAcceptedPeriod,
  parseLocalPlatformServiceDatabaseUrl,
  runPlatformServiceAccessSmokeCli,
} from "./platform-service-access-smoke";
import { withIsolatedLocalSupabaseEnvironment } from "./platform-service-access-smoke-fixture";

describe("platform service access smoke contract", () => {
  test("covers the complete formal-access and concurrency boundary", () => {
    expect(PLATFORM_SERVICE_ACCESS_SMOKE_SCENARIOS).toEqual([
      "paid_onboarding",
      "concurrent_acceptance",
      "renewal_extension",
      "acceptance_idempotency",
      "full_refund_termination",
      "hard_block",
      "service_block",
      "closed_terminal",
      "provider_identity_conflict",
      "fixture_cleanup",
    ]);
  });

  test("accepts only the fixed local Supabase database boundary", () => {
    expect(parseLocalPlatformServiceDatabaseUrl(undefined)).toEqual({
      ok: true,
      databaseUrl: "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
    });
    expect(parseLocalPlatformServiceDatabaseUrl(
      "postgresql://postgres:postgres@localhost:54322/postgres",
    )).toEqual({
      ok: true,
      databaseUrl: "postgresql://postgres:postgres@localhost:54322/postgres",
    });
    expect(parseLocalPlatformServiceDatabaseUrl(
      "postgresql://postgres:secret@db.example.com:5432/postgres",
    )).toEqual({ ok: false });
    expect(parseLocalPlatformServiceDatabaseUrl(
      "postgresql://postgres:postgres@127.0.0.1:5432/postgres",
    )).toEqual({ ok: false });
    expect(() => requireLocalPlatformServiceDatabaseUrl(
      "postgresql://postgres:postgres@db.example.com:54322/postgres",
    )).toThrow("platform service access smoke requires local database");
  });

  test("prints only the approved boolean evidence", async () => {
    const summary = buildPlatformServiceAccessSmokeSummary(
      Object.fromEntries(
        PLATFORM_SERVICE_ACCESS_SMOKE_SCENARIOS.map((name) => [name, true]),
      ) as Record<(typeof PLATFORM_SERVICE_ACCESS_SMOKE_SCENARIOS)[number], boolean>,
    );
    expect(summary).toEqual({
      paid_onboarding: true,
      concurrent_acceptance: true,
      renewal_extension: true,
      acceptance_idempotency: true,
      full_refund_termination: true,
      hard_block: true,
      service_block: true,
      closed_terminal: true,
      provider_identity_conflict: true,
      fixture_cleanup: true,
    });

    const stdout: string[] = [];
    const stderr: string[] = [];
    expect(await runPlatformServiceAccessSmokeCli({
      databaseUrl: undefined,
      runSmoke: async () => summary,
      writeStdout: (message) => stdout.push(message),
      writeStderr: (message) => stderr.push(message),
    })).toBe(0);
    expect(stdout).toEqual([JSON.stringify(summary)]);
    expect(stderr).toEqual([]);
    expect(JSON.stringify(stdout)).not.toMatch(/uuid|token|openid|transaction|refund_no/i);
  });

  test("refunds the chronological first period after concurrent acceptance", () => {
    const submittedFirst = { id: "order-a" };
    const submittedSecond = { id: "order-b" };
    expect(orderServiceOrdersByAcceptedPeriod(
      [submittedFirst, submittedSecond],
      [{ service_order_id: "order-b" }, { service_order_id: "order-a" }],
    )).toEqual([submittedSecond, submittedFirst]);
  });

  test("binds void, adjustment and contract summary to the refunded sequence", () => {
    const input = {
      refundOrderId: "order-a",
      remainingOrderId: "order-b",
      refundRequestId: "refund-a",
      periods: [
        {
          id: "period-a",
          service_order_id: "order-a",
          status: "voided",
          refund_request_id: "refund-a",
          starts_at: "2026-08-11T00:00:00.000Z",
          ends_at: "2027-08-11T00:00:00.000Z",
          original_starts_at: "2026-08-11T00:00:00.000Z",
          original_ends_at: "2027-08-11T00:00:00.000Z",
          was_shifted: false,
          starts_at_acceptance: false,
          term_matches: true,
        },
        {
          id: "period-b",
          service_order_id: "order-b",
          status: "adjusted",
          refund_request_id: "refund-a",
          starts_at: "2026-08-11T00:00:01.000Z",
          ends_at: "2027-08-11T00:00:01.000Z",
          original_starts_at: "2027-08-11T00:00:00.000Z",
          original_ends_at: "2028-08-11T00:00:00.000Z",
          was_shifted: true,
          starts_at_acceptance: true,
          term_matches: true,
        },
      ],
      contract: {
        status: "active",
        service_start_at: "2026-08-11T00:00:01.000Z",
        service_end_at: "2027-08-11T00:00:01.000Z",
        last_period_id: "period-b",
      },
    };
    expect(isBoundRefundReflow(input)).toBe(true);
    expect(isBoundRefundReflow({
      ...input,
      periods: input.periods.map((period) => ({ ...period, service_order_id: "wrong" })),
    })).toBe(false);
    expect(isBoundRefundReflow({
      ...input,
      periods: input.periods.map((period) =>
        period.id === "period-b" ? { ...period, was_shifted: false } : period
      ),
    })).toBe(false);
  });

  test("runs database facts through the production access decision service", () => {
    const source = readFileSync(
      `${import.meta.dir}/platform-service-access-smoke-fixture.ts`,
      "utf8",
    );
    expect(source).toContain("new TenantServiceAccessService");
    expect(source).toContain("resolveForRoute");
  });

  test("isolates and restores Supabase env while loading the production service", async () => {
    const names = [
      "SUPABASE_URL",
      "SUPABASE_PUBLISH",
      "SUPABASE_SERVICE_ROLE_KEY",
    ] as const;
    const original = Object.fromEntries(names.map((name) => [name, process.env[name]]));
    process.env.SUPABASE_URL = "https://remote.invalid";
    process.env.SUPABASE_PUBLISH = "remote-publish";
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    try {
      await withIsolatedLocalSupabaseEnvironment(async () => {
        expect(process.env.SUPABASE_URL).toBe("http://127.0.0.1:54321");
        expect(process.env.SUPABASE_PUBLISH).toBe("task7-local-publish");
        expect(process.env.SUPABASE_SERVICE_ROLE_KEY).toBe(
          "task7-local-service-role",
        );
      });
      expect(process.env.SUPABASE_URL).toBe("https://remote.invalid");
      expect(process.env.SUPABASE_PUBLISH).toBe("remote-publish");
      expect(process.env.SUPABASE_SERVICE_ROLE_KEY).toBeUndefined();
    } finally {
      for (const name of names) {
        const value = original[name];
        if (value === undefined) delete process.env[name];
        else process.env[name] = value;
      }
    }
  });

  test("fails closed without leaking database errors", async () => {
    const secret = "private database failure sentinel";
    const stdout: string[] = [];
    const stderr: string[] = [];
    let invoked = false;

    expect(await runPlatformServiceAccessSmokeCli({
      databaseUrl: undefined,
      runSmoke: async () => {
        invoked = true;
        throw new Error(secret);
      },
      writeStdout: (message) => stdout.push(message),
      writeStderr: (message) => stderr.push(message),
    })).toBe(1);
    expect(invoked).toBe(true);
    expect(stdout).toEqual([]);
    expect(stderr).toEqual([PLATFORM_SERVICE_ACCESS_SMOKE_FAILED]);
    expect(JSON.stringify(stderr)).not.toContain(secret);
  });
});
