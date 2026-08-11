import { runTrialCommerceScenarios } from "./platform-service-trial-smoke-commerce";
import {
  cleanupPlatformServiceTrialFixture,
  createPlatformServiceTrialFixture,
  type PlatformServiceTrialFixture,
} from "./platform-service-trial-smoke-fixture";
import { runTrialLifecycleScenarios } from "./platform-service-trial-smoke-lifecycle";

type SmokeScenario = (typeof PLATFORM_SERVICE_TRIAL_SMOKE_SCENARIOS)[number];
type SmokeChecks = Record<SmokeScenario, boolean>;
type SmokeCliInput = {
  databaseUrl: string | undefined;
  runSmoke?: (databaseUrl: string) => Promise<PlatformServiceTrialSmokeSummary>;
  writeStdout?: (message: string) => void;
  writeStderr?: (message: string) => void;
};

const DEFAULT_LOCAL_DATABASE_URL =
  "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const ISOLATED_ENVIRONMENT = {
  SUPABASE_URL: "http://127.0.0.1:54321",
  SUPABASE_PUBLISH: "task8-local-publish",
  SUPABASE_SERVICE_ROLE_KEY: "task8-local-service-role",
  SUPABASE_DB_URL: DEFAULT_LOCAL_DATABASE_URL,
  SUPABASE_DB_DIRECT_URL: DEFAULT_LOCAL_DATABASE_URL,
} as const;

export const PLATFORM_SERVICE_TRIAL_SMOKE_FAILED =
  "PLATFORM_SERVICE_TRIAL_SMOKE_FAILED";
export const PLATFORM_SERVICE_TRIAL_SMOKE_SCENARIOS = [
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
] as const;
export type PlatformServiceTrialSmokeSummary = {
  [Name in SmokeScenario]: boolean;
};

class SmokeFailure extends Error {}

export function parseLocalPlatformServiceTrialDatabaseUrl(
  input: string | undefined,
): { ok: true; databaseUrl: string } | { ok: false } {
  const databaseUrl = input?.trim() || DEFAULT_LOCAL_DATABASE_URL;
  try {
    const url = new URL(databaseUrl);
    const isLocalHost = url.hostname === "127.0.0.1" || url.hostname === "localhost";
    if (
      !["postgres:", "postgresql:"].includes(url.protocol)
      || !isLocalHost
      || url.port !== "54322"
      || url.pathname !== "/postgres"
      || url.username !== "postgres"
      || url.password !== "postgres"
      || url.search !== ""
      || url.hash !== ""
    ) return { ok: false };
    return { ok: true, databaseUrl };
  } catch {
    return { ok: false };
  }
}

export function buildPlatformServiceTrialSmokeSummary(
  checks: SmokeChecks,
): PlatformServiceTrialSmokeSummary {
  return Object.fromEntries(
    PLATFORM_SERVICE_TRIAL_SMOKE_SCENARIOS.map((name) => [name, checks[name]]),
  ) as PlatformServiceTrialSmokeSummary;
}

export async function withIsolatedPlatformServiceTrialEnvironment<T>(
  operation: () => Promise<T>,
): Promise<T> {
  const previous = Object.fromEntries(
    Object.keys(ISOLATED_ENVIRONMENT).map((name) => [name, process.env[name]]),
  );
  Object.assign(process.env, ISOLATED_ENVIRONMENT);
  try {
    return await operation();
  } finally {
    for (const name of Object.keys(ISOLATED_ENVIRONMENT)) {
      const value = previous[name];
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
}

export async function runPlatformServiceTrialSmoke(
  databaseUrl: string,
): Promise<PlatformServiceTrialSmokeSummary> {
  const parsed = parseLocalPlatformServiceTrialDatabaseUrl(databaseUrl);
  if (!parsed.ok) throw new SmokeFailure("trial smoke requires local database");
  const db = new Bun.SQL(parsed.databaseUrl, { max: 4, prepare: false });
  const dbA = new Bun.SQL(parsed.databaseUrl, { max: 1, prepare: false });
  const dbB = new Bun.SQL(parsed.databaseUrl, { max: 1, prepare: false });
  const checks = Object.fromEntries(
    PLATFORM_SERVICE_TRIAL_SMOKE_SCENARIOS.map((name) => [name, false]),
  ) as SmokeChecks;
  let fixture: PlatformServiceTrialFixture | null = null;
  try {
    try {
      fixture = await createPlatformServiceTrialFixture(db);
    } catch (error) {
      throw stageFailure("FIXTURE_CREATE_FAILED", error);
    }
    try {
      Object.assign(checks, await runTrialLifecycleScenarios(db, fixture));
    } catch (error) {
      throw stageFailure("LIFECYCLE_FAILED", error);
    }
    try {
      Object.assign(checks, await runTrialCommerceScenarios(db, dbA, dbB, fixture));
    } catch (error) {
      throw stageFailure("COMMERCE_FAILED", error);
    }
  } finally {
    await Promise.allSettled([dbA.close(), dbB.close()]);
    try {
      if (fixture) {
        checks.fixture_cleanup = await cleanupPlatformServiceTrialFixture(db, fixture);
      }
    } finally {
      await db.close();
    }
  }
  if (PLATFORM_SERVICE_TRIAL_SMOKE_SCENARIOS.some((name) => !checks[name])) {
    throw new SmokeFailure("trial smoke assertion failed");
  }
  return buildPlatformServiceTrialSmokeSummary(checks);
}

function stageFailure(stage: string, error: unknown): SmokeFailure {
  const stableCode = error instanceof Error
    ? error.message.match(/[A-Z][A-Z0-9_]{5,}/)?.[0]
    : null;
  return new SmokeFailure(`${stage}:${stableCode ?? "INTERNAL"}`);
}

export async function runPlatformServiceTrialSmokeCli(
  input: SmokeCliInput,
): Promise<number> {
  const parsed = parseLocalPlatformServiceTrialDatabaseUrl(input.databaseUrl);
  const writeStdout = input.writeStdout ?? console.log;
  const writeStderr = input.writeStderr ?? console.error;
  if (!parsed.ok) {
    writeStderr(PLATFORM_SERVICE_TRIAL_SMOKE_FAILED);
    return 1;
  }
  try {
    const summary = await withIsolatedPlatformServiceTrialEnvironment(() =>
      (input.runSmoke ?? runPlatformServiceTrialSmoke)(parsed.databaseUrl)
    );
    if (PLATFORM_SERVICE_TRIAL_SMOKE_SCENARIOS.some((name) => !summary[name])) {
      throw new SmokeFailure("smoke check failed");
    }
    writeStdout(JSON.stringify({ ok: true, ...summary }));
    return 0;
  } catch {
    writeStderr(PLATFORM_SERVICE_TRIAL_SMOKE_FAILED);
    return 1;
  }
}

if (import.meta.main) {
  void runPlatformServiceTrialSmokeCli({
    databaseUrl: process.env.SUPABASE_DB_DIRECT_URL,
  }).then((exitCode) => {
    process.exitCode = exitCode;
  });
}
