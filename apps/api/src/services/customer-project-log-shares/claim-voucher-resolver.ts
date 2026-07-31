import type { CustomerAppointmentRewardCampaignRow } from "@/repositories/customer-appointment-reward-campaigns";
import type { CustomerProjectLogShareCampaignRow } from "@/repositories/customer-project-log-share-campaigns";

import {
  decideClaimVoucher,
  type ClaimVoucherDecision,
} from "./claim-voucher-policy";

export type ResolvedClaimVoucher =
  | {
    campaignType: "share_assist";
    instance: CustomerProjectLogShareCampaignRow;
  }
  | {
    campaignType: "appointment_reward";
    instance: CustomerAppointmentRewardCampaignRow;
  };

interface ClaimVoucherRepository<TInstance> {
  findByVoucherToken(voucherToken: string): Promise<TInstance | null>;
  claimRewardByVoucherIfUnclaimed(input: {
    id: string;
    voucherToken: string;
    employeeId: string;
    channel: string;
    claimedAt: string;
  }): Promise<TInstance | null>;
}

export interface ClaimVoucherRepositories {
  share: ClaimVoucherRepository<CustomerProjectLogShareCampaignRow>;
  appointment: ClaimVoucherRepository<CustomerAppointmentRewardCampaignRow>;
}

export async function resolveClaimVoucher(
  voucherToken: string,
  repositories: ClaimVoucherRepositories,
): Promise<ResolvedClaimVoucher | null> {
  const shareInstance = await repositories.share.findByVoucherToken(voucherToken);
  if (shareInstance) {
    return {
      campaignType: "share_assist",
      instance: shareInstance,
    };
  }

  const appointmentInstance = await repositories.appointment
    .findByVoucherToken(voucherToken);
  if (!appointmentInstance) {
    return null;
  }

  return {
    campaignType: "appointment_reward",
    instance: appointmentInstance,
  };
}

export function decideResolvedClaimVoucher(
  resolved: ResolvedClaimVoucher,
  now?: Date,
): ClaimVoucherDecision {
  if (resolved.campaignType === "share_assist") {
    const { instance } = resolved;
    return decideClaimVoucher({
      hasVoucherToken: Boolean(instance.reward_claim_voucher_token),
      isClaimed:
        instance.status === "reward_claimed"
        || instance.reward_claim_status === "claimed",
      isClosed: instance.status === "closed",
      isAchieved:
        instance.status === "achieved"
        || Boolean(instance.achieved_at)
        || instance.assist_count >= instance.target_assist_count,
      expiresAt: instance.reward_claim_voucher_expires_at,
      now,
    });
  }

  const { instance } = resolved;
  return decideClaimVoucher({
    hasVoucherToken: Boolean(instance.reward_claim_voucher_token),
    isClaimed:
      instance.status === "reward_claimed"
      || instance.reward_claim_status === "claimed",
    isClosed: instance.status === "closed",
    isAchieved: instance.status === "achieved" || Boolean(instance.achieved_at),
    expiresAt: null,
    now,
  });
}

export async function claimResolvedVoucher(
  resolved: ResolvedClaimVoucher,
  input: {
    employeeId: string;
    channel: string;
    claimedAt: string;
  },
  repositories: ClaimVoucherRepositories,
): Promise<CustomerProjectLogShareCampaignRow | CustomerAppointmentRewardCampaignRow | null> {
  const voucherToken = resolved.instance.reward_claim_voucher_token;
  if (!voucherToken) {
    return null;
  }

  const claimInput = {
    id: resolved.instance.id,
    voucherToken,
    employeeId: input.employeeId,
    channel: input.channel,
    claimedAt: input.claimedAt,
  };

  return resolved.campaignType === "share_assist"
    ? repositories.share.claimRewardByVoucherIfUnclaimed(claimInput)
    : repositories.appointment.claimRewardByVoucherIfUnclaimed(claimInput);
}
