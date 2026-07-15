import { describe, expect, mock, test } from "bun:test";

import type {
  TenantOnboardingPartnerAssistRepositoryPort,
  TenantOnboardingPartnerAssistTaskRecord,
} from "@/repositories/tenant-onboarding-partner-assist";
import type { JwtPayload } from "@/utils/jwt";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

const PARTNER_ID = "00000000-0000-4000-8000-000000000201";
const MEMBER_ID = "00000000-0000-4000-8000-000000000301";
const APPLICATION_ID = "00000000-0000-4000-8000-000000000501";
const NOW = "2026-07-14T12:00:00.000Z";

const partnerUser = {
  sub: "00000000-0000-4000-8000-000000000401",
  token_type: "platform_partner",
  roles: ["platform_partner"],
  partner_id: PARTNER_ID,
} satisfies JwtPayload;

const task = {
  id: APPLICATION_ID,
  company_name: "信阳安心装饰有限公司",
  admin_phone: "13912349000",
  address_city: "信阳市",
  address_district: "浉河区",
  service_region_codes: ["411502"],
  partner_assist_status: "pending",
  partner_assist_requested_at: "2026-07-12T12:00:00.000Z",
  partner_assist_due_at: NOW,
  version: 3,
  created_at: "2026-07-12T11:00:00.000Z",
  updated_at: "2026-07-12T12:00:00.000Z",
} satisfies TenantOnboardingPartnerAssistTaskRecord;

function repository(
  overrides: Partial<TenantOnboardingPartnerAssistRepositoryPort> = {},
): TenantOnboardingPartnerAssistRepositoryPort {
  return {
    expireDuePartnerAssistTasks: mock(async () => []),
    listPartnerAssistTasks: mock(async (input) => ({
      list: [task],
      pagination: {
        page: input.page,
        pageSize: input.pageSize,
        total: 1,
        totalPages: 1,
      },
    })),
    findPartnerAssistTask: mock(async () => task),
    submitPartnerAssist: mock(async () => ({
      status: "updated" as const,
      task: { ...task, partner_assist_status: "verified" as const, version: 4 },
    })),
    ...overrides,
  };
}

async function createService(
  repositoryPort: TenantOnboardingPartnerAssistRepositoryPort,
) {
  const { TenantOnboardingPartnerAssistService } = await import(
    "./tenant-onboarding-partner-assist"
  );
  return new TenantOnboardingPartnerAssistService({
    repository: repositoryPort,
    identityResolver: async () => ({
      userId: partnerUser.sub!,
      partnerId: PARTNER_ID,
      memberId: MEMBER_ID,
    }),
    clock: () => new Date(NOW),
  });
}

