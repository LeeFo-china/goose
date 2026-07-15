import { beforeAll, beforeEach, describe, expect, mock, test } from "bun:test";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

const findPublicByToken = mock(async (_token: string) => activeRecord());
const findPublicById = mock(async (_id: string) => activeRecord());
const bindCustomer = mock(async () => {
  throw new Error("bindCustomer should not be called");
});

mock.module("@/repositories/tenant-share-links", () => ({
  tenantShareLinkRepository: {
    findPublicByToken,
    findPublicById,
    bindCustomer,
  },
}));

mock.module("@/services/access-policy", () => ({
  accessPolicyService: {
    assertTenantContext: mock(() => "tenant-1"),
  },
}));

mock.module("@/services/notifications", () => ({
  notificationService: {
    tryNotifyEmployeeShareCustomerBound: mock(async () => undefined),
  },
}));

let tenantShareLinkService: Awaited<
  typeof import("./tenant-share-links")
>["tenantShareLinkService"];

describe("TenantShareLinkService login attribution", () => {
  beforeAll(async () => {
    ({ tenantShareLinkService } = await import("./tenant-share-links"));
  });

  beforeEach(() => {
    findPublicByToken.mockImplementation(async () => activeRecord());
    findPublicById.mockImplementation(async () => activeRecord());
    bindCustomer.mockClear();
  });

  test("resolves active login context without binding a customer", async () => {
    await expect(tenantShareLinkService.resolveLoginContext("share-token"))
      .resolves.toEqual({
        shareLinkId: "share-link-1",
        tenantId: "tenant-1",
        shareEmployeeId: "employee-1",
        source: "project_share",
      });
    expect(findPublicByToken).toHaveBeenCalledWith("share-token");
    expect(bindCustomer).not.toHaveBeenCalled();
  });

  test("rejects expired links and disabled tenants as unavailable", async () => {
    findPublicByToken.mockImplementationOnce(async () => activeRecord({
      expires_at: "2026-07-14T10:00:00.000Z",
    }));
    await expect(tenantShareLinkService.resolveLoginContext("expired"))
      .rejects.toMatchObject({ code: "TENANT_SHARE_LINK_NOT_AVAILABLE" });

    findPublicByToken.mockImplementationOnce(async () => activeRecord({
      tenant: { id: "tenant-1", name: "装企", slug: "tenant", status: "disabled" },
    }));
    await expect(tenantShareLinkService.resolveLoginContext("disabled-tenant"))
      .rejects.toMatchObject({ code: "TENANT_SHARE_LINK_NOT_AVAILABLE" });
  });

  test("rejects mismatched trusted ID and token attribution", async () => {
    findPublicById.mockImplementationOnce(async () => activeRecord({ id: "share-link-1" }));
    findPublicByToken.mockImplementationOnce(async () => activeRecord({ id: "share-link-2" }));

    await expect(tenantShareLinkService.resolveAttribution({
      shareLinkId: "share-link-1",
      shareToken: "share-token-2",
    })).rejects.toMatchObject({
      statusCode: 409,
      code: "SHARE_CONTEXT_MISMATCH",
    });
  });

  test("resolves trusted attribution by ID without exposing the raw token", async () => {
    findPublicById.mockImplementationOnce(async () => activeRecord({
      token: "raw-token",
    }));

    await expect(tenantShareLinkService.resolveAttribution({
      shareLinkId: "share-link-1",
      shareToken: null,
    })).resolves.toEqual({
      shareLinkId: "share-link-1",
      tenantId: "tenant-1",
      shareEmployeeId: "employee-1",
      source: "project_share",
    });
  });
});

function activeRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: "share-link-1",
    tenant_id: "tenant-1",
    share_employee_id: "employee-1",
    source: "project_share",
    target_type: "project",
    target_id: "project-1",
    token: "share-token",
    status: "active",
    expires_at: "2026-07-16T10:00:00.000Z",
    metadata: {},
    use_count: 0,
    last_used_at: null,
    created_at: "2026-07-15T10:00:00.000Z",
    updated_at: "2026-07-15T10:00:00.000Z",
    tenant: { id: "tenant-1", name: "装企", slug: "tenant", status: "active" },
    share_employee: { id: "employee-1", name: "员工" },
    ...overrides,
  };
}
