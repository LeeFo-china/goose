import { mock } from "bun:test";

import type {
  ClaimedRefund,
  ClaimDueRefundsInput,
  CloseClaimedRefundInput,
  ConfirmClaimedRefundInput,
  ConfirmRefundResult,
  RescheduleClaimedRefundInput,
} from "@/repositories/billing-recharge-refund-reconciliation";

export const NOW = new Date("2026-07-19T02:00:00.000Z");
export const CLAIM_TOKEN = "00000000-0000-4000-8000-000000000001";

export const secretBundle = {
  privateKeyPem: "private-key",
  apiV3Key: "api-v3-key",
  wechatPayPublicKeyId: "PUB_KEY_ID_1",
  wechatPayPublicKeyPem: "public-key",
  baseUrl: "https://api.mch.weixin.qq.com",
  revision: "bundle-revision-1",
};

export function createClaim(
  overrides: Partial<ClaimedRefund> = {},
): ClaimedRefund {
  return {
    id: "10000000-0000-4000-8000-000000000001",
    tenant_id: "20000000-0000-4000-8000-000000000001",
    order_id: "30000000-0000-4000-8000-000000000001",
    reason: "客户误充值",
    requested_amount_fen: 10_000,
    out_refund_no: "TRR202607190001",
    wechat_refund_id: "5030000000202607190000000001",
    refund_amount_fen: 10_000,
    reconcile_attempt_count: 2,
    order: {
      id: "30000000-0000-4000-8000-000000000001",
      tenant_id: "20000000-0000-4000-8000-000000000001",
      amount_fen: 10_000,
      paid_amount_fen: 10_000,
      payment_config_id: "payment-config-1",
      out_trade_no: "TC202607190001",
      transaction_id: "420000000000000001",
    },
    config: {
      id: "payment-config-1",
      merchant_mode: "direct_merchant",
      merchant_id: "1900000109",
      sub_merchant_id: null,
      app_id: "wx-app-id",
      sub_app_id: null,
      encrypted_config_ref: "secret://wechat-pay-config-1",
      secret_bundle_revision: "bundle-revision-1",
      serial_no: "SERIAL-1",
      notify_url: "https://api.example.com/pay/wechat/callback",
    },
    ...overrides,
  };
}

export function createWechatRefundPayload(
  claim: ClaimedRefund,
  status = "PROCESSING",
) {
  return {
    out_refund_no: claim.out_refund_no ?? "",
    refund_id: claim.wechat_refund_id ?? "5030000000202607190000000001",
    transaction_id: claim.order?.transaction_id ?? "",
    out_trade_no: claim.order?.out_trade_no ?? "",
    status,
    ...(status === "SUCCESS"
      ? { success_time: "2026-07-19T10:01:02+08:00" }
      : {}),
    amount: {
      refund: claim.requested_amount_fen,
      total: claim.order?.paid_amount_fen ?? claim.order?.amount_fen ?? 0,
      currency: "CNY",
    },
    requestId: "wechat-request-id-1",
  };
}

export function createHarness(claims: ClaimedRefund[] = [createClaim()]) {
  const repository = {
    claimDue: mock(async (_input: ClaimDueRefundsInput) => claims),
    reschedule: mock(async (_input: RescheduleClaimedRefundInput) => true),
    close: mock(async (_input: CloseClaimedRefundInput) => true),
    confirmSuccess: mock(async (
      _input: ConfirmClaimedRefundInput,
    ): Promise<ConfirmRefundResult | null> => ({
      request: null,
      order: null,
      account: null,
      ledger: null,
      idempotent: false,
    })),
  };
  const secretBundleService = {
    load: mock(async () => secretBundle),
  };
  const wechatPayGateway = {
    queryRefundByOutRefundNo: mock(async () =>
      createWechatRefundPayload(claims[0] ?? createClaim())
    ),
    requestRefund: mock(async () =>
      createWechatRefundPayload(claims[0] ?? createClaim())
    ),
  };
  return { repository, secretBundleService, wechatPayGateway };
}
