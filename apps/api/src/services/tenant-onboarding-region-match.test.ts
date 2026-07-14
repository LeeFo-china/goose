import { describe, expect, test } from "bun:test";

import type { TenantOnboardingPartnerBrief } from "@/repositories/tenant-onboarding-types";
import { TenantOnboardingRegionMatchService } from "@/services/tenant-onboarding-region-match";

type AreaRecord = {
  adcode: string;
  level: "province" | "city" | "district";
  parent_adcode: string | null;
};

type ResolverFixtureOptions = {
  areas: AreaRecord[];
  partners?: TenantOnboardingPartnerBrief[];
  invitePartners?: Readonly<Record<string, TenantOnboardingPartnerBrief | null>>;
};

function partner(
  id: string,
  regionCodes: string[],
  status: TenantOnboardingPartnerBrief["status"] = "active",
): TenantOnboardingPartnerBrief {
  return {
    id,
    name: id,
    status,
    region_codes: [...regionCodes],
  };
}

function createResolver(options: ResolverFixtureOptions) {
  const areaQueries: string[][] = [];
  const overlapQueries: string[][] = [];
  const inviteQueries: string[] = [];
  const areasByCode = new Map(
    options.areas.map((area) => [area.adcode, { ...area }] as const),
  );

  const resolver = new TenantOnboardingRegionMatchService({
    administrativeAreaRepository: {
      async loadActiveByAdcodes(adcodes) {
        areaQueries.push([...adcodes]);
        return adcodes.flatMap((adcode) => {
          const area = areasByCode.get(adcode);
          return area ? [{ ...area }] : [];
        });
      },
    },
    partnerRepository: {
      async listActiveOverlappingPartners(regionCodes) {
        overlapQueries.push([...regionCodes]);
        return (options.partners ?? []).map((item) => ({
          ...item,
          region_codes: [...item.region_codes],
        }));
      },
      async findPartnerByInviteCode(inviteCode) {
        inviteQueries.push(inviteCode);
        const invitedPartner = options.invitePartners?.[inviteCode];
        return invitedPartner
          ? { ...invitedPartner, region_codes: [...invitedPartner.region_codes] }
          : null;
      },
    },
  });

  return { areaQueries, inviteQueries, overlapQueries, resolver };
}

const xinyangAreas: AreaRecord[] = [
  { adcode: "410000", level: "province", parent_adcode: null },
  { adcode: "411500", level: "city", parent_adcode: "410000" },
  { adcode: "411525", level: "district", parent_adcode: "411500" },
];

