import { describe, expect, test } from "bun:test";

import { selectCustomerProjectCampaignSummaryEntries } from "./campaign-summary-selection";

type Campaign = {
  id: string;
  campaign_id: string | null;
  status: "active" | "achieved" | "reward_claimed" | "closed";
  achieved_at: string | null;
  created_at: string;
};

function candidate(
  campaign: Campaign,
  options?: { legacyClaimable?: boolean; voucherStatus?: "active" | "claimed" | "expired" | "invalid" | null },
) {
  return {
    campaign,
    isLegacyRewardClaimable: options?.legacyClaimable ?? false,
    voucherStatus: options?.voucherStatus ?? null,
  };
}

describe("customer project share campaign summary selection", () => {
  test("returns pending reward and current active entries while preserving legacy focus", () => {
    const oldPending = candidate({
      id: "pending-instance",
      campaign_id: "old-marketing-campaign",
      status: "achieved",
      achieved_at: "2026-08-06T10:00:00.000Z",
      created_at: "2026-08-01T10:00:00.000Z",
    }, { legacyClaimable: true, voucherStatus: "active" });
    const currentActive = candidate({
      id: "active-instance",
      campaign_id: "current-marketing-campaign",
      status: "active",
      achieved_at: null,
      created_at: "2026-08-07T10:00:00.000Z",
    });

    const result = selectCustomerProjectCampaignSummaryEntries({
      candidates: [oldPending, currentActive],
      effectiveMarketingCampaignId: "current-marketing-campaign",
    });

    expect(result.pendingRewardCampaign?.id).toBe("pending-instance");
    expect(result.activeCampaign?.id).toBe("active-instance");
    expect(result.focusCampaign?.id).toBe("pending-instance");
  });

  test("does not expose expired rewards as pending", () => {
    const expired = candidate({
      id: "expired-instance",
      campaign_id: "old-marketing-campaign",
      status: "achieved",
      achieved_at: "2026-08-01T10:00:00.000Z",
      created_at: "2026-08-01T09:00:00.000Z",
    }, { legacyClaimable: true, voucherStatus: "expired" });

    const result = selectCustomerProjectCampaignSummaryEntries({
      candidates: [expired],
      effectiveMarketingCampaignId: "current-marketing-campaign",
    });

    expect(result.pendingRewardCampaign).toBeNull();
    expect(result.activeCampaign).toBeNull();
    expect(result.focusCampaign?.id).toBe("expired-instance");
  });

  test("returns no current activity when there is no effective config", () => {
    const active = candidate({
      id: "legacy-active-instance",
      campaign_id: "old-marketing-campaign",
      status: "active",
      achieved_at: null,
      created_at: "2026-08-01T10:00:00.000Z",
    });

    const result = selectCustomerProjectCampaignSummaryEntries({
      candidates: [active],
      effectiveMarketingCampaignId: undefined,
    });

    expect(result.activeCampaign).toBeNull();
    expect(result.focusCampaign?.id).toBe("legacy-active-instance");
  });

  test("does not treat a null legacy parent as a current marketing campaign", () => {
    const legacyActive = candidate({
      id: "legacy-active-instance",
      campaign_id: null,
      status: "active",
      achieved_at: null,
      created_at: "2026-08-01T10:00:00.000Z",
    });

    const result = selectCustomerProjectCampaignSummaryEntries({
      candidates: [legacyActive],
      effectiveMarketingCampaignId: null,
    });

    expect(result.activeCampaign).toBeNull();
    expect(result.focusCampaign?.id).toBe("legacy-active-instance");
  });

  test("selects the most recently achieved pending reward", () => {
    const olderCreatedButNewerAchieved = candidate({
      id: "newer-achievement",
      campaign_id: "older-marketing-campaign",
      status: "achieved",
      achieved_at: "2026-08-07T10:00:00.000Z",
      created_at: "2026-08-01T10:00:00.000Z",
    }, { legacyClaimable: true, voucherStatus: "active" });
    const newerCreatedButOlderAchieved = candidate({
      id: "older-achievement",
      campaign_id: "newer-marketing-campaign",
      status: "achieved",
      achieved_at: "2026-08-06T10:00:00.000Z",
      created_at: "2026-08-05T10:00:00.000Z",
    }, { legacyClaimable: true, voucherStatus: "active" });

    const result = selectCustomerProjectCampaignSummaryEntries({
      candidates: [newerCreatedButOlderAchieved, olderCreatedButNewerAchieved],
      effectiveMarketingCampaignId: undefined,
    });

    expect(result.pendingRewardCampaign?.id).toBe("newer-achievement");
    expect(result.focusCampaign?.id).toBe("older-achievement");
  });

  test("uses targeted candidates without changing the legacy focus window", () => {
    const legacyActive = candidate({
      id: "legacy-window-active",
      campaign_id: "old-marketing-campaign",
      status: "active",
      achieved_at: null,
      created_at: "2026-08-07T10:00:00.000Z",
    });
    const olderPending = candidate({
      id: "targeted-pending",
      campaign_id: "older-marketing-campaign",
      status: "achieved",
      achieved_at: "2026-07-01T10:00:00.000Z",
      created_at: "2026-07-01T09:00:00.000Z",
    }, { legacyClaimable: true, voucherStatus: "active" });

    const result = selectCustomerProjectCampaignSummaryEntries({
      candidates: [legacyActive, olderPending],
      legacyCandidates: [legacyActive],
      effectiveMarketingCampaignId: "current-marketing-campaign",
    });

    expect(result.pendingRewardCampaign?.id).toBe("targeted-pending");
    expect(result.focusCampaign?.id).toBe("legacy-window-active");
  });
});
