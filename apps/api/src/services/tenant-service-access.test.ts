import { describe, expect, mock, test } from "bun:test";

import type { TenantServiceAccessFacts } from "../repositories/tenant-service-access";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

const TENANT_ID = "10000000-0000-4000-8000-000000000001";
const NOW = new Date("2026-08-10T08:00:00.000Z");
const DECISION_STARTS_AT = "2026-08-10T08:00:00.000Z";
const DECISION_ENDS_AT = "2026-09-10T08:00:00.000Z";
const ROUTE_ACCESSES = [
  "session",
  "recovery",
  "read",
  "write",
  "public_or_callback",
] as const;

const baseFacts: TenantServiceAccessFacts = {
  evaluatedAt: NOW.toISOString(),
  tenantStatus: "active",
  contract: null,
  paidOnboardingOrder: null,
  legacySubscriptionStatus: "locked",
  currentTrial: null,
  latestTrial: null,
};

describe("TenantServiceAccessService", () => {
  test("applies hard block before paid and onboarding access", async () => {
    const { TenantServiceAccessService } = await import("./tenant-service-access");
    const getAccessFacts = mock(async () => ({
      ...baseFacts,
      tenantStatus: "suspended",
      contract: {
        id: "contract-1",
        service_start_at: "2026-08-01T00:00:00.000Z",
        service_end_at: "2027-08-01T00:00:00.000Z",
      },
      paidOnboardingOrder: { id: "order-1", paid_at: NOW.toISOString() },
      currentTrial: trialFact(),
    }));
    const service = new TenantServiceAccessService({
      repository: { getAccessFacts }, trialAccessEnabled: async () => true,
    });

    const decision = await service.resolveForRoute({
      tenantId: TENANT_ID,
      routeAccess: "recovery",
    });

    expect(decision).toEqual({
      mode: "hard_blocked",
      accessLevel: "none",
      allowed: false,
      errorCode: "TENANT_SERVICE_HARD_BLOCKED",
      reason: "租户状态不可用",
      startsAt: null,
      endsAt: null,
    });
  });

  test.each([
    {
      name: "paid contract wins over onboarding and locked legacy",
      facts: {
        ...baseFacts,
        contract: {
          id: "contract-1",
          service_start_at: "2026-08-01T00:00:00.000Z",
          service_end_at: "2027-08-01T00:00:00.000Z",
        },
        paidOnboardingOrder: { id: "order-1", paid_at: NOW.toISOString() },
        currentTrial: trialFact(),
      },
      expected: {
        mode: "paid",
        startsAt: "2026-08-01T00:00:00.000Z",
        endsAt: "2027-08-01T00:00:00.000Z",
      },
    },
    {
      name: "paid onboarding wins over locked legacy",
      facts: {
        ...baseFacts,
        paidOnboardingOrder: { id: "order-1", paid_at: NOW.toISOString() },
        currentTrial: trialFact(),
      },
      expected: {
        mode: "paid_onboarding",
        startsAt: NOW.toISOString(),
        endsAt: null,
      },
    },
    {
      name: "active trial wins over locked legacy",
      facts: {
        ...baseFacts,
        currentTrial: trialFact(),
      },
      expected: {
        mode: "trial",
        startsAt: "2026-08-01T00:00:00.000Z",
        endsAt: "2026-09-01T00:00:00.000Z",
      },
    },
    {
      name: "effective grace wins over locked legacy",
      facts: {
        ...baseFacts,
        currentTrial: trialFact({
          status: "grace_period",
          trial_ends_at: "2026-08-09T00:00:00.000Z",
          grace_ends_at: "2026-08-16T00:00:00.000Z",
        }),
      },
      expected: {
        mode: "grace",
        startsAt: "2026-08-01T00:00:00.000Z",
        endsAt: "2026-08-16T00:00:00.000Z",
      },
    },
    {
      name: "unlocked legacy subscription keeps compatibility access",
      facts: { ...baseFacts, legacySubscriptionStatus: "active" },
      expected: { mode: "legacy", startsAt: null, endsAt: null },
    },
    {
      name: "missing legacy subscription keeps the previous unlocked behavior",
      facts: { ...baseFacts, legacySubscriptionStatus: null },
      expected: { mode: "legacy", startsAt: null, endsAt: null },
    },
    {
      name: "locked legacy without a new service fact is service blocked",
      facts: baseFacts,
      expected: { mode: "service_blocked", startsAt: null, endsAt: null },
    },
  ])("resolves $name", async ({ facts, expected }) => {
    const { TenantServiceAccessService } = await import("./tenant-service-access");
    const getAccessFacts = mock(async () => facts);
    const service = new TenantServiceAccessService({
      repository: { getAccessFacts }, trialAccessEnabled: async () => true,
    });

    const decision = await service.resolveForRoute({
      tenantId: TENANT_ID,
      routeAccess: expected.mode === "service_blocked" ? "read" : "write",
      requiredCapability: "core.projects",
    });

    expect(decision).toMatchObject(expected);
    expect(getAccessFacts).toHaveBeenCalledWith({ tenantId: TENANT_ID });
  });

  test("does not prune paid access by trial capability", async () => {
    const { TenantServiceAccessService } = await import("./tenant-service-access");
    const getAccessFacts = mock(async () => ({
      ...baseFacts,
      contract: {
        id: "contract-1",
        service_start_at: "2026-08-01T00:00:00.000Z",
        service_end_at: "2027-08-01T00:00:00.000Z",
      },
    }));
    const service = new TenantServiceAccessService({
      repository: { getAccessFacts }, trialAccessEnabled: async () => true,
    });

    const decision = await service.resolveForRoute({
      tenantId: TENANT_ID,
      routeAccess: "write",
      requiredCapability: "core.files",
    });

    expect(decision).toMatchObject({
      mode: "paid",
      allowed: true,
      errorCode: null,
      reason: null,
    });
  });

  test("denies trial routes outside the immutable scope", async () => {
    const { TenantServiceAccessService } = await import("./tenant-service-access");
    const service = new TenantServiceAccessService({
      trialAccessEnabled: async () => true,
      repository: {
        getAccessFacts: mock(async () => ({
          ...baseFacts,
          currentTrial: trialFact(),
        })),
      },
    });

    expect(await service.resolveForRoute({
      tenantId: TENANT_ID,
      routeAccess: "read",
      requiredCapability: "core.files",
    })).toMatchObject({
      mode: "trial",
      allowed: false,
      errorCode: "TENANT_SERVICE_CAPABILITY_NOT_INCLUDED",
      reason: "当前试用不包含此功能",
    });
  });

  test("treats an expired effective trial as service blocked before locked legacy", async () => {
    const { TenantServiceAccessService } = await import("./tenant-service-access");
    const service = new TenantServiceAccessService({
      trialAccessEnabled: async () => true,
      repository: {
        getAccessFacts: mock(async () => ({
          ...baseFacts,
          currentTrial: null,
        })),
      },
    });

    expect(await service.resolveForRoute({
      tenantId: TENANT_ID,
      routeAccess: "read",
      requiredCapability: "core.projects",
    })).toMatchObject({
      mode: "service_blocked",
      allowed: false,
      errorCode: "TENANT_SERVICE_ACCESS_EXPIRED",
    });
  });

  test('ignores trial facts while the access rollout switch is closed', async () => {
    const { TenantServiceAccessService } = await import('./tenant-service-access');
    const service = new TenantServiceAccessService({
      trialAccessEnabled: async () => false,
      repository: {
        getAccessFacts: mock(async () => ({
          ...baseFacts,
          currentTrial: trialFact(),
        })),
      },
    });

    expect(await service.resolveForRoute({
      tenantId: TENANT_ID,
      routeAccess: 'read',
      requiredCapability: 'core.projects',
    })).toMatchObject({
      mode: 'service_blocked',
      allowed: false,
      errorCode: 'TENANT_SERVICE_ACCESS_EXPIRED',
    });
  });
});

