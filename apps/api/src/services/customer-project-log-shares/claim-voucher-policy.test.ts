import { describe, expect, test } from "bun:test";

import {
  decideClaimVoucher,
  type ClaimVoucherBlockReason,
  type ClaimVoucherDecisionInput,
  type ClaimVoucherStatus,
} from "./claim-voucher-policy";

const NOW = new Date("2026-07-31T12:00:00.000Z");
type DecisionTuple = [ClaimVoucherStatus, boolean, ClaimVoucherBlockReason];
type DecisionCase = [
  string,
  Partial<ClaimVoucherDecisionInput>,
  DecisionTuple,
];

describe("decideClaimVoucher", () => {
  test.each<DecisionCase>([
    [
      "已领取优先于过期",
      {
        isClaimed: true,
        expiresAt: "2026-07-30T00:00:00.000Z",
      },
      ["claimed", false, "already_claimed"],
    ],
    [
      "已过期优先于活动关闭",
      {
        isClosed: true,
        expiresAt: "2026-07-30T00:00:00.000Z",
      },
      ["expired", false, "voucher_expired"],
    ],
    [
      "未达标且已关闭",
      { isClosed: true },
      ["invalid", false, "campaign_closed"],
    ],
    [
      "未达标且未关闭",
      {},
      ["invalid", false, "campaign_not_achieved"],
    ],
    [
      "已达标且未领取",
      { isAchieved: true },
      ["active", true, null],
    ],
    [
      "达标后关闭仍可领取",
      { isAchieved: true, isClosed: true },
      ["active", true, null],
    ],
  ])("%s", (_name, overrides, expected) => {
    const result = decideClaimVoucher({
      hasVoucherToken: true,
      isClaimed: false,
      isClosed: false,
      isAchieved: false,
      expiresAt: null,
      now: NOW,
      ...overrides,
    });

    expect([
      result.voucherStatus,
      result.canClaim,
      result.blockReason,
    ]).toEqual(expected);
  });

  test("缺少 voucher token 时返回无效凭证", () => {
    expect(decideClaimVoucher({
      hasVoucherToken: false,
      isClaimed: false,
      isClosed: false,
      isAchieved: true,
      expiresAt: null,
      now: NOW,
    })).toEqual({
      voucherStatus: "invalid",
      canClaim: false,
      blockReason: "voucher_invalid",
    });
  });

  test("过期时间等于当前时间时仍有效", () => {
    expect(decideClaimVoucher({
      hasVoucherToken: true,
      isClaimed: false,
      isClosed: false,
      isAchieved: true,
      expiresAt: NOW.toISOString(),
      now: NOW,
    }).canClaim).toBe(true);
  });
});
