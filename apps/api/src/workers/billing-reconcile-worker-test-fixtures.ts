export const BRANDING_VIRTUAL_PAYMENT_RESULT = {
  claimed: 0,
  queried: 0,
  confirmed: 0,
  closed: 0,
  failed: 0,
  grantRecovered: 0,
};

const WORKER_ENV_KEYS = [
  "BILLING_RECONCILE_WORKER_ENABLED",
  "BILLING_RECONCILE_BATCH_SIZE",
  "BILLING_RECONCILE_INTERVAL_MS",
  "BILLING_RECHARGE_EXPIRATION_BATCH_SIZE",
  "BILLING_BRANDING_ADDON_EXPIRATION_BATCH_SIZE",
  "BILLING_BRANDING_VIRTUAL_PAYMENT_RECONCILE_BATCH_SIZE",
  "BILLING_REFUND_RECONCILE_BATCH_SIZE",
  "SUPABASE_URL",
  "SUPABASE_PUBLISH",
  "SUPABASE_SERVICE_ROLE_KEY",
] as const;

type WorkerEnvKey = (typeof WORKER_ENV_KEYS)[number];
export type WorkerEnv = Record<WorkerEnvKey, string | undefined>;

export function captureWorkerEnv(): WorkerEnv {
  return Object.fromEntries(
    WORKER_ENV_KEYS.map((key) => [key, process.env[key]]),
  ) as WorkerEnv;
}

export function restoreWorkerEnv(env: WorkerEnv): void {
  for (const key of WORKER_ENV_KEYS) {
    const value = env[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

export function clearWorkerConfigEnv(): void {
  for (const key of WORKER_ENV_KEYS) {
    if (key.startsWith("BILLING_")) delete process.env[key];
  }
}

export function setSupabaseTestEnv(): void {
  process.env.SUPABASE_URL ??= "http://localhost:54321";
  process.env.SUPABASE_PUBLISH ??= "test-publish-key";
  process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";
}

export function createBrandingVirtualPaymentService() {
  return {
    reconcile: async () => BRANDING_VIRTUAL_PAYMENT_RESULT,
  };
}
