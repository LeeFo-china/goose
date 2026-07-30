import { beforeEach, describe, expect, mock, test } from "bun:test";
import type { PlatformPartnerRecord } from "@/repositories/platform-partners";
import type { AuthContext } from "@/services/authorization";
import { PlatformPartnerRegionManagementService } from "./platform-partner-region-management";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

const platformAuthContext = {
  authUserId: "auth-platform",
  employeeId: "employee-platform",
  tenantId: null,
  tenantName: null,
  tenantSlug: null,
  tenantStatus: null,
  isPlatformAdmin: true,
  employeeName: "平台超管",
  employeeStatus: "active",
  departmentId: null,
  tenantDepartmentId: null,
  departmentCode: null,
  departmentName: null,
  postId: null,
  postName: null,
  avatar: null,
  roleCodes: ["platform_admin"],
  roles: [],
  permissions: [{ code: "platform.partner.manage", scope: "all" }],
} satisfies AuthContext;

const partner = {
  id: "00000000-0000-4000-8000-000000000201",
  name: "信阳城市合伙人",
  subject_type: "company",
  contact_name: "张三",
  phone: "13800138000",
  status: "active",
  level_id: "00000000-0000-4000-8000-000000000101",
  region_codes: ["411500"],
  region_version: 1,
  contract_status: "signed",
  settlement_account_status: "valid",
  settlement_account: {},
  remark: null,
  created_by_employee_id: "employee-platform",
  updated_by_employee_id: "employee-platform",
  created_at: "2026-07-04T10:00:00.000Z",
  updated_at: "2026-07-04T10:00:00.000Z",
} satisfies PlatformPartnerRecord;

const updatePartnerRegions = mock(
  async (): Promise<PlatformPartnerRecord | null> => ({
    ...partner,
    region_codes: ["411502"],
    region_version: 2,
  }),
);
const repository = {
  findPartnerById: mock(async () => partner),
  updatePartnerRegions,
  listTenantBindings: mock(async () => null),
  createTenantBinding: mock(async () => null),
};
const regionPolicy = {
  assertAssignableDistricts: mock(async () => ["411502"]),
};
const audit = {
  recordBestEffort: mock(async () => null),
};

function createService() {
  return new PlatformPartnerRegionManagementService({
    repository,
    regionPolicy,
    audit,
  });
}

describe("PlatformPartnerRegionManagementService", () => {
  beforeEach(() => {
    for (const fn of Object.values(repository)) fn.mockClear();
    regionPolicy.assertAssignableDistricts.mockClear();
    audit.recordBestEffort.mockClear();
    updatePartnerRegions.mockImplementation(async () => ({
      ...partner,
      region_codes: ["411502"],
      region_version: 2,
    }));
  });

  test("updates districts with optimistic version and audit snapshot", async () => {
    const result = await createService().update(
      platformAuthContext,
      partner.id,
      {
        region_codes: ["411502"],
        change_reason: "调整为实际运营区县",
        expected_version: 1,
      },
    );

    expect(regionPolicy.assertAssignableDistricts).toHaveBeenCalledWith(
      ["411502"],
      { excludePartnerId: partner.id },
    );
    expect(updatePartnerRegions).toHaveBeenCalledWith(partner.id, {
      region_codes: ["411502"],
      expected_version: 1,
      updated_by_employee_id: "employee-platform",
    });
    expect(audit.recordBestEffort).toHaveBeenCalledWith({
      action: "platform_partner_regions_update",
      actorEmployeeId: "employee-platform",
      actorUserId: "auth-platform",
      resourceType: "platform_partner",
      resourceId: partner.id,
      resourceLabel: partner.name,
      summary: "调整城市合伙人「信阳城市合伙人」运营区县",
      metadata: {
        reason: "调整为实际运营区县",
        previous_region_codes: ["411500"],
        current_region_codes: ["411502"],
        previous_version: 1,
        current_version: 2,
      },
    });
    expect(result.region_codes).toEqual(["411502"]);
    expect(repository.listTenantBindings).not.toHaveBeenCalled();
    expect(repository.createTenantBinding).not.toHaveBeenCalled();
  });

  test("rejects stale version without writing an audit record", async () => {
    updatePartnerRegions.mockImplementationOnce(async () => null);

    await expect(
      createService().update(platformAuthContext, partner.id, {
        region_codes: ["411502"],
        change_reason: "调整为实际运营区县",
        expected_version: 1,
      }),
    ).rejects.toMatchObject({
      statusCode: 409,
      code: "PLATFORM_PARTNER_REGION_VERSION_CONFLICT",
    });
    expect(audit.recordBestEffort).not.toHaveBeenCalled();
  });
});
