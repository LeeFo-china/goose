import { describe, expect, test } from "bun:test";

import {
  PLATFORM_SERVICE_TRIAL_SMOKE_FAILED,
  PLATFORM_SERVICE_TRIAL_SMOKE_SCENARIOS,
  buildPlatformServiceTrialSmokeSummary,
  parseLocalPlatformServiceTrialDatabaseUrl,
  runPlatformServiceTrialSmokeCli,
  withIsolatedPlatformServiceTrialEnvironment,
} from "./platform-service-trial-smoke";

describe("platform service trial smoke contract", () => {
  test("repairs platform role permission replacement without a phantom employee column", async () => {
    const migrationDirectory = new URL("../../../../supabase/migrations/", import.meta.url);
    const files = await Array.fromAsync(new Bun.Glob(
      "*_fix_platform_role_permission_employee_version.sql",
    ).scan({ cwd: migrationDirectory.pathname, onlyFiles: true }));
    expect(files).toHaveLength(1);
    const sql = files[0]
      ? (await Bun.file(new URL(files[0], migrationDirectory)).text()).toLowerCase()
      : "";
    expect(sql).toContain("create or replace function public.replace_platform_role_permissions");
    expect(sql).toContain("admin_auth_version = admin_auth_version + 1");
    expect(sql).toContain("version = version + 1");
    const employeeUpdate = sql.slice(
      sql.indexOf("update public.employees"),
      sql.indexOf("select jsonb_build_object", sql.indexOf("update public.employees")),
    );
    expect(employeeUpdate).not.toContain("updated_at");
  });

  test("covers the complete trial lifecycle and concurrency boundary", () => {
    expect(PLATFORM_SERVICE_TRIAL_SMOKE_SCENARIOS).toEqual([
      "apply_pending",
      "application_replay",
      "application_repeat_cooldown",
      "review_scheduled_active_grace_expired",
      "grant_replay_conflict",
      "expected_version",
      "enterprise_cross_tenant_duplicate",
      "extend_revoke",
      "permission_override_actor_revocation",
      "access_priority_hard_block_capability_grace",
      "source_trial_order_uniqueness_release",
      "payment_conversion_idempotency",
      "payment_anomaly_preserves_money_and_work_order",
      "database_clock",
      "effective_list_count_privacy",
      "concurrent_source_create_confirm",
      "upgrade_preflight",
      "fixture_cleanup",
    ]);
  });

  test("accepts only the fixed local Supabase database boundary", () => {
    expect(parseLocalPlatformServiceTrialDatabaseUrl(undefined)).toEqual({
      ok: true,
      databaseUrl: "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
    });
    expect(parseLocalPlatformServiceTrialDatabaseUrl(
      "postgresql://postgres:postgres@localhost:54322/postgres",
    )).toEqual({
      ok: true,
      databaseUrl: "postgresql://postgres:postgres@localhost:54322/postgres",
    });
    for (const unsafe of [
      "postgresql://postgres:secret@db.example.com:5432/postgres",
      "postgresql://postgres:postgres@127.0.0.1:5432/postgres",
      "postgresql://postgres:postgres@127.0.0.1:54322/other",
      "https://127.0.0.1:54322/postgres",
    ]) {
      expect(parseLocalPlatformServiceTrialDatabaseUrl(unsafe)).toEqual({ ok: false });
    }
  });

  test("isolates and restores every Supabase connection variable", async () => {
    const names = [
      "SUPABASE_URL",
      "SUPABASE_PUBLISH",
      "SUPABASE_SERVICE_ROLE_KEY",
      "SUPABASE_DB_URL",
      "SUPABASE_DB_DIRECT_URL",
    ] as const;
    const original = Object.fromEntries(names.map((name) => [name, process.env[name]]));
    process.env.SUPABASE_URL = "https://remote.invalid";
    process.env.SUPABASE_PUBLISH = "remote-publish";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "remote-secret";
    process.env.SUPABASE_DB_URL = "postgresql://remote.invalid/postgres";
    delete process.env.SUPABASE_DB_DIRECT_URL;
    const beforeIsolation = Object.fromEntries(
      names.map((name) => [name, process.env[name]]),
    );
    try {
      await withIsolatedPlatformServiceTrialEnvironment(async () => {
        expect(process.env.SUPABASE_URL).toBe("http://127.0.0.1:54321");
        expect(process.env.SUPABASE_PUBLISH).toBe("task8-local-publish");
        expect(process.env.SUPABASE_SERVICE_ROLE_KEY).toBe("task8-local-service-role");
        expect(process.env.SUPABASE_DB_URL).toBe(
          "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
        );
        expect(process.env.SUPABASE_DB_DIRECT_URL).toBe(
          "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
        );
      });
      for (const name of names) expect(process.env[name]).toBe(beforeIsolation[name]);
    } finally {
      for (const name of names) {
        const value = original[name];
        if (value === undefined) delete process.env[name];
        else process.env[name] = value;
      }
    }
  });

  test("prints only approved boolean evidence and redacts failures", async () => {
    const checks = Object.fromEntries(
      PLATFORM_SERVICE_TRIAL_SMOKE_SCENARIOS.map((name) => [name, true]),
    ) as Record<(typeof PLATFORM_SERVICE_TRIAL_SMOKE_SCENARIOS)[number], boolean>;
    const summary = buildPlatformServiceTrialSmokeSummary(checks);
    const stdout: string[] = [];
    const stderr: string[] = [];
    expect(await runPlatformServiceTrialSmokeCli({
      databaseUrl: undefined,
      runSmoke: async () => summary,
      writeStdout: (message) => stdout.push(message),
      writeStderr: (message) => stderr.push(message),
    })).toBe(0);
    expect(stdout).toEqual([JSON.stringify({ ok: true, ...summary })]);
    expect(stderr).toEqual([]);
    expect(stdout.join("\n")).not.toMatch(/uuid|token|phone|openid|secret|transaction/i);

    expect(await runPlatformServiceTrialSmokeCli({
      databaseUrl: undefined,
      runSmoke: async () => {
        throw new Error("private token phone transaction sentinel");
      },
      writeStdout: (message) => stdout.push(message),
      writeStderr: (message) => stderr.push(message),
    })).toBe(1);
    expect(stderr.at(-1)).toBe(PLATFORM_SERVICE_TRIAL_SMOKE_FAILED);
    expect(stderr.join("\n")).not.toContain("sentinel");
  });
});
