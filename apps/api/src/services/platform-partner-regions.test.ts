import { beforeEach, describe, expect, mock, test } from "bun:test";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

type AreaRow = {
  adcode: string;
  name: string;
  level: "province" | "city" | "district";
  parent_adcode: string | null;
  full_name: string;
  status: "active" | "inactive";
};

const districtRows: AreaRow[] = [
  {
    adcode: "411502",
    name: "浉河区",
    level: "district",
    parent_adcode: "411500",
    full_name: "河南省 信阳市 浉河区",
    status: "active",
  },
  {
    adcode: "411503",
    name: "平桥区",
    level: "district",
    parent_adcode: "411500",
    full_name: "河南省 信阳市 平桥区",
    status: "active",
  },
];

const areaRepository = {
  findActiveByAdcodes: mock(async (codes: string[]) =>
    districtRows.filter((row) => codes.includes(row.adcode))
  ),
};

const partnerRepository = {
  findActiveRegionConflict: mock(async () => null as {
    id: string;
    name: string;
    region_codes: string[];
  } | null),
};

async function createService() {
  const { PlatformPartnerRegionPolicyService } = await import(
    "./platform-partner-regions"
  );
  return new PlatformPartnerRegionPolicyService({
    areaRepository,
    partnerRepository,
  });
}

describe("PlatformPartnerRegionPolicyService", () => {
  beforeEach(() => {
    areaRepository.findActiveByAdcodes.mockClear();
    areaRepository.findActiveByAdcodes.mockImplementation(async (codes) =>
      districtRows.filter((row) => codes.includes(row.adcode))
    );
    partnerRepository.findActiveRegionConflict.mockClear();
    partnerRepository.findActiveRegionConflict.mockImplementation(async () => null);
  });

  test("rejects an empty operating region", async () => {
    const service = await createService();

    await expect(service.assertAssignableDistricts([])).rejects.toMatchObject({
      statusCode: 422,
      code: "PLATFORM_PARTNER_REGION_REQUIRED",
    });
    expect(areaRepository.findActiveByAdcodes).not.toHaveBeenCalled();
  });

  test("rejects city-level and unknown region codes", async () => {
    areaRepository.findActiveByAdcodes.mockImplementationOnce(async () => [
      {
        adcode: "411500",
        name: "信阳市",
        level: "city",
        parent_adcode: "410000",
        full_name: "河南省 信阳市",
        status: "active",
      },
    ]);
    const service = await createService();

    await expect(
      service.assertAssignableDistricts(["411500", "419999"]),
    ).rejects.toMatchObject({
      statusCode: 422,
      code: "PLATFORM_PARTNER_REGION_INVALID",
      details: {
        invalid_region_codes: ["411500", "419999"],
      },
    });
    expect(partnerRepository.findActiveRegionConflict).not.toHaveBeenCalled();
  });

  test("rejects a district already owned by an active partner", async () => {
    partnerRepository.findActiveRegionConflict.mockImplementationOnce(async () => ({
      id: "00000000-0000-4000-8000-000000000202",
      name: "其他城市合伙人",
      region_codes: ["411502"],
    }));
    const service = await createService();

    await expect(
      service.assertAssignableDistricts(["411502"], {
        excludePartnerId: "00000000-0000-4000-8000-000000000201",
      }),
    ).rejects.toMatchObject({
      statusCode: 409,
      code: "PLATFORM_PARTNER_REGION_CONFLICT",
      details: {
        conflict_partner_id: "00000000-0000-4000-8000-000000000202",
        conflict_region_codes: ["411502"],
      },
    });
    expect(partnerRepository.findActiveRegionConflict).toHaveBeenCalledWith({
      regionCodes: ["411502"],
      excludePartnerId: "00000000-0000-4000-8000-000000000201",
    });
  });

  test("returns sorted unique district codes", async () => {
    const service = await createService();

    const result = await service.assertAssignableDistricts([
      " 411503 ",
      "411502",
      "411503",
    ]);

    expect(result).toEqual(["411502", "411503"]);
    expect(areaRepository.findActiveByAdcodes).toHaveBeenCalledWith([
      "411502",
      "411503",
    ]);
    expect(partnerRepository.findActiveRegionConflict).toHaveBeenCalledWith({
      regionCodes: ["411502", "411503"],
      excludePartnerId: undefined,
    });
  });

  test("validates an invite district without running conflict lookup", async () => {
    const service = await createService();

    await expect(
      service.assertPartnerInviteRegion(["411502"], "411502"),
    ).resolves.toBe("411502");
    expect(partnerRepository.findActiveRegionConflict).not.toHaveBeenCalled();
  });

  test("rejects invite district outside partner operating regions", async () => {
    const service = await createService();

    await expect(
      service.assertPartnerInviteRegion(["411502"], "411503"),
    ).rejects.toMatchObject({
      statusCode: 422,
      code: "PLATFORM_PARTNER_INVITE_REGION_OUT_OF_SCOPE",
    });
  });
});
