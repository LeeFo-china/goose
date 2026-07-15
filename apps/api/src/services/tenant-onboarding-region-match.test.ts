import { describe, expect, test } from "bun:test";

import type { TenantOnboardingPartnerBrief } from "@/repositories/tenant-onboarding-types";
import {
  isTenantOnboardingPartnerEligibleForDecision,
  TenantOnboardingRegionMatchService,
  type TenantOnboardingPartnerResolution,
} from "@/services/tenant-onboarding-region-match";

type AreaRecord = { adcode: string; level: "province" | "city" | "district"; parent_adcode: string | null };

type ResolverFixtureOptions = {
  areas: AreaRecord[];
  partners?: TenantOnboardingPartnerBrief[];
  partnersTruncated?: boolean;
  invitePartners?: Readonly<Record<string, TenantOnboardingPartnerBrief | null>>;
};

function partner(
  id: string,
  regionCodes: string[],
  status: TenantOnboardingPartnerBrief["status"] = "active",
): TenantOnboardingPartnerBrief {
  return { id, name: id, status, region_codes: [...regionCodes] };
}

function createResolver(options: ResolverFixtureOptions) {
  const areaQueries: string[][] = [];
  const overlapQueries: string[][] = [];
  const overlapLimits: number[] = [];

  const resolver = new TenantOnboardingRegionMatchService({
    administrativeAreaRepository: {
      async loadActiveByAdcodes(adcodes) {
        areaQueries.push([...adcodes]);
        const requestedCodes = new Set(adcodes);
        return options.areas
          .filter((area) => requestedCodes.has(area.adcode))
          .map((area) => ({ ...area }));
      },
    },
    partnerRepository: {
      async listActiveOverlappingPartners(query) {
        overlapQueries.push([...query.region_codes]);
        overlapLimits.push(query.limit);
        const partners = (options.partners ?? []).map((item) => (
          { ...item, region_codes: [...item.region_codes] }
        ));
        return { partners, truncated: options.partnersTruncated ?? false };
      },
      async findPartnerByInviteCode(inviteCode) {
        const invitedPartner = options.invitePartners?.[inviteCode];
        return invitedPartner
          ? { ...invitedPartner, region_codes: [...invitedPartner.region_codes] }
          : null;
      },
    },
  });

  return { areaQueries, overlapLimits, overlapQueries, resolver };
}

const xinyangAreas: AreaRecord[] = [
  { adcode: "410000", level: "province", parent_adcode: null },
  { adcode: "411500", level: "city", parent_adcode: "410000" },
  { adcode: "411525", level: "district", parent_adcode: "411500" },
];

const noneResolution: TenantOnboardingPartnerResolution = {
  kind: "none", partnerIds: [], selectedPartner: null, reason: "no_eligible_partner",
};

function uniqueResolution(
  selectedPartner: TenantOnboardingPartnerBrief,
  reason: "invite_code" | "region" = "region",
): TenantOnboardingPartnerResolution {
  return {
    kind: "unique", partnerIds: [selectedPartner.id], selectedPartner, reason,
  };
}

function ambiguousResolution(partnerIds: string[]) {
  return {
    kind: "ambiguous" as const, partnerIds, selectedPartner: null,
    reason: "same_specificity" as const,
  };
}

function resolve(
  resolver: TenantOnboardingRegionMatchService,
  serviceRegionCodes: string[] = ["411525"],
  inviteCode: string | null = null,
) {
  return resolver.resolve({ serviceRegionCodes, inviteCode });
}

