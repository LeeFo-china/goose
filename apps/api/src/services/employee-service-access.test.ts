import { describe, expect, mock, test } from "bun:test";

import { EmployeeServiceAccessSummarySchema } from "@gooes/domain";
import type { TenantServiceAccessFacts } from "@/repositories/tenant-service-access";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

const TENANT_ID = "10000000-0000-4000-8000-000000000001";
const TRIAL_ID = "20000000-0000-4000-8000-000000000001";
const NOW = "2026-08-12T08:00:00.000Z";

const baseFacts: TenantServiceAccessFacts = {
  evaluatedAt: NOW,
  tenantStatus: "active",
  contract: null,
  paidOnboardingOrder: null,
  legacySubscriptionStatus: "locked",
  currentTrial: null,
  latestTrial: null,
};

describe("EmployeeServiceAccessService", () => {
  test.each([
    {
      name: "pending application waits for platform review",
      facts: latestTrial("pending_review"),
      expected: {
        access_status: "pending_review",
        can_enter_workspace: false,
        readonly: false,
        primary_action: "view_trial",
      },
    },
    {
      name: "scheduled trial waits for DB start time",
      facts: latestTrial("scheduled"),
      expected: {
        access_status: "scheduled",
        can_enter_workspace: false,
        readonly: false,
        primary_action: "view_trial",
      },
    },
    {
      name: "active trial enters the workspace",
      facts: {
        ...latestTrial("active"),
        currentTrial: currentTrial("active"),
      },
      expected: {
        access_status: "workspace_available",
        can_enter_workspace: true,
        readonly: false,
        primary_action: "enter_workspace",
      },
    },
    {
      name: "grace requires explicit read-only entry",
      facts: {
        ...latestTrial("grace_period"),
        currentTrial: currentTrial("grace_period"),
      },
      expected: {
        access_status: "grace_period",
        can_enter_workspace: true,
        readonly: true,
        primary_action: "enter_readonly_workspace",
      },
    },
    {
      name: "expired trial leads to formal purchase",
      facts: latestTrial("expired"),
      expected: {
        access_status: "expired",
        can_enter_workspace: false,
        readonly: false,
        primary_action: "purchase_service",
      },
    },
    {
      name: "tenant hard block cannot be bypassed by a paid contract",
      facts: {
        ...baseFacts,
        tenantStatus: "suspended",
        contract: contractFact(),
        latestTrial: latestTrial("converted").latestTrial,
      },
      expected: {
        access_status: "hard_blocked",
        can_enter_workspace: false,
        readonly: false,
        primary_action: "contact_platform",
      },
    },
    {
      name: "formal service wins over converted trial history",
      facts: {
        ...latestTrial("converted"),
        contract: contractFact(),
      },
      expected: {
        access_status: "workspace_available",
        can_enter_workspace: true,
        readonly: false,
        primary_action: "enter_workspace",
      },
    },
  ])("projects $name", async ({ facts, expected }) => {
    const { EmployeeServiceAccessService } = await import(
      "./employee-service-access"
    );
    const getAccessFacts = mock(async () => facts);
    const service = new EmployeeServiceAccessService({
      repository: { getAccessFacts },
      trialAccessEnabled: async () => true,
      trialApplicationEnabled: async () => true,
    });

    const result = await service.resolve({
      tenantId: TENANT_ID,
      permissionCodes: ["billing.service_trial.apply"],
    });

    expect(result).toMatchObject({
      access_status: expected.access_status,
      can_enter_workspace: expected.can_enter_workspace,
      readonly: expected.readonly,
      trial_id: facts.latestTrial?.id ?? null,
      trial_status: facts.latestTrial?.status ?? null,
      evaluated_at: NOW,
    });
    expect(result.primary_action?.key).toBe(expected.primary_action);
    expect(EmployeeServiceAccessSummarySchema.safeParse(result).success).toBe(true);
    expect(getAccessFacts).toHaveBeenCalledTimes(1);
  });

  test("offers application only when rollout and permission both allow it", async () => {
    const { EmployeeServiceAccessService } = await import(
      "./employee-service-access"
    );
    const trialApplicationEnabled = mock(async () => true);
    const service = new EmployeeServiceAccessService({
      repository: { getAccessFacts: async () => baseFacts },
      trialAccessEnabled: async () => true,
      trialApplicationEnabled,
    });

    const allowed = await service.resolve({
      tenantId: TENANT_ID,
      permissionCodes: ["billing.service_trial.apply"],
    });
    const denied = await service.resolve({
      tenantId: TENANT_ID,
      permissionCodes: [],
    });

    expect(allowed.primary_action?.key).toBe("apply_trial");
    expect(denied.primary_action?.key).toBe("purchase_service");
    expect(trialApplicationEnabled).toHaveBeenCalledTimes(1);
  });

  test("allows a permitted employee to reapply after a rejected trial", async () => {
    const { EmployeeServiceAccessService } = await import(
      "./employee-service-access"
    );
    const service = new EmployeeServiceAccessService({
      repository: { getAccessFacts: async () => latestTrial("rejected") },
      trialAccessEnabled: async () => false,
      trialApplicationEnabled: async () => true,
    });

    const result = await service.resolve({
      tenantId: TENANT_ID,
      permissionCodes: ["billing.service_trial.apply"],
    });

    expect(result.primary_action?.key).toBe("apply_trial");
  });

  test("does not let a disabled trial rollout open the workspace", async () => {
    const { EmployeeServiceAccessService } = await import(
      "./employee-service-access"
    );
    const service = new EmployeeServiceAccessService({
      repository: {
        getAccessFacts: async () => ({
          ...latestTrial("active"),
          currentTrial: currentTrial("active"),
        }),
      },
      trialAccessEnabled: async () => false,
      trialApplicationEnabled: async () => false,
    });

    const result = await service.resolve({
      tenantId: TENANT_ID,
      permissionCodes: ["billing.service_trial.apply"],
    });

    expect(result.access_status).toBe("service_blocked");
    expect(result.can_enter_workspace).toBe(false);
    expect(result.trial_status).toBe("active");
  });
});

