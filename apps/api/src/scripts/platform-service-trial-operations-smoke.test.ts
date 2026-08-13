import { describe, expect, test } from "bun:test";

import {
  PLATFORM_SERVICE_TRIAL_OPERATIONS_SMOKE_FAILED,
  PLATFORM_SERVICE_TRIAL_OPERATIONS_SMOKE_SCENARIOS,
  buildTrialOperationsSmokeSummary,
  parseLocalTrialOperationsDatabaseUrl,
  runPlatformServiceTrialOperationsSmokeCli,
} from "./platform-service-trial-operations-smoke";

describe("platform service trial operations smoke contract", () => {
  test("covers notification boundaries, retry, pagination, and cleanup", () => {
    expect(PLATFORM_SERVICE_TRIAL_OPERATIONS_SMOKE_SCENARIOS).toEqual([
      "time_boundary_once",
      "failed_delivery_retry",
      "follow_up_pagination",
      "fixture_cleanup",
    ]);
  });

  test("accepts only the fixed local Supabase database boundary", () => {
    expect(parseLocalTrialOperationsDatabaseUrl(undefined)).toEqual({
      ok: true,
      databaseUrl: "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
    });
    expect(parseLocalTrialOperationsDatabaseUrl(
      "postgresql://postgres:postgres@localhost:54322/postgres",
    ).ok).toBe(true);
    for (const unsafe of [
      "postgresql://postgres:secret@db.example.com:5432/postgres",
      "postgresql://postgres:postgres@127.0.0.1:5432/postgres",
      "postgresql://postgres:postgres@127.0.0.1:54322/other",
    ]) expect(parseLocalTrialOperationsDatabaseUrl(unsafe)).toEqual({ ok: false });
  });

  test("requires cleanup of every operations fact from the shared fixture", async () => {
    const fixture = await Bun.file(new URL(
      "./platform-service-trial-smoke-fixture.ts",
      import.meta.url,
    )).text();
    expect(fixture).toContain("tenant_service_trial_notification_deliveries");
    expect(fixture).toContain("tenant_service_trial_followups");
    expect(fixture).toContain("target_type = 'service_trial_delivery'");
  });

  test("keeps the immutable delivery ledger intact while testing retries", async () => {
    const runner = await Bun.file(new URL(
      "./platform-service-trial-operations-smoke.ts",
      import.meta.url,
    )).text();
    expect(runner).not.toContain("session_replication_role");
    expect(runner).not.toContain("delete from public.tenant_service_trial_notification_deliveries");
    expect(runner).toContain("claimDeliveries(db, 5)");
  });

  test("prints only boolean evidence and redacts failures", async () => {
    const checks = Object.fromEntries(
      PLATFORM_SERVICE_TRIAL_OPERATIONS_SMOKE_SCENARIOS.map((name) => [name, true]),
    ) as Record<(typeof PLATFORM_SERVICE_TRIAL_OPERATIONS_SMOKE_SCENARIOS)[number], boolean>;
    const summary = buildTrialOperationsSmokeSummary(checks);
    const stdout: string[] = [];
    const stderr: string[] = [];
    expect(await runPlatformServiceTrialOperationsSmokeCli({
      databaseUrl: undefined,
      runSmoke: async () => summary,
      writeStdout: (message) => stdout.push(message),
      writeStderr: (message) => stderr.push(message),
    })).toBe(0);
    expect(stdout).toEqual([JSON.stringify({ ok: true, ...summary })]);
    expect(stdout.join("\n")).not.toMatch(/uuid|token|phone|openid|secret/i);

    expect(await runPlatformServiceTrialOperationsSmokeCli({
      databaseUrl: undefined,
      runSmoke: async () => { throw new Error("private token phone sentinel"); },
      writeStdout: (message) => stdout.push(message),
      writeStderr: (message) => stderr.push(message),
    })).toBe(1);
    expect(stderr.at(-1)).toBe(PLATFORM_SERVICE_TRIAL_OPERATIONS_SMOKE_FAILED);
    expect(stderr.join("\n")).not.toContain("sentinel");
  });
});
