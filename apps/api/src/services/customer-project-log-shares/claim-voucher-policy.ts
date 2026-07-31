export type ClaimVoucherStatus = "active" | "claimed" | "expired" | "invalid";

export type ClaimVoucherBlockReason =
  | "already_claimed"
  | "voucher_expired"
  | "campaign_not_achieved"
  | "campaign_closed"
  | "voucher_invalid"
  | null;

export interface ClaimVoucherDecisionInput {
  hasVoucherToken: boolean;
  isClaimed: boolean;
  isClosed: boolean;
  isAchieved: boolean;
  expiresAt: string | null;
  now?: Date;
}

export interface ClaimVoucherDecision {
  voucherStatus: ClaimVoucherStatus;
  canClaim: boolean;
  blockReason: ClaimVoucherBlockReason;
}

function blocked(
  voucherStatus: Exclude<ClaimVoucherStatus, "active">,
  blockReason: Exclude<ClaimVoucherBlockReason, null>,
): ClaimVoucherDecision {
  return {
    voucherStatus,
    canClaim: false,
    blockReason,
  };
}

export function decideClaimVoucher(
  input: ClaimVoucherDecisionInput,
): ClaimVoucherDecision {
  if (!input.hasVoucherToken) {
    return blocked("invalid", "voucher_invalid");
  }

  if (input.isClaimed) {
    return blocked("claimed", "already_claimed");
  }

  const expiresAtMs = input.expiresAt
    ? new Date(input.expiresAt).getTime()
    : Number.NaN;
  if (
    Number.isFinite(expiresAtMs)
    && expiresAtMs < (input.now ?? new Date()).getTime()
  ) {
    return blocked("expired", "voucher_expired");
  }

  if (!input.isAchieved && input.isClosed) {
    return blocked("invalid", "campaign_closed");
  }

  if (!input.isAchieved) {
    return blocked("invalid", "campaign_not_achieved");
  }

  return {
    voucherStatus: "active",
    canClaim: true,
    blockReason: null,
  };
}