function latestTrial(
  status: NonNullable<TenantServiceAccessFacts["latestTrial"]>["status"],
): TenantServiceAccessFacts {
  const withoutTimes = ["pending_review", "rejected", "withdrawn"]
    .includes(status);
  const times = latestTrialTimes(status);
  return {
    ...baseFacts,
    latestTrial: {
      id: TRIAL_ID,
      tenant_id: TENANT_ID,
      status,
      starts_at: withoutTimes ? null : times.startsAt,
      trial_ends_at: withoutTimes ? null : times.trialEndsAt,
      grace_ends_at: withoutTimes ? null : times.graceEndsAt,
    },
  };
}

function currentTrial(
  status: "active" | "grace_period",
): NonNullable<TenantServiceAccessFacts["currentTrial"]> {
  const times = latestTrialTimes(status);
  return {
    id: TRIAL_ID,
    tenant_id: TENANT_ID,
    source: "tenant_application" as const,
    status,
    starts_at: times.startsAt,
    trial_ends_at: times.trialEndsAt,
    grace_ends_at: times.graceEndsAt,
    scope_snapshot: { version: 1 as const, capabilities: ["core.employees"] },
  };
}

function latestTrialTimes(
  status: NonNullable<TenantServiceAccessFacts["latestTrial"]>["status"],
) {
  if (status === "scheduled") return {
    startsAt: "2026-08-20T00:00:00.000Z",
    trialEndsAt: "2026-09-20T00:00:00.000Z",
    graceEndsAt: "2026-09-27T00:00:00.000Z",
  };
  if (status === "active") return {
    startsAt: "2026-08-01T00:00:00.000Z",
    trialEndsAt: "2026-09-01T00:00:00.000Z",
    graceEndsAt: "2026-09-08T00:00:00.000Z",
  };
  if (status === "grace_period") return {
    startsAt: "2026-07-01T00:00:00.000Z",
    trialEndsAt: "2026-08-10T00:00:00.000Z",
    graceEndsAt: "2026-08-20T00:00:00.000Z",
  };
  return {
    startsAt: "2026-07-01T00:00:00.000Z",
    trialEndsAt: "2026-08-01T00:00:00.000Z",
    graceEndsAt: "2026-08-10T00:00:00.000Z",
  };
}

function contractFact() {
  return {
    id: "30000000-0000-4000-8000-000000000001",
    service_start_at: "2026-08-01T00:00:00.000Z",
    service_end_at: "2027-08-01T00:00:00.000Z",
  };
}
