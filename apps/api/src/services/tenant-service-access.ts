import type {
  TenantServiceAccessLevel,
  TenantServiceAccessMode,
  TenantServiceRouteAccess,
} from "@gooes/domain";

import {
  tenantServiceAccessRepository,
  type TenantServiceAccessFacts,
  type TenantServiceAccessRepositoryPort,
} from "@/repositories/tenant-service-access";

export type TenantServiceAccessErrorCode =
  | "TENANT_SERVICE_READ_ONLY"
  | "TENANT_SERVICE_ACCESS_EXPIRED"
  | "TENANT_SERVICE_HARD_BLOCKED";

export interface TenantServiceAccessDecision {
  mode: TenantServiceAccessMode;
  accessLevel: TenantServiceAccessLevel;
  allowed: boolean;
  errorCode: TenantServiceAccessErrorCode | null;
  reason: string | null;
  startsAt: string | null;
  endsAt: string | null;
}

export type ResolveTenantServiceAccessInput = {
  tenantId: string;
  routeAccess: TenantServiceRouteAccess;
  requiredCapability?: string | null;
  now: Date;
};

export type TenantServiceAccessServiceDependencies = {
  repository?: TenantServiceAccessRepositoryPort;
};

type RouteDecisionInput = {
  mode: TenantServiceAccessMode;
  routeAccess: TenantServiceRouteAccess;
  requiredCapability?: string | null;
  startsAt: string | null;
  endsAt: string | null;
};

type AccessResolution = Pick<
  RouteDecisionInput,
  "mode" | "startsAt" | "endsAt"
>;

const ACCESS_LEVEL_BY_MODE: Record<
  TenantServiceAccessMode,
  TenantServiceAccessLevel
> = {
  paid: "read_write",
  paid_onboarding: "read_write",
  trial: "read_write",
  grace: "read_only",
  legacy: "read_write",
  service_blocked: "none",
  hard_blocked: "none",
};

const DENIALS = {
  grace: {
    errorCode: "TENANT_SERVICE_READ_ONLY",
    reason: "当前服务处于只读宽限期",
  },
  service_blocked: {
    errorCode: "TENANT_SERVICE_ACCESS_EXPIRED",
    reason: "租户服务访问已到期",
  },
  hard_blocked: {
    errorCode: "TENANT_SERVICE_HARD_BLOCKED",
    reason: "租户状态不可用",
  },
} as const;

export class TenantServiceAccessService {
  private readonly repository: TenantServiceAccessRepositoryPort;

  constructor(dependencies: TenantServiceAccessServiceDependencies = {}) {
    this.repository = dependencies.repository ?? tenantServiceAccessRepository;
  }

  async resolveForRoute(
    input: ResolveTenantServiceAccessInput,
  ): Promise<TenantServiceAccessDecision> {
    const facts = await this.repository.getAccessFacts({
      tenantId: input.tenantId,
      now: input.now,
    });
    const resolution = resolveAccessFacts(facts);

    return resolveTenantServiceRouteDecision({
      ...resolution,
      routeAccess: input.routeAccess,
      requiredCapability: input.requiredCapability ?? null,
    });
  }
}

export const tenantServiceAccessService = new TenantServiceAccessService();

export function resolveTenantServiceRouteDecision(
  input: RouteDecisionInput,
): TenantServiceAccessDecision {
  // Phase one preserves this input at the service boundary. Trial scope
  // capability pruning is intentionally added by the later trial-core plan.
  void input.requiredCapability;

  const accessLevel = ACCESS_LEVEL_BY_MODE[input.mode];
  const allowed = isRouteAllowed(input.mode, input.routeAccess);
  if (allowed) {
    return {
      mode: input.mode,
      accessLevel,
      allowed: true,
      errorCode: null,
      reason: null,
      startsAt: input.startsAt,
      endsAt: input.endsAt,
    };
  }

  const denial = input.mode === "grace"
    ? DENIALS.grace
    : input.mode === "hard_blocked"
    ? DENIALS.hard_blocked
    : DENIALS.service_blocked;
  return {
    mode: input.mode,
    accessLevel,
    allowed: false,
    errorCode: denial.errorCode,
    reason: denial.reason,
    startsAt: input.startsAt,
    endsAt: input.endsAt,
  };
}

function resolveAccessFacts(facts: TenantServiceAccessFacts): AccessResolution {
  if (facts.tenantStatus !== "active") {
    return {
      mode: "hard_blocked",
      startsAt: null,
      endsAt: null,
    };
  }

  if (facts.contract) {
    return {
      mode: "paid",
      startsAt: facts.contract.service_start_at,
      endsAt: facts.contract.service_end_at,
    };
  }

  if (facts.paidOnboardingOrder) {
    return {
      mode: "paid_onboarding",
      startsAt: facts.paidOnboardingOrder.paid_at,
      endsAt: null,
    };
  }

  if (facts.legacySubscriptionStatus !== "locked") {
    return {
      mode: "legacy",
      startsAt: null,
      endsAt: null,
    };
  }

  return {
    mode: "service_blocked",
    startsAt: null,
    endsAt: null,
  };
}

function isRouteAllowed(
  mode: TenantServiceAccessMode,
  routeAccess: TenantServiceRouteAccess,
) {
  if (routeAccess === "session" || routeAccess === "public_or_callback") {
    return true;
  }

  if (mode === "hard_blocked") {
    return false;
  }

  if (routeAccess === "recovery") {
    return true;
  }

  if (mode === "service_blocked") {
    return false;
  }

  if (mode === "grace" && routeAccess === "write") {
    return false;
  }

  return true;
}
