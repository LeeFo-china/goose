export const DEFAULT_PROJECT_HEALTH_SMOKE_TENANT_ADMIN_PHONE = "18800000001";

type ProjectHealthSmokeEnv = Record<string, string | undefined>;

function trimOptional(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed || null;
}

function isLocalHttpUrl(value: string | null): boolean {
  if (!value) return true;

  try {
    const url = new URL(value);
    const hostname = url.hostname.toLowerCase();

    return (
      hostname === "localhost" ||
      hostname === "127.0.0.1" ||
      hostname === "::1" ||
      hostname.endsWith(".localhost")
    );
  } catch {
    return false;
  }
}

export function resolveProjectHealthSmokeTenantAdminPhone(
  env: ProjectHealthSmokeEnv = process.env,
): string {
  const explicitPhone = trimOptional(env.GOOES_E2E_TENANT_ADMIN_PHONE);
  if (explicitPhone) return explicitPhone;

  const adminBaseUrl = trimOptional(env.PLAYWRIGHT_BASE_URL) ?? "http://127.0.0.1:3011";
  const apiBaseUrl = trimOptional(env.GOOES_API_BASE_URL);

  if (isLocalHttpUrl(adminBaseUrl) && isLocalHttpUrl(apiBaseUrl)) {
    return DEFAULT_PROJECT_HEALTH_SMOKE_TENANT_ADMIN_PHONE;
  }

  throw new Error(
    "GOOES_E2E_TENANT_ADMIN_PHONE is required when project health smoke targets a non-local Admin or API host",
  );
}
