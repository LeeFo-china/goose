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

const client = {
  from: mock(() => {
    const query = {
      select: mock(() => query),
      eq: mock((_column: string, value: string) => {
        exactTokens.push(value);
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
      limit: mock(async () => prefixResults.shift() ?? {
        data: [],
        error: null,
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
});