describe("TenantOnboardingRegionMatchService", () => {
  test("matches a city partner through the submitted district's real ancestor chain", async () => {
    const { areaQueries, overlapQueries, resolver } = createResolver({
      areas: xinyangAreas,
      partners: [partner("partner-xinyang", ["411500"])],
    });

    const result = await resolve(resolver);

    expect(result).toEqual(uniqueResolution(
      partner("partner-xinyang", ["411500"]),
    ));
    expect(areaQueries).toEqual([
      ["411525"],
      ["411500"],
      ["410000"],
    ]);
    expect(overlapQueries).toEqual([
      ["410000", "411500", "411525"],
    ]);
  });

  test("ranks exact district coverage above city and province coverage", async () => {
    const { resolver } = createResolver({
      areas: xinyangAreas,
      partners: [
        partner("partner-province", ["410000"]),
        partner("partner-city", ["411500"]),
        partner("partner-district", ["411525"]),
      ],
    });

    await expect(resolve(resolver)).resolves.toEqual(uniqueResolution(
      partner("partner-district", ["411525"]),
    ));
  });

  test("ranks city coverage above province coverage", async () => {
    const { resolver } = createResolver({
      areas: xinyangAreas,
      partners: [
        partner("partner-province", ["410000"]),
        partner("partner-city", ["411500"]),
      ],
    });

    await expect(resolve(resolver)).resolves.toEqual(uniqueResolution(
      partner("partner-city", ["411500"]),
    ));
  });

  test("returns deterministic ambiguity instead of selecting the first equal partner", async () => {
    const { resolver } = createResolver({
      areas: xinyangAreas,
      partners: [
        partner("partner-b", ["411500"]),
        partner("partner-a", ["411500"]),
      ],
    });

    await expect(resolve(resolver)).resolves.toEqual(
      ambiguousResolution(["partner-a", "partner-b"]),
    );
  });

  test("fails closed when the bounded regional candidate result is truncated", async () => {
    const { overlapLimits, overlapQueries, resolver } = createResolver({
      areas: xinyangAreas, partnersTruncated: true,
      partners: [partner("partner-apparently-best", ["411525"])],
    });
    const result = await resolve(resolver, ["411525", "411525"]);
    expect(result).toMatchObject({
      kind: "ambiguous", partnerIds: ["partner-apparently-best"],
      reason: "candidate_limit",
    });
    expect(isTenantOnboardingPartnerEligibleForDecision(result, "partner-apparently-best")).toBe(false);
    expect(overlapQueries).toEqual([["410000", "411500", "411525"]]);
    const queriedCodes = overlapQueries[0] ?? [];
    expect(new Set(queriedCodes).size).toBe(queriedCodes.length);
    expect(overlapLimits).toEqual([100]);
  });

  test("sorts equal candidate IDs by code units instead of locale", async () => {
    const { resolver } = createResolver({
      areas: xinyangAreas,
      partners: [
        partner("partner-a", ["411500"]),
        partner("partner-Z", ["411500"]),
      ],
    });

    await expect(resolve(resolver)).resolves.toMatchObject({
      kind: "ambiguous",
      partnerIds: ["partner-Z", "partner-a"],
    });
  });

  test("excludes every non-active platform partner status", async () => {
    const { resolver } = createResolver({
      areas: xinyangAreas,
      partners: [
        partner("partner-pending", ["411525"], "pending"),
        partner("partner-suspended", ["411525"], "suspended"),
        partner("partner-terminated", ["411525"], "terminated"),
        partner("partner-active", ["411500"], "active"),
      ],
    });

    await expect(resolve(resolver)).resolves.toEqual(uniqueResolution(
      partner("partner-active", ["411500"]),
    ));
  });

  test("prioritizes an active invite partner only when it covers a submitted ancestor", async () => {
    const invitePartner = partner("partner-invite", ["410000"]);
    const { overlapQueries, resolver } = createResolver({
      areas: xinyangAreas,
      partners: [partner("partner-district", ["411525"])],
      invitePartners: { "INVITE-VALID": invitePartner },
    });

    await expect(resolve(resolver, undefined, "INVITE-VALID"))
      .resolves.toEqual(uniqueResolution(invitePartner, "invite_code"));
    expect(overlapQueries).toEqual([]);
  });

  test("ignores an invite partner with invalid regional coverage", async () => {
    const { resolver } = createResolver({
      areas: xinyangAreas,
      partners: [partner("partner-region", ["411500"])],
      invitePartners: {
        "INVITE-OUTSIDE": partner("partner-outside", ["330100"]),
      },
    });

    await expect(resolve(resolver, undefined, "INVITE-OUTSIDE"))
      .resolves.toEqual(uniqueResolution(
        partner("partner-region", ["411500"]),
      ));
  });

  test("ignores a non-active invite partner even when its coverage is valid", async () => {
    const { resolver } = createResolver({
      areas: xinyangAreas,
      partners: [partner("partner-region", ["411500"])],
      invitePartners: {
        "INVITE-SUSPENDED": partner(
          "partner-suspended",
          ["411525"],
          "suspended",
        ),
      },
    });

    await expect(resolve(resolver, undefined, "INVITE-SUSPENDED"))
      .resolves.toMatchObject({
      kind: "unique",
      partnerIds: ["partner-region"],
      reason: "region",
    });
  });

  test("returns none when no active partner has exact overlap with a valid ancestor", async () => {
    const { resolver } = createResolver({
      areas: xinyangAreas,
      partners: [
        partner("partner-prefix", ["41152"]),
        partner("partner-other", ["330100"]),
      ],
    });

    await expect(resolve(resolver)).resolves.toEqual(noneResolution);
  });

  test("scores multiple distinct submitted regions without prefix matching or duplicate rewards", async () => {
    const hangzhouAreas: AreaRecord[] = [
      { adcode: "330000", level: "province", parent_adcode: null },
      { adcode: "330100", level: "city", parent_adcode: "330000" },
      { adcode: "330106", level: "district", parent_adcode: "330100" },
    ];
    const { areaQueries, overlapQueries, resolver } = createResolver({
      areas: [...xinyangAreas, ...hangzhouAreas],
      partners: [
        partner("partner-two-cities", ["411500", "330100"]),
        partner("partner-two-provinces", ["410000", "330000"]),
        partner("partner-exact", ["330106"]),
        partner("partner-prefix-only", ["41152", "33010"]),
      ],
    });

    await expect(resolve(resolver, ["411525", "330106", "411525"]))
      .resolves.toEqual(uniqueResolution(partner("partner-exact", ["330106"])));
    expect(areaQueries).toEqual([
      ["330106", "411525"],
      ["330100", "411500"],
      ["330000", "410000"],
    ]);
    expect(overlapQueries).toEqual([[
      "330000",
      "330100",
      "330106",
      "410000",
      "411500",
      "411525",
    ]]);
  });

  test("counts only the best level when one partner covers every level of a path", async () => {
    const { resolver } = createResolver({
      areas: xinyangAreas,
      partners: [
        partner("partner-all-levels", ["411525", "411500", "410000"]),
        partner("partner-district-only", ["411525"]),
      ],
    });

    await expect(resolve(resolver)).resolves.toEqual(ambiguousResolution([
      "partner-all-levels",
      "partner-district-only",
    ]));
  });

  test("returns ambiguity for equal mixed score vectors across regions", async () => {
    const { resolver } = createResolver({
      areas: [
        ...xinyangAreas,
        { adcode: "330000", level: "province", parent_adcode: null },
        { adcode: "330100", level: "city", parent_adcode: "330000" },
        { adcode: "330106", level: "district", parent_adcode: "330100" },
      ],
      partners: [
        partner("partner-a", ["411525", "330100"]),
        partner("partner-b", ["411500", "330106"]),
      ],
    });

    await expect(resolve(resolver, ["411525", "330106"]))
      .resolves.toEqual(ambiguousResolution(["partner-a", "partner-b"]));
  });

  test("returns defensive partner copies without mutating repository records", async () => {
    const repositoryPartner = partner("partner-city", ["411500"]);
    const { resolver } = createResolver({
      areas: xinyangAreas,
      partners: [repositoryPartner],
    });

    const firstResult = await resolve(resolver);
    expect(firstResult.kind).toBe("unique");
    if (firstResult.kind === "unique") {
      firstResult.selectedPartner.name = "mutated";
      firstResult.selectedPartner.region_codes.push("410000");
    }

    expect(repositoryPartner).toEqual(partner("partner-city", ["411500"]));
    await expect(resolve(resolver)).resolves.toMatchObject({
      kind: "unique",
      selectedPartner: partner("partner-city", ["411500"]),
    });
  });

  test("fails closed to the exact submitted area when the hierarchy cycles", async () => {
    const { areaQueries, resolver } = createResolver({
      areas: [
        { adcode: "411525", level: "district", parent_adcode: "411500" },
        { adcode: "411500", level: "city", parent_adcode: "411525" },
      ],
      partners: [partner("partner-city", ["411500"])],
    });

    await expect(resolve(resolver)).resolves.toEqual(noneResolution);
    expect(areaQueries).toEqual([["411525"], ["411500"]]);
  });

  test("keeps exact district coverage eligible when its ancestor hierarchy cycles", async () => {
    const { resolver } = createResolver({
      areas: [
        { adcode: "411525", level: "district", parent_adcode: "411500" },
        { adcode: "411500", level: "city", parent_adcode: "411525" },
      ],
      partners: [partner("partner-district", ["411525"])],
    });

    await expect(resolve(resolver)).resolves.toMatchObject({
      kind: "unique",
      partnerIds: ["partner-district"],
      reason: "region",
    });
  });

  test("rejects conflicting duplicate rows independent of repository ordering", async () => {
    const duplicateRows: AreaRecord[] = [
      { adcode: "411525", level: "district", parent_adcode: "411500" },
      { adcode: "411500", level: "city", parent_adcode: "410000" },
      { adcode: "411500", level: "city", parent_adcode: "330000" },
      { adcode: "410000", level: "province", parent_adcode: null },
      { adcode: "330000", level: "province", parent_adcode: null },
    ];
    const forward = createResolver({
      areas: duplicateRows,
      partners: [partner("partner-city", ["411500"])],
    });
    const reversed = createResolver({
      areas: [...duplicateRows].reverse(),
      partners: [partner("partner-city", ["411500"])],
    });

    const [forwardResult, reversedResult] = await Promise.all([
      resolve(forward.resolver),
      resolve(reversed.resolver),
    ]);

    expect(forwardResult).toEqual(noneResolution);
    expect(reversedResult).toEqual(forwardResult);
  });

  test.each([
    {
      name: "conflicting submitted exact identity",
      areas: [
        { adcode: "411525", level: "district", parent_adcode: "411500" },
        { adcode: "411525", level: "city", parent_adcode: "410000" },
      ],
      candidate: partner("partner-exact", ["411525"]),
    },
    {
      name: "district-to-province transition",
      areas: [
        { adcode: "411525", level: "district", parent_adcode: "410000" },
        { adcode: "410000", level: "province", parent_adcode: null },
      ],
      candidate: partner("partner-province", ["410000"]),
    },
    {
      name: "province over-depth parent",
      areas: [
        ...xinyangAreas.slice(1, 3),
        { adcode: "410000", level: "province", parent_adcode: "100000" },
      ],
      candidate: partner("partner-province", ["410000"]),
    },
  ] satisfies Array<{
    name: string;
    areas: AreaRecord[];
    candidate: TenantOnboardingPartnerBrief;
  }>)("fails closed for $name", async ({ areas, candidate }) => {
    const { resolver } = createResolver({ areas, partners: [candidate] });
    await expect(resolve(resolver)).resolves.toEqual(noneResolution);
  });

  test("keeps an independent valid path when another submitted path is corrupt", async () => {
    const hangzhouAreas: AreaRecord[] = [
      { adcode: "330000", level: "province", parent_adcode: null },
      { adcode: "330100", level: "city", parent_adcode: "330000" },
      { adcode: "330106", level: "district", parent_adcode: "330100" },
    ];
    const { resolver } = createResolver({
      areas: [
        { adcode: "411525", level: "district", parent_adcode: "411500" },
        { adcode: "411500", level: "city", parent_adcode: "411525" },
        ...hangzhouAreas,
      ],
      partners: [
        partner("partner-corrupt-city", ["411500"]),
        partner("partner-valid-city", ["330100"]),
      ],
    });

    await expect(resolve(resolver, ["411525", "330106"]))
      .resolves.toEqual(uniqueResolution(
        partner("partner-valid-city", ["330100"]),
      ));
  });

  test("keeps a verified prefix when the next parent record is missing", async () => {
    const { resolver } = createResolver({
      areas: [
        { adcode: "411525", level: "district", parent_adcode: "411500" },
        { adcode: "411500", level: "city", parent_adcode: "410000" },
      ],
      partners: [partner("partner-city", ["411500"])],
    });

    await expect(resolve(resolver)).resolves.toMatchObject({
      kind: "unique",
      partnerIds: ["partner-city"],
      reason: "region",
    });
  });

  test("stops safely when an administrative parent record is missing", async () => {
    const { areaQueries, overlapQueries, resolver } = createResolver({
      areas: [
        { adcode: "411525", level: "district", parent_adcode: "411500" },
      ],
      partners: [partner("partner-missing-city", ["411500"])],
    });

    await expect(resolve(resolver)).resolves.toEqual(noneResolution);
    expect(areaQueries).toEqual([["411525"], ["411500"]]);
    expect(overlapQueries).toEqual([["411525"]]);
  });
});
