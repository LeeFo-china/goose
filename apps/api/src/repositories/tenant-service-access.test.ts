import { describe, expect, mock, test } from "bun:test";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

const TENANT_ID = "10000000-0000-4000-8000-000000000001";
const TRIAL_ID = "20000000-0000-4000-8000-000000000001";
const NOW = "2026-08-10T08:00:00.000Z";

function envelope(patch: Record<string, unknown> = {}) {
  return {
    server_time: NOW,
    tenant_id: TENANT_ID,
    tenant_status: "active",
    contract: null,
    paid_onboarding_order: null,
    legacy_subscription_status: "locked",
    current_trial: {
      id: TRIAL_ID,
      tenant_id: TENANT_ID,
      source: "tenant_application",
      status: "active",
      starts_at: "2026-08-10T08:00:00.000Z",
      trial_ends_at: "2026-09-01T00:00:00.000Z",
      grace_ends_at: "2026-09-08T00:00:00.000Z",
      scope_snapshot: { version: 1, capabilities: ["core.projects"] },
    },
    latest_trial: {
      id: TRIAL_ID,
      tenant_id: TENANT_ID,
      status: "active",
      starts_at: "2026-08-10T08:00:00.000Z",
      trial_ends_at: "2026-09-01T00:00:00.000Z",
      grace_ends_at: "2026-09-08T00:00:00.000Z",
    },
    ...patch,
  };
}

function repositoryWith(result: { data: unknown; error: unknown }) {
  const rpc = mock(async (
    _name: string,
    _params: Record<string, unknown>,
  ) => result);
  return import("./tenant-service-access").then(
    ({ TenantServiceAccessRepository }) => ({
      repository: new TenantServiceAccessRepository(() => ({ rpc })),
      rpc,
    }),
  );
}