describe("TenantOnboardingRegionMatchService", () => {
  test("matches a city partner through the submitted district's real ancestor chain", async () => {
    const { areaQueries, overlapQueries, resolver } = createResolver({
      areas: xinyangAreas,
      partners: [partner("partner-xinyang", ["411500"])],
    });

    const result = await resolver.resolve({
      serviceRegionCodes: ["411525"],
      inviteCode: null,
    });

    expect(result).toEqual({
      kind: "unique",
      partnerIds: ["partner-xinyang"],
      selectedPartner: partner("partner-xinyang", ["411500"]),
      reason: "region",
    });
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

    await expect(resolver.resolve({
      serviceRegionCodes: ["411525"],
      inviteCode: null,
    })).resolves.toEqual({
      kind: "unique",
      partnerIds: ["partner-district"],
      selectedPartner: partner("partner-district", ["411525"]),
      reason: "region",
    });
  });

  test("ranks city coverage above province coverage", async () => {
    const { resolver } = createResolver({
      areas: xinyangAreas,
      partners: [
        partner("partner-province", ["410000"]),
        partner("partner-city", ["411500"]),
      ],
    });

    await expect(resolver.resolve({
      serviceRegionCodes: ["411525"],
      inviteCode: null,
    })).resolves.toEqual({
      kind: "unique",
      partnerIds: ["partner-city"],
      selectedPartner: partner("partner-city", ["411500"]),
      reason: "region",
    });
  });

  test("returns deterministic ambiguity instead of selecting the first equal partner", async () => {
    const { resolver } = createResolver({
      areas: xinyangAreas,
      partners: [
        partner("partner-b", ["411500"]),
        partner("partner-a", ["411500"]),
      ],
    });

    await expect(resolver.resolve({
      serviceRegionCodes: ["411525"],
      inviteCode: null,
    })).resolves.toEqual({
      kind: "ambiguous",
      partnerIds: ["partner-a", "partner-b"],
      selectedPartner: null,
      reason: "same_specificity",
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

    await expect(resolver.resolve({
      serviceRegionCodes: ["411525"],
      inviteCode: null,
    })).resolves.toEqual({
      kind: "unique",
      partnerIds: ["partner-active"],
      selectedPartner: partner("partner-active", ["411500"]),
      reason: "region",
    });
  });

  test("prioritizes an active invite partner only when it covers a submitted ancestor", async () => {
    const invitePartner = partner("partner-invite", ["410000"]);
    const { resolver } = createResolver({
      areas: xinyangAreas,
      partners: [partner("partner-district", ["411525"])],
      invitePartners: { "INVITE-VALID": invitePartner },
    });

    await expect(resolver.resolve({
      serviceRegionCodes: ["411525"],
      inviteCode: "INVITE-VALID",
    })).resolves.toEqual({
      kind: "unique",
      partnerIds: ["partner-invite"],
      selectedPartner: invitePartner,
      reason: "invite_code",
    });
  });

  test("ignores an invite partner with invalid regional coverage", async () => {
    const { resolver } = createResolver({
      areas: xinyangAreas,
      partners: [partner("partner-region", ["411500"])],
      invitePartners: {
        "INVITE-OUTSIDE": partner("partner-outside", ["330100"]),
      },
    });

    await expect(resolver.resolve({
      serviceRegionCodes: ["411525"],
      inviteCode: "INVITE-OUTSIDE",
    })).resolves.toEqual({
      kind: "unique",
      partnerIds: ["partner-region"],
      selectedPartner: partner("partner-region", ["411500"]),
      reason: "region",
    });
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

    await expect(resolver.resolve({
      serviceRegionCodes: ["411525"],
      inviteCode: "INVITE-SUSPENDED",
    })).resolves.toMatchObject({
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

    await expect(resolver.resolve({
      serviceRegionCodes: ["411525"],
      inviteCode: null,
    })).resolves.toEqual({
      kind: "none",
      partnerIds: [],
      selectedPartner: null,
      reason: "no_eligible_partner",
    });
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

    await expect(resolver.resolve({
      serviceRegionCodes: ["411525", "330106", "411525"],
      inviteCode: null,
    })).resolves.toEqual({
      kind: "unique",
      partnerIds: ["partner-exact"],
      selectedPartner: partner("partner-exact", ["330106"]),
      reason: "region",
    });
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

  test("bounds traversal and handles malformed cycles without hanging", async () => {
    const { areaQueries, resolver } = createResolver({
      areas: [
        { adcode: "411525", level: "district", parent_adcode: "411500" },
        { adcode: "411500", level: "city", parent_adcode: "411525" },
      ],
      partners: [partner("partner-city", ["411500"])],
    });

    await expect(resolver.resolve({
      serviceRegionCodes: ["411525"],
      inviteCode: null,
    })).resolves.toMatchObject({
      kind: "unique",
      partnerIds: ["partner-city"],
    });
    expect(areaQueries).toEqual([["411525"], ["411500"]]);
  });

  test("stops safely when an administrative parent record is missing", async () => {
    const { areaQueries, overlapQueries, resolver } = createResolver({
      areas: [
        { adcode: "411525", level: "district", parent_adcode: "411500" },
      ],
      partners: [partner("partner-missing-city", ["411500"])],
    });

    await expect(resolver.resolve({
      serviceRegionCodes: ["411525"],
      inviteCode: null,
    })).resolves.toEqual({
      kind: "none",
      partnerIds: [],
      selectedPartner: null,
      reason: "no_eligible_partner",
    });
    expect(areaQueries).toEqual([["411525"], ["411500"]]);
    expect(overlapQueries).toEqual([["411525"]]);
  });
});
