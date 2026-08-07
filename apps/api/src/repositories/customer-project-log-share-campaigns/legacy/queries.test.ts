import { beforeEach, describe, expect, mock, test } from "bun:test";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

const historicalCampaign = {
  id: "a36be798-d104-43c0-ab03-30e3e06795e4",
  share_token: "st_share_reward_claimed_summary_faba534b_20260806",
  status: "reward_claimed",
  reward_claim_status: "claimed",
};
const exactResults: Array<{ data: unknown; error: unknown }> = [];
const prefixResults: Array<{ data: unknown[]; error: unknown }> = [];
const exactTokens: string[] = [];
const prefixPatterns: string[] = [];
const equals: Array<[string, unknown]> = [];
const inFilters: Array<[string, unknown[]]> = [];
const orFilters: string[] = [];
const orderColumns: string[] = [];
const limits: number[] = [];

const client = {
  from: mock(() => {
    const query = {
      select: mock(() => query),
      eq: mock((_column: string, value: string) => {
        exactTokens.push(value);
        equals.push([_column, value]);
        return query;
      }),
      in: mock((column: string, values: unknown[]) => {
        inFilters.push([column, values]);
        return query;
      }),
      or: mock((filter: string) => {
        orFilters.push(filter);
        return query;
      }),
      order: mock((column: string) => {
        orderColumns.push(column);
        return query;
      }),
      maybeSingle: mock(async () => exactResults.shift() ?? {
        data: null,
        error: null,
      }),
      like: mock((_column: string, pattern: string) => {
        prefixPatterns.push(pattern);
        return query;
      }),
      limit: mock((limit: number) => {
        limits.push(limit);
        if (limit === 1) return query;
        return Promise.resolve(prefixResults.shift() ?? {
          data: [],
          error: null,
        });
      }),
    };
    return query;
  }),
};

mock.module("@/utils/supabase", () => ({
  SupabaseDB: { getAdminClient: () => client },
}));

describe("share campaign token lookup", () => {
  beforeEach(() => {
    exactResults.length = 0;
    prefixResults.length = 0;
    exactTokens.length = 0;
    prefixPatterns.length = 0;
    equals.length = 0;
    inFilters.length = 0;
    orFilters.length = 0;
    orderColumns.length = 0;
    limits.length = 0;
  });

  test("resolves a historical poster scene to its unique full token", async () => {
    exactResults.push({ data: null, error: null });
    prefixResults.push({ data: [historicalCampaign], error: null });
    const { findByShareToken } = await import("./queries");

    const campaign = await findByShareToken.call(
      {},
      "st_share_reward_claimed_summary_fab",
    );

    expect(campaign).toMatchObject(historicalCampaign);
    expect(exactTokens).toEqual(["st_share_reward_claimed_summary_fab"]);
    expect(prefixPatterns).toEqual(["st_share_reward_claimed_summary_fab%"]);
  });

  test("keeps exact token lookup as the primary path", async () => {
    exactResults.push({ data: historicalCampaign, error: null });
    const { findByShareToken } = await import("./queries");

    const campaign = await findByShareToken.call(
      {},
      historicalCampaign.share_token,
    );

    expect(campaign).toMatchObject(historicalCampaign);
    expect(prefixPatterns).toEqual([]);
  });

  test("rejects an ambiguous historical scene prefix", async () => {
    exactResults.push({ data: null, error: null });
    prefixResults.push({
      data: [
        historicalCampaign,
        { ...historicalCampaign, id: "another-campaign" },
      ],
      error: null,
    });
    const { findByShareToken } = await import("./queries");

    const campaign = await findByShareToken.call(
      {},
      "st_share_reward_claimed_summary_fab",
    );

    expect(campaign).toBeNull();
  });

  test("queries bounded reward candidates independently from the summary window", async () => {
    prefixResults.push({ data: [historicalCampaign], error: null });
    const { listRewardCandidatesByProject } = await import("./queries");

    const campaigns = await listRewardCandidatesByProject.call({}, {
      customer_id: "customer-id",
      project_id: "project-id",
      now: "2026-08-07T10:00:00.000Z",
    });

    expect(campaigns).toHaveLength(1);
    expect(inFilters).toContainEqual([
      "reward_claim_status",
      ["unclaimed", "pending"],
    ]);
    expect(equals).toContainEqual(["status", "achieved"]);
    expect(orFilters[0]).toContain("reward_claim_voucher_expires_at.gt.2026-08-07T10:00:00.000Z");
    expect(orderColumns).toEqual(["achieved_at", "created_at"]);
    expect(limits).toContain(20);
  });

  test("queries the latest active instance for the effective marketing campaign", async () => {
    exactResults.push({ data: historicalCampaign, error: null });
    const { findLatestActiveByMarketingCampaign } = await import("./queries");

    const campaign = await findLatestActiveByMarketingCampaign.call({}, {
      customer_id: "customer-id",
      project_id: "project-id",
      campaign_id: "marketing-campaign-id",
    });

    expect(campaign).toMatchObject(historicalCampaign);
    expect(equals).toEqual(expect.arrayContaining([
      ["customer_id", "customer-id"],
      ["project_id", "project-id"],
      ["campaign_id", "marketing-campaign-id"],
      ["status", "active"],
    ]));
    expect(limits).toContain(1);
  });
});
