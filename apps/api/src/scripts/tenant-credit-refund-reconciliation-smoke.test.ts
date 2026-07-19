import { describe, expect, test } from "bun:test";

import {
  RECONCILIATION_FUNCTION_SIGNATURES,
  buildTenantCreditRefundReconciliationSmokeSummary,
  isInvalidReconciliationLimitError,
} from "./tenant-credit-refund-reconciliation-smoke";

describe("tenant credit refund reconciliation smoke contract", () => {
  test("uses all seven exact service-only function signatures", () => {
    expect(RECONCILIATION_FUNCTION_SIGNATURES).toEqual([
      "public.billing_begin_wechat_recharge_refund(uuid,text,timestamp with time zone)",
      "public.billing_claim_wechat_recharge_refunds(integer,integer,uuid,timestamp with time zone)",
      "public.billing_reschedule_wechat_recharge_refund(uuid,uuid,timestamp with time zone,timestamp with time zone,text,jsonb,text,integer)",
      "public.billing_close_wechat_recharge_refund(uuid,uuid,timestamp with time zone,jsonb)",
      "public.billing_apply_wechat_recharge_refund_callback_state(uuid,text,text,timestamp with time zone,jsonb)",
      "public.billing_confirm_wechat_recharge_refund(uuid,text,text,integer,timestamp with time zone,uuid,jsonb)",
      "public.billing_confirm_claimed_wechat_recharge_refund(uuid,uuid,text,text,integer,timestamp with time zone,jsonb)",
    ]);
  });

  test("builds only the approved secret-free boolean summary", () => {
    expect(
      buildTenantCreditRefundReconciliationSmokeSummary({
        objects: true,
        privileges: true,
        historicalBackfill: true,
        safeMirrorRepair: true,
        invalidLimit: true,
        emptyClaim: true,
        rolledBack: true,
      }),
    ).toEqual({
      objects: true,
      privileges: true,
      historical_backfill: true,
      safe_mirror_repair: true,
      invalid_limit: true,
      empty_claim: true,
      rolled_back: true,
    });
  });

  test("recognizes only the stable invalid-limit database error", () => {
    expect(
      isInvalidReconciliationLimitError(
        new Error("BILLING_RECHARGE_REFUND_RECONCILE_LIMIT_INVALID"),
      ),
    ).toBe(true);
    expect(isInvalidReconciliationLimitError(new Error("other error"))).toBe(
      false,
    );
    expect(isInvalidReconciliationLimitError("not an error")).toBe(false);
  });
});
