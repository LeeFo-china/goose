import { Errors } from "@/errors/error-factory";
import { administrativeAreaRepository } from "@/repositories/administrative-areas";
import { platformPartnersRepository } from "@/repositories/platform-partners";

type PlatformPartnerRegionPolicyServiceDependencies = {
  areaRepository?: Pick<
    typeof administrativeAreaRepository,
    "findActiveByAdcodes"
  >;
  partnerRepository?: Pick<
    typeof platformPartnersRepository,
    "findActiveRegionConflict"
  >;
};

export class PlatformPartnerRegionPolicyService {
  private readonly areaRepository: NonNullable<
    PlatformPartnerRegionPolicyServiceDependencies["areaRepository"]
  >;
  private readonly partnerRepository: NonNullable<
    PlatformPartnerRegionPolicyServiceDependencies["partnerRepository"]
  >;

  constructor(
    dependencies: PlatformPartnerRegionPolicyServiceDependencies = {},
  ) {
    this.areaRepository =
      dependencies.areaRepository ?? administrativeAreaRepository;
    this.partnerRepository =
      dependencies.partnerRepository ?? platformPartnersRepository;
  }

  async assertAssignableDistricts(
    regionCodes: readonly string[],
    options: { excludePartnerId?: string } = {},
  ) {
    const normalizedCodes = this.normalizeRegionCodes(regionCodes);
    const districts = await this.assertActiveDistrictCodes(normalizedCodes);
    const conflict = await this.partnerRepository.findActiveRegionConflict({
      regionCodes: normalizedCodes,
      excludePartnerId: options.excludePartnerId,
    });

    if (conflict) {
      const conflictRegionCodes = conflict.region_codes.filter((code) =>
        normalizedCodes.includes(code)
      );
      throw Errors.business(
        409,
        `所选区县已由「${conflict.name}」运营`,
        "PLATFORM_PARTNER_REGION_CONFLICT",
        {
          conflict_partner_id: conflict.id,
          conflict_partner_name: conflict.name,
          conflict_region_codes: conflictRegionCodes,
        },
      );
    }

    return districts.map((district) => district.adcode);
  }

  async assertPartnerInviteRegion(
    partnerRegionCodes: readonly string[],
    regionCode: string,
  ) {
    const normalizedRegionCode = regionCode.trim();
    const normalizedPartnerRegions = this.normalizeRegionCodes(
      partnerRegionCodes,
      false,
    );
    if (!normalizedPartnerRegions.includes(normalizedRegionCode)) {
      throw Errors.business(
        422,
        "邀请码区域不在该合伙人的运营区县内",
        "PLATFORM_PARTNER_INVITE_REGION_OUT_OF_SCOPE",
        { region_code: normalizedRegionCode },
      );
    }

    await this.assertActiveDistrictCodes([normalizedRegionCode]);
    return normalizedRegionCode;
  }

  private normalizeRegionCodes(
    regionCodes: readonly string[],
    requireRegion = true,
  ) {
    const normalizedCodes = Array.from(
      new Set(regionCodes.map((code) => code.trim()).filter(Boolean)),
    ).sort();
    if (requireRegion && normalizedCodes.length === 0) {
      throw Errors.business(
        422,
        "请至少选择一个运营区县",
        "PLATFORM_PARTNER_REGION_REQUIRED",
      );
    }
    return normalizedCodes;
  }

  private async assertActiveDistrictCodes(regionCodes: string[]) {
    const rows = await this.areaRepository.findActiveByAdcodes(regionCodes);
    const rowByCode = new Map(rows.map((row) => [row.adcode, row]));
    const invalidRegionCodes = regionCodes.filter(
      (code) => rowByCode.get(code)?.level !== "district",
    );

    if (invalidRegionCodes.length > 0) {
      throw Errors.business(
        422,
        "运营区域只能选择有效的区县级行政区划",
        "PLATFORM_PARTNER_REGION_INVALID",
        { invalid_region_codes: invalidRegionCodes },
      );
    }

    return regionCodes.map((code) => rowByCode.get(code)!);
  }
}

export const platformPartnerRegionPolicyService =
  new PlatformPartnerRegionPolicyService();