describe("TenantServiceAccessRepository", () => {
  test("loads one strictly bound atomic snapshot using the database clock", async () => {
    const data = envelope({
      contract: {
        id: "30000000-0000-4000-8000-000000000001",
        service_start_at: "2026-08-01T00:00:00.000Z",
        service_end_at: "2027-08-01T00:00:00.000Z",
      },
      paid_onboarding_order: {
        id: "40000000-0000-4000-8000-000000000001",
        paid_at: "2026-08-09T00:00:00.000Z",
      },
    });
    const { repository, rpc } = await repositoryWith({ data, error: null });

    const facts = await repository.getAccessFacts({ tenantId: TENANT_ID });
    expect(facts).toEqual({
        evaluatedAt: NOW,
        tenantStatus: "active",
        contract: data.contract,
        paidOnboardingOrder: data.paid_onboarding_order,
        legacySubscriptionStatus: "locked",
        currentTrial: expect.objectContaining({
          id: TRIAL_ID,
          tenant_id: TENANT_ID,
          source: "tenant_application",
          status: "active",
        }),
        latestTrial: expect.objectContaining({
          id: TRIAL_ID,
          tenant_id: TENANT_ID,
          status: "active",
        }),
    });
    expect(rpc).toHaveBeenCalledWith("platform_service_trial_access_facts", {
      p_tenant_id: TENANT_ID,
    });
    expect(rpc.mock.calls[0]?.[1]).not.toHaveProperty("p_now");
  });

  test.each([
    {
      name: "active at starts_at",
      server_time: "2026-08-10T08:00:00.000Z",
      status: "active",
    },
    {
      name: "active immediately before trial_ends_at",
      server_time: "2026-08-31T23:59:59.999Z",
      status: "active",
    },
    {
      name: "grace at trial_ends_at",
      server_time: "2026-09-01T00:00:00.000Z",
      status: "grace_period",
    },
    {
      name: "grace immediately before grace_ends_at",
      server_time: "2026-09-07T23:59:59.999Z",
      status: "grace_period",
    },
  ])("accepts the database effective boundary: $name", async (entry) => {
    const current = envelope().current_trial;
    const { repository } = await repositoryWith({
      data: envelope({
        server_time: entry.server_time,
        current_trial: { ...current, status: entry.status },
        latest_trial: { ...envelope().latest_trial, status: entry.status },
      }),
      error: null,
    });
    await expect(repository.getAccessFacts({ tenantId: TENANT_ID })).resolves
      .toMatchObject({ currentTrial: { status: entry.status } });
  });

  test.each([
    {
      server_time: "2026-09-01T00:00:00.000Z",
      trial: { status: "active" },
    },
    {
      server_time: "2026-08-31T23:59:59.999Z",
      trial: { status: "grace_period" },
    },
    {
      server_time: "2026-09-08T00:00:00.000Z",
      trial: { status: "grace_period" },
    },
    { server_time: NOW, trial: { tenant_id: TRIAL_ID } },
    { server_time: NOW, trial: { source: "SENSITIVE_INVALID_SOURCE" } },
  ])("fails closed for malformed or clock-inconsistent facts %#", async (entry) => {
    const current = envelope().current_trial;
    const { repository } = await repositoryWith({
      data: envelope({
        server_time: entry.server_time,
        current_trial: { ...current, ...entry.trial },
      }),
      error: null,
    });
    const caught = await repository.getAccessFacts({ tenantId: TENANT_ID })
      .catch((error: unknown) => error);
    expect(caught).toMatchObject({ statusCode: 500, code: "DB_ERROR" });
    expect(JSON.stringify(caught)).not.toContain("SENSITIVE_INVALID_SOURCE");
  });

  test("fails closed when the snapshot is bound to another tenant", async () => {
    const { repository } = await repositoryWith({
      data: envelope({ tenant_id: TRIAL_ID, current_trial: null }),
      error: null,
    });
    await expect(repository.getAccessFacts({ tenantId: TENANT_ID })).rejects
      .toMatchObject({ statusCode: 500, code: "DB_ERROR" });
  });

  test("accepts no effective trial at any database timestamp", async () => {
    const { repository } = await repositoryWith({
      data: envelope({
        server_time: "2099-01-01T00:00:00.000Z",
        current_trial: null,
        latest_trial: { ...envelope().latest_trial, status: "expired" },
      }),
      error: null,
    });
    await expect(repository.getAccessFacts({ tenantId: TENANT_ID })).resolves
      .toMatchObject({ currentTrial: null });
  });

  test.each([
    { status: "pending_review", startsAt: null, trialEndsAt: null, graceEndsAt: null },
    {
      status: "scheduled",
      startsAt: "2026-08-20T00:00:00.000Z",
      trialEndsAt: "2026-09-20T00:00:00.000Z",
      graceEndsAt: "2026-09-27T00:00:00.000Z",
    },
    {
      status: "expired",
      startsAt: "2026-07-01T00:00:00.000Z",
      trialEndsAt: "2026-07-31T00:00:00.000Z",
      graceEndsAt: "2026-08-07T00:00:00.000Z",
    },
    {
      status: "converted",
      startsAt: "2026-07-01T00:00:00.000Z",
      trialEndsAt: "2026-07-31T00:00:00.000Z",
      graceEndsAt: "2026-08-07T00:00:00.000Z",
    },
  ])("strictly parses the latest $status trial", async ({
    status, startsAt, trialEndsAt, graceEndsAt,
  }) => {
    const { repository } = await repositoryWith({
      data: envelope({
        current_trial: null,
        latest_trial: {
          id: TRIAL_ID,
          tenant_id: TENANT_ID,
          status,
          starts_at: startsAt,
          trial_ends_at: trialEndsAt,
          grace_ends_at: graceEndsAt,
        },
      }),
      error: null,
    });

    await expect(repository.getAccessFacts({ tenantId: TENANT_ID })).resolves
      .toMatchObject({ latestTrial: { id: TRIAL_ID, status } });
  });

  test("normalizes an old access envelope without latest_trial", async () => {
    const legacyEnvelope = envelope();
    delete (legacyEnvelope as { latest_trial?: unknown }).latest_trial;
    const { repository } = await repositoryWith({
      data: legacyEnvelope,
      error: null,
    });

    await expect(repository.getAccessFacts({ tenantId: TENANT_ID })).resolves
      .toMatchObject({ latestTrial: null });
  });

  test.each([
    { tenant_id: TRIAL_ID },
    { status: "scheduled", starts_at: null },
    { status: "pending_review", starts_at: NOW },
    { status: "SENSITIVE_INVALID_STATUS" },
  ])("fails closed for malformed latest trial facts %#", async (patch) => {
    const latest = envelope().latest_trial;
    const { repository } = await repositoryWith({
      data: envelope({
        current_trial: null,
        latest_trial: { ...latest, ...patch },
      }),
      error: null,
    });
    const caught = await repository.getAccessFacts({ tenantId: TENANT_ID })
      .catch((error: unknown) => error);
    expect(caught).toMatchObject({ statusCode: 500, code: "DB_ERROR" });
    expect(JSON.stringify(caught)).not.toContain("SENSITIVE_INVALID_STATUS");
  });

  test("fails closed for a time-inconsistent latest effective status", async () => {
    const { repository } = await repositoryWith({
      data: envelope({
        current_trial: null,
        latest_trial: {
          ...envelope().latest_trial,
          status: "scheduled",
          starts_at: "2026-07-01T00:00:00.000Z",
          trial_ends_at: "2026-07-31T00:00:00.000Z",
          grace_ends_at: "2026-08-07T00:00:00.000Z",
        },
      }),
      error: null,
    });

    await expect(repository.getAccessFacts({ tenantId: TENANT_ID })).rejects
      .toMatchObject({ statusCode: 500, code: "DB_ERROR" });
  });

  test.each([
    { data: null, error: { message: "SENSITIVE_RESOLVED" } },
    { data: { leak: "SENSITIVE_MALFORMED" }, error: null },
  ])("does not expose RPC failure details %#", async (result) => {
    const { repository } = await repositoryWith(result);
    const caught = await repository.getAccessFacts({ tenantId: TENANT_ID })
      .catch((error: unknown) => error);
    expect(caught).toMatchObject({ statusCode: 500, code: "DB_ERROR" });
    expect(JSON.stringify(caught)).not.toContain("SENSITIVE");
  });

  test("does not expose rejected RPC failures", async () => {
    const { TenantServiceAccessRepository } = await import("./tenant-service-access");
    const repository = new TenantServiceAccessRepository(() => ({
      rpc: mock(async () => {
        throw { message: "SENSITIVE_REJECTION" };
      }),
    }));
    const caught = await repository.getAccessFacts({ tenantId: TENANT_ID })
      .catch((error: unknown) => error);
    expect(caught).toMatchObject({ statusCode: 500, code: "DB_ERROR" });
    expect(JSON.stringify(caught)).not.toContain("SENSITIVE_REJECTION");
  });
});
