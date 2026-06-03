import type { FastifyRequest } from "fastify";

const CUSTOMER_PROJECT_DETAIL_SLOW_MS = 1_500;

export const customerProjectDetailTimingStepKeys = [
  "auth_context_ms",
  "query_parse_ms",
  "customer_context_ms",
  "user_profile_ms",
  "projects_ms",
  "projects_query_ms",
  "projects_serialize_ms",
  "recent_logs_ms",
  "recent_logs_query_ms",
  "recent_logs_wait_ms",
  "customer_service_ms",
  "project_detail_ms",
  "logs_ms",
  "acceptances_ms",
  "construction_stages_ms",
  "campaign_summary_ms",
  "appointment_reward_ms",
  "serialize_ms",
] as const;

export type CustomerProjectDetailTimingStep =
  (typeof customerProjectDetailTimingStepKeys)[number];

export type CustomerProjectDetailTimingSteps = Record<
  CustomerProjectDetailTimingStep,
  number
>;

export function createCustomerProjectDetailTimingSteps():
  CustomerProjectDetailTimingSteps {
  return Object.fromEntries(
    customerProjectDetailTimingStepKeys.map((key) => [key, 0]),
  ) as CustomerProjectDetailTimingSteps;
}

export async function measureCustomerProjectDetailStep<T>(
  steps: CustomerProjectDetailTimingSteps,
  step: CustomerProjectDetailTimingStep,
  callback: () => Promise<T> | T,
): Promise<T> {
  const startedAt = Date.now();
  try {
    return await callback();
  } finally {
    steps[step] += Date.now() - startedAt;
  }
}

export function logCustomerProjectDetailTiming(
  request: FastifyRequest,
  input: {
    route: string;
    startedAt: number;
    statusCode?: number;
    tenantId?: string | null;
    customerId?: string | null;
    projectId?: string | null;
    query?: Record<string, unknown> | null;
    extra?: Record<string, unknown> | null;
    steps: CustomerProjectDetailTimingSteps;
  },
) {
  const durationMs = Date.now() - input.startedAt;
  const payload = {
    event: "customer_project_detail_timing",
    requestId: request.id,
    route: input.route,
    tenant_id: input.tenantId ?? null,
    customer_id: input.customerId ?? null,
    project_id: input.projectId ?? null,
    duration_ms: durationMs,
    status_code: input.statusCode ?? 200,
    query: input.query ?? {},
    steps: input.steps,
    ...(input.extra ?? {}),
  };

  if (durationMs >= CUSTOMER_PROJECT_DETAIL_SLOW_MS) {
    request.log.warn(payload, "[customer-project-detail] slow timing");
    return;
  }

  request.log.info(payload, "[customer-project-detail] timing");
}
