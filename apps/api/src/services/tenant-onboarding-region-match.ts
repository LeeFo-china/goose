import type {
  TenantOnboardingAdministrativeAreaRecord,
  TenantOnboardingPartnerBrief,
} from "@/repositories/tenant-onboarding-types";

const MAX_ADMINISTRATIVE_AREA_LEVELS = 3;

const AREA_SPECIFICITY = {
  province: 0,
  city: 1,
  district: 2,
} as const satisfies Record<
  TenantOnboardingAdministrativeAreaRecord["level"],
  number
>;

type CoverageScore = readonly [
  districtMatches: number,
  cityMatches: number,
  provinceMatches: number,
];

export type TenantOnboardingPartnerResolution =
  | {
      kind: "none";
      partnerIds: [];
      selectedPartner: null;
      reason: "no_eligible_partner";
    }
  | {
      kind: "unique";
      partnerIds: [string];
      selectedPartner: TenantOnboardingPartnerBrief;
      reason: "invite_code" | "region";
    }
  | {
      kind: "ambiguous";
      partnerIds: string[];
      selectedPartner: null;
      reason: "same_specificity";
    };

export type TenantOnboardingAdministrativeAreaRepositoryPort = {
  /** Loads active records for these exact codes. The resolver batches at most three levels. */
  loadActiveByAdcodes: (
    adcodes: readonly string[],
  ) => Promise<readonly TenantOnboardingAdministrativeAreaRecord[]>;
};

export type TenantOnboardingPartnerRepositoryPort = {
  /** Queries status=active partners whose region_codes overlap at least one exact code. */
  listActiveOverlappingPartners: (
    regionCodes: readonly string[],
  ) => Promise<readonly TenantOnboardingPartnerBrief[]>;
  /** Returns the partner for a currently valid invite code, or null. */
  findPartnerByInviteCode: (
    inviteCode: string,
  ) => Promise<TenantOnboardingPartnerBrief | null>;
};

type TenantOnboardingRegionMatchDependencies = {
  administrativeAreaRepository: TenantOnboardingAdministrativeAreaRepositoryPort;
  partnerRepository: TenantOnboardingPartnerRepositoryPort;
};

type ResolveTenantOnboardingPartnerInput = {
  serviceRegionCodes: readonly string[];
  inviteCode: string | null;
};

type AreaPaths = Map<string, TenantOnboardingAdministrativeAreaRecord[]>;

type ScoredPartner = {
  partner: TenantOnboardingPartnerBrief;
  score: CoverageScore;
};

export class TenantOnboardingRegionMatchService {
  private readonly administrativeAreaRepository: TenantOnboardingAdministrativeAreaRepositoryPort;
  private readonly partnerRepository: TenantOnboardingPartnerRepositoryPort;

  constructor(dependencies: TenantOnboardingRegionMatchDependencies) {
    this.administrativeAreaRepository = dependencies.administrativeAreaRepository;
    this.partnerRepository = dependencies.partnerRepository;
  }

  async resolve(
    input: ResolveTenantOnboardingPartnerInput,
  ): Promise<TenantOnboardingPartnerResolution> {
    const submittedCodes = [...new Set(input.serviceRegionCodes)].sort();
    const areaPaths = await this.loadAreaPaths(submittedCodes);
    const ancestorCodes = this.collectAncestorCodes(areaPaths);
    if (ancestorCodes.length === 0) return this.none();

    const invitedPartner = await this.resolveEligibleInvitePartner(
      input.inviteCode,
      ancestorCodes,
    );
    if (invitedPartner) {
      return this.unique(invitedPartner, "invite_code");
    }

    const repositoryPartners =
      await this.partnerRepository.listActiveOverlappingPartners(ancestorCodes);
    const scoredPartners = this.scoreEligiblePartners(
      repositoryPartners,
      areaPaths,
      new Set(ancestorCodes),
    );
    if (scoredPartners.length === 0) return this.none();

    const bestScore = scoredPartners[0]?.score;
    if (!bestScore) return this.none();

    const bestPartners = scoredPartners
      .filter((candidate) => this.compareScores(candidate.score, bestScore) === 0)
      .map((candidate) => candidate.partner);
    if (bestPartners.length > 1) {
      return {
        kind: "ambiguous",
        partnerIds: bestPartners.map((partner) => partner.id),
        selectedPartner: null,
        reason: "same_specificity",
      };
    }

    const selectedPartner = bestPartners[0];
    return selectedPartner
      ? this.unique(selectedPartner, "region")
      : this.none();
  }

  private async loadAreaPaths(submittedCodes: readonly string[]): Promise<AreaPaths> {
    const areasByCode = new Map<string, TenantOnboardingAdministrativeAreaRecord>();
    const loadedCodes = new Set<string>();
    let frontier = [...submittedCodes];

    for (
      let depth = 0;
      depth < MAX_ADMINISTRATIVE_AREA_LEVELS && frontier.length > 0;
      depth += 1
    ) {
      const requestedCodes = [...new Set(frontier)]
        .filter((adcode) => !loadedCodes.has(adcode))
        .sort();
      if (requestedCodes.length === 0) break;

      requestedCodes.forEach((adcode) => loadedCodes.add(adcode));
      const requestedCodeSet = new Set(requestedCodes);
      const rows = await this.administrativeAreaRepository
        .loadActiveByAdcodes(requestedCodes);

      for (const row of rows) {
        if (requestedCodeSet.has(row.adcode) && !areasByCode.has(row.adcode)) {
          areasByCode.set(row.adcode, { ...row });
        }
      }

      frontier = requestedCodes.flatMap((adcode) => {
        const parentAdcode = areasByCode.get(adcode)?.parent_adcode;
        return parentAdcode && !loadedCodes.has(parentAdcode)
          ? [parentAdcode]
          : [];
      });
    }

    return new Map(submittedCodes.map((submittedCode) => [
      submittedCode,
      this.buildAreaPath(submittedCode, areasByCode),
    ]));
  }

