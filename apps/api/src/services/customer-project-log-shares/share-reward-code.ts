interface ShareRewardCodeInput {
  status: "active" | "achieved" | "reward_claimed" | "closed";
  achievedAt: string | null;
  assistCount: number;
  targetAssistCount: number;
  rewardClaimCode: string | null;
}

export function serializeShareRewardCode(
  input: ShareRewardCodeInput,
): string | null {
  const isAchieved = input.status === "achieved"
    || input.status === "reward_claimed"
    || Boolean(input.achievedAt)
    || input.assistCount >= input.targetAssistCount;

  return isAchieved ? input.rewardClaimCode : null;
}
