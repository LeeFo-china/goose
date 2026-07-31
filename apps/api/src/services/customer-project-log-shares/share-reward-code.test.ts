import { describe, expect, test } from "bun:test";

import { serializeShareRewardCode } from "./share-reward-code";

const base = {
  status: "active" as const,
  achievedAt: null,
  assistCount: 1,
  targetAssistCount: 3,
  rewardClaimCode: null,
};

describe("serializeShareRewardCode", () => {
  test("未达标时不返回合成领奖码", () => {
    expect(serializeShareRewardCode(base)).toBeNull();
  });

  test("达标后只返回真实领奖码", () => {
    expect(serializeShareRewardCode({
      ...base,
      status: "achieved",
      assistCount: 3,
      achievedAt: "2026-07-31T12:00:00.000Z",
      rewardClaimCode: "REAL-CODE",
    })).toBe("REAL-CODE");
  });

  test("已领取时保留真实领奖码供历史核对", () => {
    expect(serializeShareRewardCode({
      ...base,
      status: "reward_claimed",
      rewardClaimCode: "REAL-CODE",
    })).toBe("REAL-CODE");
  });

  test("达标但真实领奖码缺失时仍返回 null", () => {
    expect(serializeShareRewardCode({
      ...base,
      status: "achieved",
      achievedAt: "2026-07-31T12:00:00.000Z",
    })).toBeNull();
  });
});