  private buildAreaPath(
    submittedCode: string,
    areasByCode: ReadonlyMap<string, TenantOnboardingAdministrativeAreaRecord>,
  ): TenantOnboardingAdministrativeAreaRecord[] {
    const path: TenantOnboardingAdministrativeAreaRecord[] = [];
    const visitedCodes = new Set<string>();
    let currentCode: string | null = submittedCode;

    while (
      currentCode &&
      path.length < MAX_ADMINISTRATIVE_AREA_LEVELS &&
      !visitedCodes.has(currentCode)
    ) {
      visitedCodes.add(currentCode);
      const area = areasByCode.get(currentCode);
      if (!area) break;
      path.push({ ...area });
      currentCode = area.parent_adcode;
    }

    return path;
  }

  private collectAncestorCodes(areaPaths: AreaPaths): string[] {
    const ancestorCodes = new Set<string>();
    for (const path of areaPaths.values()) {
      path.forEach((area) => ancestorCodes.add(area.adcode));
    }
    return [...ancestorCodes].sort();
  }

  private async resolveEligibleInvitePartner(
    inviteCode: string | null,
    ancestorCodes: readonly string[],
  ): Promise<TenantOnboardingPartnerBrief | null> {
    const normalizedInviteCode = inviteCode?.trim();
    if (!normalizedInviteCode) return null;

    const invitedPartner = await this.partnerRepository
      .findPartnerByInviteCode(normalizedInviteCode);
    return this.isEligiblePartner(invitedPartner, new Set(ancestorCodes))
      ? this.copyPartner(invitedPartner)
      : null;
  }

  private scoreEligiblePartners(
    repositoryPartners: readonly TenantOnboardingPartnerBrief[],
    areaPaths: AreaPaths,
    ancestorCodes: ReadonlySet<string>,
  ): ScoredPartner[] {
    const eligiblePartners = new Map<string, TenantOnboardingPartnerBrief>();
    for (const partner of repositoryPartners) {
      if (this.isEligiblePartner(partner, ancestorCodes)) {
        eligiblePartners.set(partner.id, this.copyPartner(partner));
      }
    }

    return [...eligiblePartners.values()]
      .map((partner) => ({
        partner,
        score: this.scorePartner(partner, areaPaths),
      }))
      .filter((candidate) => candidate.score.some((matches) => matches > 0))
      .sort((left, right) => {
        const scoreOrder = this.compareScores(right.score, left.score);
        return scoreOrder || left.partner.id.localeCompare(right.partner.id);
      });
  }

  /**
   * Scores distinct submitted regions lexicographically as district/city/province.
   * Each region contributes only its most specific match, so duplicate or broad
   * coverage cannot outweigh a more specific match.
   */
  private scorePartner(
    partner: TenantOnboardingPartnerBrief,
    areaPaths: AreaPaths,
  ): CoverageScore {
    const coverageCodes = new Set(partner.region_codes);
    const matches = [0, 0, 0];

    for (const path of areaPaths.values()) {
      let highestSpecificity = -1;
      for (const area of path) {
        if (coverageCodes.has(area.adcode)) {
          highestSpecificity = Math.max(
            highestSpecificity,
            AREA_SPECIFICITY[area.level],
          );
        }
      }
      if (highestSpecificity >= 0) {
        matches[highestSpecificity] =
          (matches[highestSpecificity] ?? 0) + 1;
      }
    }

    return [matches[2] ?? 0, matches[1] ?? 0, matches[0] ?? 0];
  }

  private compareScores(left: CoverageScore, right: CoverageScore): number {
    for (let index = 0; index < left.length; index += 1) {
      const difference = (left[index] ?? 0) - (right[index] ?? 0);
      if (difference !== 0) return difference;
    }
    return 0;
  }

  private isEligiblePartner(
    partner: TenantOnboardingPartnerBrief | null,
    ancestorCodes: ReadonlySet<string>,
  ): partner is TenantOnboardingPartnerBrief {
    return partner?.status === "active" &&
      partner.region_codes.some((regionCode) => ancestorCodes.has(regionCode));
  }

  private copyPartner(
    partner: TenantOnboardingPartnerBrief,
  ): TenantOnboardingPartnerBrief {
    return { ...partner, region_codes: [...partner.region_codes] };
  }

  private none(): TenantOnboardingPartnerResolution {
    return {
      kind: "none",
      partnerIds: [],
      selectedPartner: null,
      reason: "no_eligible_partner",
    };
  }

  private unique(
    partner: TenantOnboardingPartnerBrief,
    reason: "invite_code" | "region",
  ): TenantOnboardingPartnerResolution {
    const selectedPartner = this.copyPartner(partner);
    return {
      kind: "unique",
      partnerIds: [selectedPartner.id],
      selectedPartner,
      reason,
    };
  }
}
