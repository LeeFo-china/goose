import { rename, unlink, writeFile } from "node:fs/promises";

export const DEFAULT_BILLING_RECONCILE_HEALTH_FILE =
  "/tmp/gooes-billing-reconcile-worker-health";
export const DEFAULT_BILLING_RECONCILE_HEALTH_MAX_AGE_MS = 180_000;

type HealthStatus =
  | { status: "healthy"; code: "BILLING_RECONCILE_HEALTHY" }
  | {
    status: "unhealthy";
    code:
      | "BILLING_RECONCILE_HEALTH_MISSING"
      | "BILLING_RECONCILE_HEALTH_INVALID"
      | "BILLING_RECONCILE_HEALTH_STALE";
  };

type HealthOptions = {
  healthFile?: string;
  now?: () => number;
};

export async function markBillingReconcileWorkerHealthy(
  options: HealthOptions = {},
): Promise<void> {
  const healthFile = resolveHealthFile(options.healthFile);
  const timestamp = options.now?.() ?? Date.now();
  if (!Number.isSafeInteger(timestamp) || timestamp < 0) {
    throw new TypeError("invalid health timestamp");
  }
  const temporaryFile = `${healthFile}.${process.pid}.tmp`;
  try {
    await writeFile(temporaryFile, `${timestamp}\n`, { mode: 0o600 });
    await rename(temporaryFile, healthFile);
  } catch (error) {
    await unlink(temporaryFile).catch(() => undefined);
    throw error;
  }
}

export async function checkBillingReconcileWorkerHealth(
  options: HealthOptions & { maxAgeMs?: number } = {},
): Promise<HealthStatus> {
  const healthFile = resolveHealthFile(options.healthFile);
  let evidence: string;
  try {
    evidence = await Bun.file(healthFile).text();
  } catch {
    return unhealthy("BILLING_RECONCILE_HEALTH_MISSING");
  }
  if (!/^\d+\n$/.test(evidence)) {
    return unhealthy("BILLING_RECONCILE_HEALTH_INVALID");
  }
  const timestamp = Number(evidence.trim());
  const now = options.now?.() ?? Date.now();
  if (!Number.isSafeInteger(timestamp) || !Number.isSafeInteger(now)) {
    return unhealthy("BILLING_RECONCILE_HEALTH_INVALID");
  }
  const ageMs = now - timestamp;
  if (ageMs < 0 || ageMs > resolveMaxAge(options.maxAgeMs)) {
    return unhealthy("BILLING_RECONCILE_HEALTH_STALE");
  }
  return { status: "healthy", code: "BILLING_RECONCILE_HEALTHY" };
}

function unhealthy(code: Exclude<HealthStatus, { status: "healthy" }>["code"]): HealthStatus {
  return { status: "unhealthy", code };
}

function resolveHealthFile(value?: string) {
  return value?.trim() || process.env.BILLING_RECONCILE_HEALTH_FILE?.trim() ||
    DEFAULT_BILLING_RECONCILE_HEALTH_FILE;
}

function resolveMaxAge(value?: number) {
  const configured = value ?? Number(
    process.env.BILLING_RECONCILE_HEALTH_MAX_AGE_MS,
  );
  return Number.isSafeInteger(configured) && configured > 0
    ? configured
    : DEFAULT_BILLING_RECONCILE_HEALTH_MAX_AGE_MS;
}

if (import.meta.main) {
  checkBillingReconcileWorkerHealth()
    .then((result) => process.exit(result.status === "healthy" ? 0 : 1))
    .catch(() => process.exit(1));
}
