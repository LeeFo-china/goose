import { describe, expect, mock, test } from "bun:test";

import type { CustomerAppointmentRewardCampaignRow } from "@/repositories/customer-appointment-reward-campaigns";
import type { CustomerProjectLogShareCampaignRow } from "@/repositories/customer-project-log-share-campaigns";

import {
  claimResolvedVoucher,
  decideResolvedClaimVoucher,
  resolveClaimVoucher,
} from "./claim-voucher-resolver";

const shareInstance: CustomerProjectLogShareCampaignRow = {
  id: "share-instance",
  campaign_id: "share-campaign",
  campaign_type: "share_assist",
  share_token: "share-token",
  customer_id: "customer-1",
  project_id: "project-1",
  log_id: "log-1",
  config_id: null,
  status: "achieved",
  channel: "wechat",
  target_assist_count: 3,
  assist_count: 3,
  assist_uv: 3,
  reward_title: "到店礼",
  reward_remark: null,
  reward_claim_status: "unclaimed",
  reward_claim_code: "SHARE-CODE",
  reward_claim_instruction: "到店领取",
  reward_claim_channel: "store",
  reward_claim_requested_at: null,
  reward_claimed_by_employee_id: null,
  reward_claim_voucher_token: "share-voucher",
  reward_claim_voucher_expires_at: "2026-08-07T12:00:00.000Z",
  valid_until: null,
  closed_reason: null,
  latest_opened_at: null,
  latest_assisted_at: null,
  poster_generated_at: null,
  poster_saved_at: null,
  achieved_at: "2026-07-31T10:00:00.000Z",
  reward_claimed_at: null,
  created_at: "2026-07-31T09:00:00.000Z",
  updated_at: "2026-07-31T10:00:00.000Z",
};

const appointmentInstance: CustomerAppointmentRewardCampaignRow = {
  id: "appointment-instance",
  campaign_id: "appointment-campaign",
  campaign_type: "appointment_reward",
  customer_id: "customer-1",
  project_id: "project-1",
  appointment_name: "测试客户",
  appointment_phone: "18800000001",
  appointment_time: "2026-08-01T02:00:00.000Z",
  status: "achieved",
  reward_claim_status: "unclaimed",
  reward_claim_code: "APPOINTMENT-CODE",
  reward_claim_voucher_token: "appointment-voucher",
  achieved_at: "2026-07-31T10:00:00.000Z",
  reward_claimed_at: null,
  reward_claimed_by_employee_id: null,
  reward_claim_channel: null,
  closed_at: null,
  closed_reason: null,
  created_at: "2026-07-31T09:00:00.000Z",
  updated_at: "2026-07-31T10:00:00.000Z",
};

describe("claim voucher resolver", () => {
  test("优先解析好友助力 token 并返回稳定活动类型", async () => {
    const findAppointment = mock(async () => appointmentInstance);
    const result = await resolveClaimVoucher("share-voucher", {
      share: {
        findByVoucherToken: async () => shareInstance,
        claimRewardByVoucherIfUnclaimed: async () => shareInstance,
      },
      appointment: {
        findByVoucherToken: findAppointment,
        claimRewardByVoucherIfUnclaimed: async () => appointmentInstance,
      },
    });

    expect(result?.campaignType).toBe("share_assist");
    expect(result?.instance.id).toBe("share-instance");
    expect(findAppointment).not.toHaveBeenCalled();
  });

  test("好友助力未命中后解析预约有礼 token", async () => {
    const result = await resolveClaimVoucher("appointment-voucher", {
      share: {
        findByVoucherToken: async () => null,
        claimRewardByVoucherIfUnclaimed: async () => null,
      },
      appointment: {
        findByVoucherToken: async () => appointmentInstance,
        claimRewardByVoucherIfUnclaimed: async () => appointmentInstance,
      },
    });

    expect(result?.campaignType).toBe("appointment_reward");
    expect(result?.instance.id).toBe("appointment-instance");
  });

  test("达标后关闭的好友助力仍为 active", () => {
    expect(decideResolvedClaimVoucher({
      campaignType: "share_assist",
      instance: { ...shareInstance, status: "closed" },
    }, new Date("2026-07-31T12:00:00.000Z"))).toMatchObject({
      voucherStatus: "active",
      canClaim: true,
      blockReason: null,
    });
  });

  test("未达标关闭的预约有礼返回 campaign_closed", () => {
    expect(decideResolvedClaimVoucher({
      campaignType: "appointment_reward",
      instance: {
        ...appointmentInstance,
        status: "closed",
        achieved_at: null,
      },
    })).toMatchObject({
      voucherStatus: "invalid",
      canClaim: false,
      blockReason: "campaign_closed",
    });
  });

  test("按活动类型分派条件核销", async () => {
    const claimAppointment = mock(async () => ({
      ...appointmentInstance,
      status: "reward_claimed" as const,
      reward_claim_status: "claimed" as const,
    }));

    const result = await claimResolvedVoucher({
      campaignType: "appointment_reward",
      instance: appointmentInstance,
    }, {
      employeeId: "employee-1",
      channel: "store",
      claimedAt: "2026-07-31T12:00:00.000Z",
    }, {
      share: {
        findByVoucherToken: async () => null,
        claimRewardByVoucherIfUnclaimed: async () => null,
      },
      appointment: {
        findByVoucherToken: async () => appointmentInstance,
        claimRewardByVoucherIfUnclaimed: claimAppointment,
      },
    });

    expect(claimAppointment).toHaveBeenCalledWith({
      id: "appointment-instance",
      voucherToken: "appointment-voucher",
      employeeId: "employee-1",
      channel: "store",
      claimedAt: "2026-07-31T12:00:00.000Z",
    });
    expect(result?.reward_claim_status).toBe("claimed");
  });
});
