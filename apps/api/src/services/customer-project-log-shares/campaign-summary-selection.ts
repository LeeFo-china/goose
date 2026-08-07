import type { RewardClaimVoucherStatus } from "./legacy/shared";

type CampaignIdentity = {
  id: string;
  campaign_id: string | null;
  status: "active" | "achieved" | "reward_claimed" | "closed";
  achieved_at: string | null;
  created_at: string;
};

export type CustomerProjectCampaignCandidate<TCampaign extends CampaignIdentity> = {
  campaign: TCampaign;
  isLegacyRewardClaimable: boolean;
  voucherStatus: RewardClaimVoucherStatus | null;
};

function getTime(value: string | null): number {
  if (!value) return 0;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function selectLatest<TCampaign extends CampaignIdentity>(
  candidates: Array<CustomerProjectCampaignCandidate<TCampaign>>,
  getCandidateTime: (campaign: TCampaign) => string | null,
): TCampaign | null {
  return candidates.reduce<TCampaign | null>((latest, item) => {
    if (!latest) return item.campaign;
    return getTime(getCandidateTime(item.campaign)) > getTime(getCandidateTime(latest))
      ? item.campaign
      : latest;
  }, null);
}

export function selectCustomerProjectCampaignSummaryEntries<
  TCampaign extends CampaignIdentity,
>(input: {
  candidates: Array<CustomerProjectCampaignCandidate<TCampaign>>;
  legacyCandidates?: Array<CustomerProjectCampaignCandidate<TCampaign>>;
  effectiveMarketingCampaignId: string | null | undefined;
}) {
  const pendingRewardCandidates = input.candidates.filter(
    (item) => item.voucherStatus === "active",
  );
  const pendingRewardCampaign = selectLatest(
    pendingRewardCandidates,
    (campaign) => campaign.achieved_at || campaign.created_at,
  );
  const activeCampaign = typeof input.effectiveMarketingCampaignId === "string"
    ? selectLatest(input.candidates.filter((item) => (
      item.campaign.status === "active"
      && item.voucherStatus !== "active"
      && item.campaign.campaign_id === input.effectiveMarketingCampaignId
    )), (campaign) => campaign.created_at)
    : null;
  const legacyCandidates = input.legacyCandidates ?? input.candidates;
  const legacyClaimableCampaign = legacyCandidates.find(
    (item) => item.isLegacyRewardClaimable,
  )?.campaign ?? null;
  const legacyActiveCampaign = legacyCandidates.find(
    (item) => item.campaign.status === "active",
  )?.campaign ?? null;
  const claimedCampaign = legacyCandidates.find(
    (item) => item.campaign.status === "reward_claimed",
  )?.campaign ?? null;

  return {
    pendingRewardCampaign,
    activeCampaign,
    focusCampaign:
      legacyClaimableCampaign
      || legacyActiveCampaign
      || claimedCampaign,
  };
}
