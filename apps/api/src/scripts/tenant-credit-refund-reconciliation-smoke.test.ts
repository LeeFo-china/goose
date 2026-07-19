import { describe, expect, test } from "bun:test";

import {
  RECONCILIATION_FUNCTION_SIGNATURES,
  TENANT_CREDIT_REFUND_RECONCILIATION_SMOKE_FAILED,
  buildTenantCreditRefundReconciliationSmokeSummary,
  isInvalidReconciliationLimitError,
  runTenantCreditRefundReconciliationSmokeCli,
} from "./tenant-credit-refund-reconciliation-smoke";

function postgresError(
  message: string,
  input: {
    code?: string;
    errno?: string;
  } = {},
): Bun.SQL.PostgresError {
  return new Bun.SQL.PostgresError(message, {
    code: input.code ?? "ERR_POSTGRES_SERVER_ERROR",
    errno: input.errno ?? "22023",
  });
}

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
        postgresError("BILLING_RECHARGE_REFUND_RECONCILE_LIMIT_INVALID"),
      ),
    ).toBe(true);
    expect(
      isInvalidReconciliationLimitError(
        postgresError("BILLING_RECHARGE_REFUND_RECONCILE_LIMIT_INVALID", {
          errno: "23505",
        }),
      ),
    ).toBe(false);
    expect(
      isInvalidReconciliationLimitError(
        postgresError("BILLING_RECHARGE_REFUND_RECONCILE_LIMIT_INVALID", {
          code: "OTHER_DATABASE_ERROR",
        }),
      ),
    ).toBe(false);
    expect(
      isInvalidReconciliationLimitError(
        postgresError(
          "prefix BILLING_RECHARGE_REFUND_RECONCILE_LIMIT_INVALID suffix",
        ),
      ),
    ).toBe(false);
    expect(
      isInvalidReconciliationLimitError(
        new Error("BILLING_RECHARGE_REFUND_RECONCILE_LIMIT_INVALID", {
          cause: postgresError(
            "BILLING_RECHARGE_REFUND_RECONCILE_LIMIT_INVALID",
          ),
        }),
      ),
    ).toBe(false);
    expect(
      isInvalidReconciliationLimitError(
        new Error("other BILLING_RECHARGE_REFUND_RECONCILE_LIMIT_INVALID error"),
      ),
    ).toBe(false);
    expect(isInvalidReconciliationLimitError(new Error("other error"))).toBe(
      false,
    );
    expect(isInvalidReconciliationLimitError("not an error")).toBe(false);
  });

  test("returns only a fixed safe CLI error when the database layer fails", async () => {
    const secretMarker = "postgres://secret-user:secret-pass@secret.invalid/db";
    const stdout: string[] = [];
    const stderr: string[] = [];

    const exitCode = await runTenantCreditRefundReconciliationSmokeCli({
      databaseUrl: secretMarker,
      runSmoke: async () => {
        throw new Error(`connection failed: ${secretMarker}`);
      },
      writeStdout: (message) => stdout.push(message),
      writeStderr: (message) => stderr.push(message),
    });

    expect(exitCode).toBe(1);
    expect(stdout).toEqual([]);
    expect(stderr).toEqual([
      TENANT_CREDIT_REFUND_RECONCILIATION_SMOKE_FAILED,
    ]);
    expect(JSON.stringify({ exitCode, stdout, stderr })).not.toContain(
      secretMarker,
    );
    expect(JSON.stringify({ exitCode, stdout, stderr })).not.toContain(
      "secret-pass",
    );
  });
});
