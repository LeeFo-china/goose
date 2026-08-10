import { describe, expect, test } from "bun:test";

import * as rpcParsers from "./platform-service-rpc-results";
import {
  acceptedRpcEnvelope,
  RPC_IDS,
  rpcAcceptance,
  rpcContract,
  rpcOrder,
  rpcPeriod,
  rpcRefundRequest,
  rpcWorkOrder,
} from "./platform-service-rpc-result-fixtures.test-helpers";

function expectDbError(run: () => unknown) {
  expect(run).toThrow(expect.objectContaining({ code: "DB_ERROR" }));
}

describe("platform service RPC business fact boundary", () => {
  test("accepts only a consistent first-payment fact matrix", () => {
    const valid = {
      order: rpcOrder(),
      work_order: rpcWorkOrder(),
      access_mode: "paid_onboarding",
      idempotent: false,
      error_code: null,
    };
    expect(rpcParsers.parsePaymentConfirmationResult(valid)).toMatchObject({
      access_mode: "paid_onboarding",
      idempotent: false,
    });

    expectDbError(() => rpcParsers.parsePaymentConfirmationResult({
      ...valid,
      order: rpcOrder({ service_status: "accepted" }),
    }));
    expectDbError(() => rpcParsers.parsePaymentConfirmationResult({
      ...valid,
      work_order: rpcWorkOrder({ service_order_id: RPC_IDS.product }),
    }));
    expectDbError(() => rpcParsers.parsePaymentConfirmationResult({
      ...valid,
      order: rpcOrder({ amount_fen: Number.MAX_SAFE_INTEGER + 1 }),
    }));
    expectDbError(() => rpcParsers.parsePaymentConfirmationResult({
      ...valid,
      order: rpcOrder({ paid_at: "not-rfc3339" }),
    }));
    expectDbError(() => rpcParsers.parsePaymentConfirmationResult({
      ...valid,
      order: rpcOrder({ cancel_claim_expires_at: "not-rfc3339" }),
    }));
    expectDbError(() => rpcParsers.parsePaymentConfirmationResult({
      ...valid,
      order: rpcOrder({ closed_by_employee_id: "not-a-uuid" }),
    }));
  });

  test("applies the SQL access-mode formula to idempotent payment facts", () => {
    const base = {
      order: rpcOrder(),
      work_order: rpcWorkOrder(),
      idempotent: true,
      error_code: null,
    };
    expect(rpcParsers.parsePaymentConfirmationResult({
      ...base,
      access_mode: "paid_onboarding",
    }).access_mode).toBe("paid_onboarding");
    expect(rpcParsers.parsePaymentConfirmationResult({
      ...base,
      order: rpcOrder({ service_status: "accepted" }),
      work_order: rpcWorkOrder({ status: "accepted" }),
      access_mode: null,
    }).access_mode).toBeNull();
    expectDbError(() => rpcParsers.parsePaymentConfirmationResult({
      ...base,
      order: rpcOrder({
        service_access_terminated_at: "2026-08-10T10:30:00.000Z",
        service_access_termination_reason: "full_refund_confirmed",
        service_access_terminated_by_employee_id: RPC_IDS.employee,
      }),
      access_mode: "paid_onboarding",
    }));
  });

  test("discriminates accepted, rejected, and resolved-error acceptance facts", () => {
    expect(rpcParsers.parseAcceptanceResult(acceptedRpcEnvelope())).toMatchObject({
      contract: { id: RPC_IDS.contract },
      contractPeriod: { id: RPC_IDS.period },
    });

    const rejected = {
      order: rpcOrder({ service_status: "rectifying" }),
      work_order: rpcWorkOrder({ status: "rectifying" }),
      acceptance_preparation: rpcAcceptance({ status: "rejected" }),
      contract: null,
      contract_period: null,
      idempotent: false,
      error_code: null,
    };
    expect(rpcParsers.parseAcceptanceResult(rejected)).toMatchObject({
      contract: null,
      contractPeriod: null,
      idempotent: false,
    });
    expect(rpcParsers.parseAcceptanceResult({
      order: null,
      work_order: null,
      acceptance_preparation: null,
      contract: null,
      contract_period: null,
      idempotent: false,
      error_code: "SERVICE_ACCEPTANCE_INVALID_STATE",
    })).toMatchObject({ errorCode: "SERVICE_ACCEPTANCE_INVALID_STATE" });

    expectDbError(() => rpcParsers.parseAcceptanceResult({
      ...acceptedRpcEnvelope(),
      contract_period: rpcPeriod({ tenant_id: RPC_IDS.product }),
    }));
    expectDbError(() => rpcParsers.parseAcceptanceResult({
      ...rejected,
      idempotent: true,
    }));
    expectDbError(() => rpcParsers.parseAcceptanceResult({
      ...acceptedRpcEnvelope(),
      error_code: "SERVICE_ACCEPTANCE_INVALID_STATE",
    }));
  });

  test("uses a dedicated overdue matrix that cannot return rejection", () => {
    expect(typeof rpcParsers.parseOverdueAcceptanceResult).toBe("function");
    if (typeof rpcParsers.parseOverdueAcceptanceResult !== "function") return;
    expectDbError(() => rpcParsers.parseOverdueAcceptanceResult({
      order: rpcOrder({ service_status: "rectifying" }),
      work_order: rpcWorkOrder({ status: "rectifying" }),
      acceptance_preparation: rpcAcceptance({ status: "rejected" }),
      contract: null,
      contract_period: null,
      idempotent: false,
      error_code: null,
    }));

    const notOverdue = {
      order: null,
      work_order: null,
      acceptance_preparation: null,
      contract: null,
      contract_period: null,
      idempotent: false,
      error_code: "SERVICE_ACCEPTANCE_NOT_OVERDUE",
    };
    expect(rpcParsers.parseOverdueAcceptanceResult(notOverdue)).toMatchObject({
      errorCode: "SERVICE_ACCEPTANCE_NOT_OVERDUE",
    });
    expectDbError(() => rpcParsers.parseAcceptanceResult(notOverdue));
  });

  test("accepts only bound full-refund confirmation facts", () => {
    const valid = {
      refund_request: rpcRefundRequest(),
      order: rpcOrder({
        payment_status: "refunded",
        service_status: "canceled",
        service_access_terminated_at: "2026-08-10T10:30:00.000Z",
        service_access_termination_reason: "full_refund_confirmed",
        service_access_terminated_by_employee_id: RPC_IDS.employee,
      }),
      contract: rpcContract({ status: "canceled", last_period_id: null }),
      contract_period: rpcPeriod({
        status: "voided",
        adjustment_reason: "full_order_refund",
        refund_request_id: RPC_IDS.refund,
      }),
      idempotent: false,
      error_code: null,
    };
    expect(rpcParsers.parseRefundConfirmationResult(valid)).toMatchObject({
      refundRequest: { status: "refunded" },
      order: { payment_status: "refunded" },
    });
    expectDbError(() => rpcParsers.parseRefundConfirmationResult({
      ...valid,
      order: rpcOrder({ payment_status: "refunded", service_status: "canceled" }),
    }));
    expectDbError(() => rpcParsers.parseRefundConfirmationResult({
      ...valid,
      contract_period: rpcPeriod({
        status: "voided",
        adjustment_reason: "full_order_refund",
        refund_request_id: RPC_IDS.product,
      }),
    }));
    expectDbError(() => rpcParsers.parseRefundConfirmationResult({
      ...valid,
      contract: null,
    }));
    expectDbError(() => rpcParsers.parseRefundConfirmationResult({
      ...valid,
      refund_request: rpcRefundRequest({ refund_amount_fen: 99 }),
    }));
  });

  test("exposes a strict provider-closed envelope parser", () => {
    const valid = {
      refund_request: rpcRefundRequest({
        status: "cancelled",
        out_refund_no: null,
        wechat_refund_id: null,
        refund_amount_fen: null,
        refunded_at: null,
        refunded_by_employee_id: null,
        provider_refund_status: "CLOSED",
        provider_out_refund_no: "TSRF-CLOSED",
        provider_wechat_refund_id: "WECHAT-CLOSED",
        provider_refund_amount_fen: 100,
        provider_checked_at: "2026-08-10T10:30:00.000Z",
        provider_checked_by_employee_id: RPC_IDS.employee,
      }),
      order: rpcOrder(),
      provider_status: "CLOSED",
      refunded: false,
      access_terminated: false,
      retryable: false,
      idempotent: false,
      error_code: null,
    };
    expect(rpcParsers.parseRefundClosureResult(valid)).toMatchObject({
      providerStatus: "CLOSED",
      refunded: false,
    });
    expectDbError(() => rpcParsers.parseRefundClosureResult({
      ...valid,
      refund_request: {
        ...valid.refund_request,
        provider_refund_amount_fen: 99,
      },
    }));
  });
});
