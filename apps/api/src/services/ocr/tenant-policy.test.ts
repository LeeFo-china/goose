import { describe, expect, mock, test } from "bun:test";

import type { OcrTenantPolicyRecord } from "@/repositories/ocr-tenant-policies";
import type { AuthContext } from "@/services/authorization";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

const platformAuth = {
  authUserId: "auth-user-1",
  employeeId: "employee-1",
  isPlatformAdmin: true,
  permissions: [
    { code: "platform.ocr.recognition.read", scope: "all" },
    { code: "platform.ocr.tenant_policy.manage", scope: "all" },
  ],
} as AuthContext;

function policy(
  overrides: Partial<OcrTenantPolicyRecord> = {},
): OcrTenantPolicyRecord {
  return {
    tenant_id: "tenant-1",
    enabled: true,
    allowed_document_types: ["business_license", "bank_card"],
    daily_limit: null,
    remark: null,
    enabled_at: "2026-07-23T01:00:00.000Z",
    updated_by_employee_id: "employee-0",
    created_at: "2026-07-23T01:00:00.000Z",
    updated_at: "2026-07-23T01:00:00.000Z",
    ...overrides,
  };
}

async function createHarness(currentPolicy: ReturnType<typeof policy> | null = null) {
  const { OcrTenantPolicyService } = await import("./tenant-policy");
  const saved = policy({
    updated_by_employee_id: "employee-1",
    updated_at: "2026-07-23T02:00:00.000Z",
  });
  const repository = {
    findByTenantId: mock(async () => currentPolicy),
    findTenantById: mock(
      async (): Promise<{ id: string; name: string; status: string } | null> => ({
        id: "tenant-1",
        name: "测试租户",
        status: "active",
      }),
    ),
    listPlatform: mock(async () => ({
      list: [],
      pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 },
    })),
    upsert: mock(async () => saved),
  };
  const audit = { recordBestEffort: mock(async () => null) };
  const accessPolicy = {
    hasPermission: mock((context: AuthContext, code: string) =>
      context.permissions.some((item) => item.code === code)),
  };
  return {
    service: new OcrTenantPolicyService({
      repository,
      audit,
      accessPolicy,
      nowFactory: () => new Date("2026-07-23T02:00:00.000Z"),
    }),
    repository,
    audit,
  };
}

describe("OcrTenantPolicyService", () => {
  test("denies a tenant without a rollout policy", async () => {
    const { service } = await createHarness(null);

    expect(await service.getRuntimePolicy("tenant-1", 100)).toEqual({
      enabled: false,
      allowedDocumentTypes: [],
      dailyLimit: 100,
    });
  });

  test("normalizes an enabled policy and falls back to the platform quota", async () => {
    const { service } = await createHarness(policy());

    expect(await service.getRuntimePolicy("tenant-1", 80)).toEqual({
      enabled: true,
      allowedDocumentTypes: ["business_license", "bank_card"],
      dailyLimit: 80,
    });
  });

  test("uses the tenant quota override", async () => {
    const { service } = await createHarness(policy({ daily_limit: 15 }));

    expect((await service.getRuntimePolicy("tenant-1", 80)).dailyLimit).toBe(15);
  });

  test("requires platform read permission for the paginated list", async () => {
    const { service, repository } = await createHarness();
    const forbidden = {
      ...platformAuth,
      permissions: [],
    } as AuthContext;

    await expect(service.listPlatform(forbidden, { page: 1, pageSize: 20 }))
      .rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(repository.listPlatform).not.toHaveBeenCalled();
  });

  test("upserts a policy with platform manage permission and writes an audit", async () => {
    const { service, repository, audit } = await createHarness(null);

    const result = await service.updatePlatform(platformAuth, "tenant-1", {
      enabled: true,
      allowed_document_types: ["business_license", "bank_card"],
      daily_limit: 20,
      remark: "首批灰度",
    });

    expect(result).toMatchObject({
      tenant_id: "tenant-1",
      tenant_name: "测试租户",
      enabled: true,
    });
    expect(repository.upsert).toHaveBeenCalledWith(expect.objectContaining({
      tenantId: "tenant-1",
      enabledAt: "2026-07-23T02:00:00.000Z",
      updatedByEmployeeId: "employee-1",
    }));
    expect(audit.recordBestEffort).toHaveBeenCalledWith(expect.objectContaining({
      action: "platform_config_update",
      targetTenantId: "tenant-1",
      resourceType: "ocr_tenant_policy",
      resourceId: "tenant-1",
    }));
  });

  test("rejects a missing tenant before saving", async () => {
    const { service, repository } = await createHarness();
    repository.findTenantById.mockImplementation(async () => null);

    await expect(service.updatePlatform(platformAuth, "missing-tenant", {
      enabled: false,
      allowed_document_types: [],
      daily_limit: null,
      remark: null,
    })).rejects.toMatchObject({
      statusCode: 404,
      message: "租户不存在",
    });
    expect(repository.upsert).not.toHaveBeenCalled();
  });
});
