const DEFAULT_ADMIN_AUTH_LOGIN_SLOW_MS = 1_000;

export const adminAuthLoginTimingStepKeys = [
  "find_employee_ms",
  "employee_auth_context_ms",
  "verification_code_ms",
  "admin_auth_user_ms",
  "business_membership_sync_ms",
  "verification_mark_ms",
  "session_auth_context_ms",
] as const;

export type AdminAuthLoginTimingStep =
  (typeof adminAuthLoginTimingStepKeys)[number];

export type AdminAuthLoginTimingSteps = Record<
  AdminAuthLoginTimingStep,
  number
>;

type AdminAuthLoginTimingLogger = {
  info: (payload: Record<string, unknown>, message: string) => void;
  warn: (payload: Record<string, unknown>, message: string) => void;
};

type AdminAuthLoginTimingRequest = {
  id: string;
  log: AdminAuthLoginTimingLogger;
};

function getAdminAuthLoginSlowMs() {
  const raw = Number(
    process.env.ADMIN_AUTH_LOGIN_SLOW_MS ||
      process.env.SLOW_REQUEST_MS ||
      DEFAULT_ADMIN_AUTH_LOGIN_SLOW_MS,
  );
  return Number.isFinite(raw) && raw > 0
    ? raw
    : DEFAULT_ADMIN_AUTH_LOGIN_SLOW_MS;
}

export function createAdminAuthLoginTimingSteps():
  AdminAuthLoginTimingSteps {
  return Object.fromEntries(
    adminAuthLoginTimingStepKeys.map((key) => [key, 0]),
  ) as AdminAuthLoginTimingSteps;
}

export async function measureAdminAuthLoginStep<T>(
  steps: AdminAuthLoginTimingSteps,
  step: AdminAuthLoginTimingStep,
  callback: () => Promise<T> | T,
): Promise<T> {
  const startedAt = Date.now();
  try {
    return await callback();
  } finally {
    steps[step] += Date.now() - startedAt;
  }
}

export function logAdminAuthLoginTiming(
  request: AdminAuthLoginTimingRequest,
  input: {
    startedAt: number;
    statusCode: number;
    steps: AdminAuthLoginTimingSteps;
  },
) {
  const durationMs = Date.now() - input.startedAt;
  const payload = {
    event: "admin_auth_login_timing",
    requestId: request.id,
    route: "/admin/auth/login",
    duration_ms: durationMs,
    status_code: input.statusCode,
    steps: input.steps,
  };

  if (durationMs >= getAdminAuthLoginSlowMs()) {
    request.log.warn(payload, "[admin-auth] slow login timing");
    return;
  }

  request.log.info(payload, "[admin-auth] login timing");
}
