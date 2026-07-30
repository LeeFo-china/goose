import { Errors } from "@/errors/error-factory";
import {
  platformPartnersRepository,
  type PlatformPartnerRegionsRecordInput,
} from "@/repositories/platform-partners";
import type { PlatformPartnerRegionsUpdateInput } from "@/schema/platform-partners";
import type { AuthContext } from "@/services/authorization";
import { platformAuditLogService } from "@/services/platform-audit-logs";
import { platformPartnerRegionPolicyService } from "@/services/platform-partner-regions";

type PlatformPartnerRegionManagementDependencies = {
  repository: Pick<
    typeof platformPartnersRepository,
    "findPartnerById"
  > & Partial<Pick<typeof platformPartnersRepository, "updatePartnerRegions">>;
  regionPolicy: Pick<
    typeof platformPartnerRegionPolicyService,
    "assertAssignableDistricts"
  >;
  audit?: Pick<typeof platformAuditLogService, "recordBestEffort">;
};

export class PlatformPartnerRegionManagementService {
  private readonly audit: NonNullable<
    PlatformPartnerRegionManagementDependencies["audit"]
  >;

  constructor(
    private readonly dependencies: PlatformPartnerRegionManagementDependencies,
  ) {
    this.audit = dependencies.audit ?? platformAuditLogService;
  }

  async update(
    authContext: AuthContext,
    partnerId: string,
    input: PlatformPartnerRegionsUpdateInput,
  ) {
    const employeeId = this.requireManager(authContext);
    const partner = await this.dependencies.repository.findPartnerById(partnerId);
    if (!partner) {
      throw Errors.business(
        404,
        "城市合伙人不存在",
        "PLATFORM_PARTNER_NOT_FOUND",
      );
    }
    const regionCodes =
      await this.dependencies.regionPolicy.assertAssignableDistricts(
        input.region_codes,
        { excludePartnerId: partnerId },
      );
    const updatePartnerRegions =
      this.dependencies.repository.updatePartnerRegions;
    if (!updatePartnerRegions) {
      throw Errors.dbError("城市合伙人区域更新能力未配置");
    }
    const updated = await updatePartnerRegions.call(
      this.dependencies.repository,
      partnerId,
      {
        region_codes: regionCodes,
        expected_version: input.expected_version,
        updated_by_employee_id: employeeId,
      } satisfies PlatformPartnerRegionsRecordInput,
    );
    if (!updated) {
      throw Errors.business(
        409,
        "运营区县已被其他操作更新，请刷新后重试",
        "PLATFORM_PARTNER_REGION_VERSION_CONFLICT",
      );
    }

    await this.audit.recordBestEffort({
      action: "platform_partner_regions_update",
      actorEmployeeId: employeeId,
      actorUserId: authContext.authUserId,
      resourceType: "platform_partner",
      resourceId: partnerId,
      resourceLabel: partner.name,
      summary: `调整城市合伙人「${partner.name}」运营区县`,
      metadata: {
        reason: input.change_reason,
        previous_region_codes: partner.region_codes,
        current_region_codes: updated.region_codes,
        previous_version: partner.region_version ?? input.expected_version,
        current_version: updated.region_version ?? input.expected_version + 1,
      },
    });
    return updated;
  }

  private requireManager(authContext: AuthContext) {
    const canManage = authContext.isPlatformAdmin &&
      authContext.permissions.some(
        (permission) => permission.code === "platform.partner.manage",
      );
    if (!canManage || !authContext.employeeId) throw Errors.forbidden();
    return authContext.employeeId;
  }
}
