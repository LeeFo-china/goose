import type { BillingDueCheckResult } from '@/services/billing-subscriptions';
import type { BillingRechargeExpirationTelemetry } from '@/services/billing-recharge-expiration';
import type { BrandingAddonExpirationTelemetry } from '@/services/branding-addon-expiration';
import type {
  BrandingVirtualReconciliationTelemetry,
} from '@/services/branding-virtual-payment-reconciliation';
import type { RefundReconciliationSummary } from '@/services/billing-recharge-refund-reconciliation';

export function summarizeSubscriptionResult(result: BillingDueCheckResult) {
  return {
    ensured: result.ensured, reminded: result.reminded, charged: result.charged,
    locked: result.locked, skipped: result.skipped, error_count: result.errors.length,
  };
}

export function summarizeRefundResult(result: RefundReconciliationSummary) {
  return {
    claimed: result.claimed, success: result.success,
    processing: result.processing, closed: result.closed,
    abnormal: result.abnormal, rescheduled: result.rescheduled,
    failed: result.failed,
  };
}

export function summarizeExpirationResult(
  result: BillingRechargeExpirationTelemetry | BrandingAddonExpirationTelemetry,
) {
  return {
    claimed: result.claimed, paid: result.paid, closed: result.closed,
    retried: result.retried, failed: result.failed,
    release_failed: result.release_failed,
  };
}

export function summarizeBrandingVirtualPaymentResult(
  result: BrandingVirtualReconciliationTelemetry,
) {
  return {
    claimed: result.claimed, queried: result.queried,
    confirmed: result.confirmed, closed: result.closed,
    failed: result.failed, grant_recovered: result.grantRecovered,
    ...(result.refundClaimed === undefined ? {} : {
      refund_claimed: result.refundClaimed,
      refund_queried: result.refundQueried ?? 0,
      refund_succeeded: result.refundSucceeded ?? 0,
      refund_failed: result.refundFailed ?? 0,
      refund_compensated: result.refundCompensated ?? 0,
      refund_pending: result.refundPending ?? 0,
      refund_rescheduled: result.refundRescheduled ?? 0,
      refund_terminal_failed: result.refundTerminalFailed ?? 0,
      refund_conflicts: result.refundConflicts ?? 0,
    }),
  };
}

export function summarizeTrialReminderResult(result: {
  claimed: number; sent: number; failed: number;
}) {
  return { claimed: result.claimed, sent: result.sent, failed: result.failed };
}

export async function loadDefaultRechargeExpirationService() {
  const { billingRechargeExpirationService } = await import(
    '@/services/billing-recharge-expiration'
  );
  return billingRechargeExpirationService;
}

export async function loadDefaultBrandingAddonExpirationService() {
  const { brandingAddonExpirationService } = await import(
    '@/services/branding-addon-expiration'
  );
  return brandingAddonExpirationService;
}

export async function loadDefaultBrandingVirtualPaymentService() {
  const [paymentModule, refundModule] = await Promise.all([
    import('@/services/branding-virtual-payment-reconciliation'),
    import('@/services/branding-virtual-refund-reconciliation'),
  ]);
  return {
    reconcile: async (input: { batchSize: number }) => {
      const [payment, refund] = await Promise.all([
        paymentModule.brandingVirtualPaymentReconciliationService.reconcile(input),
        refundModule.brandingVirtualRefundReconciliationService.reconcile(input),
      ]);
      return { ...payment, ...refund, failed: payment.failed + refund.refundFailed };
    },
  };
}

export async function loadDefaultTrialReminderService() {
  const { platformServiceTrialOperationsService } = await import(
    '@/services/platform-service-trial-operations'
  );
  return platformServiceTrialOperationsService;
}
