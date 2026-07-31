import { beforeEach, describe, expect, mock, test } from "bun:test";

process.env.SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_PUBLISH ??= "test-publish-key";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

const filters: Array<[string, string, unknown]> = [];
const claimedRow = {
  id: "instance-1",
  status: "reward_claimed",
  reward_claim_status: "claimed",
  reward_claim_voucher_token: "voucher-token",
};
const maybeSingle = mock(async (): Promise<{
  data: typeof claimedRow | null;
  error: null;
}> => ({ data: claimedRow, error: null }));
const query = {
  update: mock(() => query),
  eq: mock((column: string, value: unknown) => {
    filters.push(["eq", column, value]);
    return query;
  }),
  neq: mock((column: string, value: unknown) => {
    filters.push(["neq", column, value]);
    return query;
  }),
  select: mock(() => query),
  maybeSingle,
};
const from = mock((_table: string) => query);

mock.module("@/utils/supabase/index", () => ({
  SupabaseDB: {
    getAdminClient: () => ({ from }),
  },
}));

const claimInput = {
  id: "instance-1",
  voucherToken: "voucher-token",
  employeeId: "employee-1",
  channel: "store",
  claimedAt: "2026-07-31T12:00:00.000Z",
};

describe("marketing claim voucher atomic repositories", () => {
  beforeEach(() => {
    filters.length = 0;
    from.mockClear();
    query.update.mockClear();
    query.eq.mockClear();
    query.neq.mockClear();
    query.select.mockClear();
    maybeSingle.mockClear();
    maybeSingle.mockImplementation(async () => ({ data: claimedRow, error: null }));
  });

  test("好友助力仅条件更新未领取的同一 token", async () => {
    const { customerProjectLogShareCampaignRepository } = await import(
      "./customer-project-log-share-campaigns"
    );

    const result = await customerProjectLogShareCampaignRepository
      .claimRewardByVoucherIfUnclaimed(claimInput);

    expect(from).toHaveBeenCalledWith("customer_log_share_campaigns");
    expect(filters).toContainEqual(["eq", "id", claimInput.id]);
    expect(filters).toContainEqual([
      "eq",
      "reward_claim_voucher_token",
      claimInput.voucherToken,
    ]);
    expect(filters).toContainEqual([
      "neq",
      "reward_claim_status",
      "claimed",
    ]);
    expect(filters).toContainEqual(["neq", "status", "reward_claimed"]);
    expect(result).toMatchObject({ reward_claim_status: "claimed" });
  });

  test("预约有礼仅条件更新未领取的同一 token", async () => {
    const { customerAppointmentRewardCampaignRepository } = await import(
      "./customer-appointment-reward-campaigns"
    );

    const result = await customerAppointmentRewardCampaignRepository
      .claimRewardByVoucherIfUnclaimed(claimInput);

    expect(from).toHaveBeenCalledWith("customer_appointment_reward_campaigns");
    expect(filters).toContainEqual(["eq", "id", claimInput.id]);
    expect(filters).toContainEqual([
      "eq",
      "reward_claim_voucher_token",
      claimInput.voucherToken,
    ]);
    expect(filters).toContainEqual([
      "neq",
      "reward_claim_status",
      "claimed",
    ]);
    expect(filters).toContainEqual(["neq", "status", "reward_claimed"]);
    expect(result).toMatchObject({ reward_claim_status: "claimed" });
  });

  test("条件未命中时返回 null 供服务重读", async () => {
    maybeSingle.mockImplementationOnce(async () => ({ data: null, error: null }));
    const { customerAppointmentRewardCampaignRepository } = await import(
      "./customer-appointment-reward-campaigns"
    );

    expect(await customerAppointmentRewardCampaignRepository
      .claimRewardByVoucherIfUnclaimed(claimInput)).toBeNull();
  });
});