describe("TenantOnboardingPartnerAssistService", () => {
  test("requires a platform-partner token before repository access", async () => {
    const repositoryPort = repository();
    const { TenantOnboardingPartnerAssistService } = await import(
      "./tenant-onboarding-partner-assist"
    );
    const service = new TenantOnboardingPartnerAssistService({
      repository: repositoryPort,
      clock: () => new Date(NOW),
    });

    await expect(service.list(undefined, { page: 1, pageSize: 20 }))
      .rejects.toMatchObject({
        statusCode: 403,
        code: "PARTNER_AUTH_REQUIRED",
      });
    expect(repositoryPort.listPartnerAssistTasks).not.toHaveBeenCalled();
  });

  test("expires due work before a bounded partner-scoped queue read", async () => {
    const calls: string[] = [];
    const repositoryPort = repository({
      expireDuePartnerAssistTasks: mock(async (input) => {
        calls.push(`expire:${input.partnerId}:${input.cutoff}`);
        return [];
      }),
      listPartnerAssistTasks: mock(async (input) => {
        calls.push(
          `list:${input.partnerId}:${input.page}:${input.pageSize}:${input.cutoff}`,
        );
        return {
          list: [task],
          pagination: { page: input.page, pageSize: input.pageSize, total: 1, totalPages: 1 },
        };
      }),
    });
    const service = await createService(repositoryPort);

    const result = await service.list(partnerUser, {
      page: 2,
      pageSize: 500,
      status: "pending",
    });

    expect(calls).toEqual([
      `expire:${PARTNER_ID}:${NOW}`,
      `list:${PARTNER_ID}:2:100:${NOW}`,
    ]);
    expect(result.pagination).toMatchObject({ page: 2, pageSize: 100 });
  });

  test("returns only task metadata and a masked contact phone", async () => {
    const service = await createService(repository());

    const result = await service.list(partnerUser, { page: 1, pageSize: 20 });

    expect(result.list[0]).toEqual({
      ...task,
      admin_phone: "139****9000",
    });
    const response = JSON.stringify(result);
    for (const forbidden of [
      "business_license_file_id",
      "license_url",
      "unified_social_credit_code",
      "address_latitude",
      "address_longitude",
      "privacy_policy_version",
      "onboarding_terms_version",
      "consented_at",
      '"address":',
    ]) {
      expect(response).not.toContain(forbidden);
    }
  });

  test("expires due work before a partner-scoped detail read", async () => {
    const calls: string[] = [];
    const repositoryPort = repository({
      expireDuePartnerAssistTasks: mock(async () => {
        calls.push("expire");
        return [];
      }),
      findPartnerAssistTask: mock(async (input) => {
        calls.push(`${input.partnerId}:${input.applicationId}:${input.cutoff}`);
        return task;
      }),
    });
    const service = await createService(repositoryPort);

    const result = await service.get(partnerUser, APPLICATION_ID);

    expect(calls).toEqual([
      "expire",
      `${PARTNER_ID}:${APPLICATION_ID}:${NOW}`,
    ]);
    expect(result.admin_phone).toBe("139****9000");
  });

  test("does not disclose tasks assigned to another partner", async () => {
    const service = await createService(repository({
      findPartnerAssistTask: mock(async () => null),
    }));

    await expect(service.get(partnerUser, APPLICATION_ID)).rejects.toMatchObject({
      statusCode: 404,
      code: "TENANT_ONBOARDING_APPLICATION_NOT_FOUND",
    });
  });

  test("submits only the scoped assist decision and partner-member actor", async () => {
    const repositoryPort = repository();
    const service = await createService(repositoryPort);

    const result = await service.review(partnerUser, APPLICATION_ID, {
      version: 3,
      decision: "verified",
      remark: "企业信息与服务范围属实",
    });

    expect(repositoryPort.submitPartnerAssist).toHaveBeenCalledWith({
      applicationId: APPLICATION_ID,
      partnerId: PARTNER_ID,
      memberId: MEMBER_ID,
      decision: "verified",
      remark: "企业信息与服务范围属实",
      expectedVersion: 3,
      now: NOW,
    });
    expect(result.partner_assist_status).toBe("verified");
    expect(result.admin_phone).toBe("139****9000");
  });

  test("maps final, expired, non-pending, and stale writes to state conflict", async () => {
    for (const status of ["state_conflict", "version_conflict"] as const) {
      const service = await createService(repository({
        submitPartnerAssist: mock(async () => ({ status })),
      }));

      await expect(service.review(partnerUser, APPLICATION_ID, {
        version: 3,
        decision: "not_recommended",
      })).rejects.toMatchObject({
        statusCode: 409,
        code: "TENANT_ONBOARDING_STATE_CONFLICT",
      });
    }
  });

  test("expires at the cutoff before review so the task cannot be decided", async () => {
    const calls: string[] = [];
    const repositoryPort = repository({
      expireDuePartnerAssistTasks: mock(async () => {
        calls.push("expire");
        return [APPLICATION_ID];
      }),
      submitPartnerAssist: mock(async () => {
        calls.push("submit");
        return { status: "state_conflict" as const };
      }),
    });
    const service = await createService(repositoryPort);

    await expect(service.review(partnerUser, APPLICATION_ID, {
      version: 3,
      decision: "supplement_suggested",
    })).rejects.toMatchObject({
      code: "TENANT_ONBOARDING_STATE_CONFLICT",
    });
    expect(calls).toEqual(["expire"]);
  });
});
