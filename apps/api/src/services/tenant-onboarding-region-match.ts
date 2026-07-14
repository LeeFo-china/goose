import type {
  TenantOnboardingAdministrativeAreaRecord,
  TenantOnboardingPartnerBrief,
  TenantOnboardingPartnerOverlapQuery,
  TenantOnboardingPartnerOverlapResult,
} from "@/repositories/tenant-onboarding-types";

const MAX_ADMINISTRATIVE_AREA_LEVELS = 3;
const MAX_REGION_PARTNER_CANDIDATES = 100;

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
  /**
   * Queries only TenantOnboardingPartnerBrief fields for status=active partners.
   * The adapter must cap returned rows at input.limit and report any truncation.
   */
  listActiveOverlappingPartners: (
    input: TenantOnboardingPartnerOverlapQuery,
  ) => Promise<TenantOnboardingPartnerOverlapResult>;
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

type LoadedAreas = {
  areasByCode: Map<string, TenantOnboardingAdministrativeAreaRecord>;
  conflictingCodes: Set<string>;
};

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

    const candidateResult =
      await this.partnerRepository.listActiveOverlappingPartners({
        region_codes: ancestorCodes,
        limit: MAX_REGION_PARTNER_CANDIDATES,
      });
    if (
      candidateResult.truncated ||
      candidateResult.partners.length > MAX_REGION_PARTNER_CANDIDATES
    ) {
      return this.truncated(candidateResult.partners, new Set(ancestorCodes));
    }

    const scoredPartners = this.scoreEligiblePartners(
      candidateResult.partners,
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
    const loadedAreas: LoadedAreas = {
      areasByCode: new Map(),
      conflictingCodes: new Set(),
    };
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
      this.mergeAreaRows(rows, requestedCodeSet, loadedAreas);

      frontier = requestedCodes.flatMap((adcode) => {
        const area = loadedAreas.areasByCode.get(adcode);
        const parentAdcode = area?.level === "province"
          ? null
          : area?.parent_adcode;
        return parentAdcode && !loadedCodes.has(parentAdcode)
          ? [parentAdcode]
          : [];
      });
    }

    return new Map(submittedCodes.map((submittedCode) => [
      submittedCode,
      this.buildAreaPath(submittedCode, loadedAreas),
    ]));
  }

  private mergeAreaRows(
    rows: readonly TenantOnboardingAdministrativeAreaRecord[],
    requestedCodes: ReadonlySet<string>,
    loadedAreas: LoadedAreas,
  ): void {
    const rowsByCode = new Map<string, TenantOnboardingAdministrativeAreaRecord[]>();
    for (const row of rows) {
      if (!requestedCodes.has(row.adcode)) continue;
      const matchingRows = rowsByCode.get(row.adcode) ?? [];
      matchingRows.push(row);
      rowsByCode.set(row.adcode, matchingRows);
    }

    for (const adcode of requestedCodes) {
      const matchingRows = rowsByCode.get(adcode);
      const firstRow = matchingRows?.[0];
      if (!matchingRows || !firstRow) continue;

      const isConsistent = matchingRows.every((row) => (
        row.adcode === firstRow.adcode &&
        row.level === firstRow.level &&
        row.parent_adcode === firstRow.parent_adcode
      ));
      if (isConsistent) {
        loadedAreas.areasByCode.set(adcode, { ...firstRow });
      } else {
        loadedAreas.areasByCode.delete(adcode);
        loadedAreas.conflictingCodes.add(adcode);
      }
    }
  }

  private buildAreaPath(
    submittedCode: string,
    loadedAreas: LoadedAreas,
  ): TenantOnboardingAdministrativeAreaRecord[] {
    if (loadedAreas.conflictingCodes.has(submittedCode)) return [];
    const exactArea = loadedAreas.areasByCode.get(submittedCode);
    if (!exactArea) return [];

    const exactPath = [{ ...exactArea }];
    const path = [...exactPath];
    const visitedCodes = new Set([submittedCode]);
    let currentArea = exactArea;

    while (true) {
      if (currentArea.level === "province") {
        return currentArea.parent_adcode === null ? path : exactPath;
      }
      if (!currentArea.parent_adcode) return path;
      if (path.length >= MAX_ADMINISTRATIVE_AREA_LEVELS) return exactPath;

      const parentCode = currentArea.parent_adcode;
      if (
        visitedCodes.has(parentCode) ||
        loadedAreas.conflictingCodes.has(parentCode)
      ) {
        return exactPath;
      }

      const parentArea = loadedAreas.areasByCode.get(parentCode);
      if (!parentArea) return path;
      if (!this.isValidParentLevel(currentArea.level, parentArea.level)) {
        return exactPath;
      }

      path.push({ ...parentArea });
      visitedCodes.add(parentCode);
      currentArea = parentArea;
    }
  }

  private isValidParentLevel(
    childLevel: TenantOnboardingAdministrativeAreaRecord["level"],
    parentLevel: TenantOnboardingAdministrativeAreaRecord["level"],
  ): boolean {
    return (childLevel === "district" && parentLevel === "city") ||
      (childLevel === "city" && parentLevel === "province");
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
        return scoreOrder || this.compareIds(left.partner.id, right.partner.id);
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

  /** partnerIds is a bounded diagnostic subset, never an attribution decision. */
  private truncated(
    repositoryPartners: readonly TenantOnboardingPartnerBrief[],
    ancestorCodes: ReadonlySet<string>,
  ): TenantOnboardingPartnerResolution {
    const partnerIds = [...new Set(repositoryPartners
      .filter((partner) => this.isEligiblePartner(partner, ancestorCodes))
      .map((partner) => partner.id))]
      .sort(this.compareIds)
      .slice(0, MAX_REGION_PARTNER_CANDIDATES);
    return {
      kind: "ambiguous",
      partnerIds,
      selectedPartner: null,
      reason: "same_specificity",
    };
  }

  private compareIds(left: string, right: string): number {
    if (left < right) return -1;
    if (left > right) return 1;
    return 0;
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