describe("resolveTenantServiceRouteDecision", () => {
  test.each([
    ["paid", "read_write", ROUTE_ACCESSES, null],
    ["paid_onboarding", "read_write", ROUTE_ACCESSES, null],
    ["trial", "read_write", ROUTE_ACCESSES, null],
    ["legacy", "read_write", ROUTE_ACCESSES, null],
    [
      "grace",
      "read_only",
      ["session", "recovery", "read", "public_or_callback"],
      "TENANT_SERVICE_READ_ONLY",
    ],
    [
      "service_blocked",
      "none",
      ["session", "recovery", "public_or_callback"],
      "TENANT_SERVICE_ACCESS_EXPIRED",
    ],
    [
      "hard_blocked",
      "none",
      ["session", "public_or_callback"],
      "TENANT_SERVICE_HARD_BLOCKED",
    ],
  ] as const)(
    "%s keeps the complete route matrix stable",
    async (mode, accessLevel, allowedRoutes, deniedErrorCode) => {
      const { resolveTenantServiceRouteDecision } =
        await import("./tenant-service-access");
      const allowedRouteSet = new Set<string>(allowedRoutes);

      for (const routeAccess of ROUTE_ACCESSES) {
        const allowed = allowedRouteSet.has(routeAccess);
        const expectedReason = allowed
          ? null
          : mode === "grace"
          ? "当前服务处于只读宽限期"
          : mode === "hard_blocked"
          ? "租户状态不可用"
          : "租户服务访问已到期";

        expect(resolveTenantServiceRouteDecision({
          mode,
          routeAccess,
          requiredCapability: "core.projects",
          capabilities: ["core.projects"],
          startsAt: DECISION_STARTS_AT,
          endsAt: DECISION_ENDS_AT,
        })).toEqual({
          mode,
          accessLevel,
          allowed,
          errorCode: allowed ? null : deniedErrorCode,
          reason: expectedReason,
          startsAt: DECISION_STARTS_AT,
          endsAt: DECISION_ENDS_AT,
        });
      }
    },
  );
});

function trialFact(overrides: Record<string, unknown> = {}) {
  return {
    id: "20000000-0000-4000-8000-000000000001",
    tenant_id: TENANT_ID,
    source: "tenant_application" as const,
    status: "active" as const,
    starts_at: "2026-08-01T00:00:00.000Z",
    trial_ends_at: "2026-09-01T00:00:00.000Z",
    grace_ends_at: "2026-09-08T00:00:00.000Z",
    scope_snapshot: {
      version: 1 as const,
      capabilities: ["core.projects" as const],
    },
    ...overrides,
  };
}
