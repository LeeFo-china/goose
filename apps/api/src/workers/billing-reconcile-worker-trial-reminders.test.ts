import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';

import {
  BRANDING_VIRTUAL_PAYMENT_RESULT,
  captureWorkerEnv,
  clearWorkerConfigEnv,
  restoreWorkerEnv,
  setSupabaseTestEnv,
  type WorkerEnv,
} from './billing-reconcile-worker-test-fixtures';

let previousEnv: WorkerEnv;
const subscription = { ensured: 0, reminded: 0, charged: 0, locked: 0,
  skipped: 0, errors: [] };
const expiration = { claimed: 0, paid: 0, closed: 0, retried: 0,
  failed: 0, release_failed: 0 };
const refund = { claimed: 0, success: 0, processing: 0, closed: 0,
  abnormal: 0, rescheduled: 0, failed: 0 };
const reminder = { claimed: 2, sent: 2, failed: 0, errors: [] };

beforeEach(() => {
  previousEnv = captureWorkerEnv();
  setSupabaseTestEnv();
  clearWorkerConfigEnv();
});

afterEach(() => restoreWorkerEnv(previousEnv));

function dependencies() {
  return {
    subscriptionService: { runDueChecks: mock(async () => subscription) },
    rechargeExpirationService: { runExpiredOrderChecks: mock(async () => expiration) },
    brandingAddonExpirationService: { runExpiredOrderChecks: mock(async () => expiration) },
    brandingVirtualPaymentReconciliationService: {
      reconcile: mock(async () => BRANDING_VIRTUAL_PAYMENT_RESULT),
    },
    refundReconciliationService: { runBatch: mock(async () => refund) },
    trialReminderService: { runReminderBatch: mock(async () => reminder) },
    healthEvidence: { markHealthy: mock(async () => {}) },
    logger: mock(() => {}),
  };
}

describe('billing reconcile trial reminders', () => {
  test('defaults and clamps the independent reminder batch size', async () => {
    const { getWorkerConfig } = await import('./billing-reconcile-worker');
    expect(getWorkerConfig().serviceTrialReminderBatchSize).toBe(50);
    process.env.BILLING_SERVICE_TRIAL_REMINDER_BATCH_SIZE = '0';
    expect(getWorkerConfig().serviceTrialReminderBatchSize).toBe(1);
    process.env.BILLING_SERVICE_TRIAL_REMINDER_BATCH_SIZE = '500';
    expect(getWorkerConfig().serviceTrialReminderBatchSize).toBe(100);
  });

  test('runs reminders with a bounded batch and emits only scalar summary', async () => {
    const deps = dependencies();
    const { tick } = await import('./billing-reconcile-worker');
    await tick(deps);

    expect(deps.trialReminderService.runReminderBatch)
      .toHaveBeenCalledWith({ limit: 50 });
    expect(JSON.stringify(deps.logger.mock.calls)).toContain(
      '"trial_reminders":{"status":"fulfilled","result":{"claimed":2,"sent":2,"failed":0}}',
    );
    expect(deps.healthEvidence.markHealthy).toHaveBeenCalledTimes(1);
  });

  test('isolates a reminder failure and does not refresh health', async () => {
    const deps = dependencies();
    deps.trialReminderService.runReminderBatch = mock(async () => {
      throw new Error('distinctive reminder secret');
    });
    const { tick } = await import('./billing-reconcile-worker');
    await tick(deps);

    expect(deps.refundReconciliationService.runBatch).toHaveBeenCalledTimes(1);
    expect(deps.healthEvidence.markHealthy).not.toHaveBeenCalled();
    const logged = JSON.stringify(deps.logger.mock.calls);
    expect(logged).toContain('"trial_reminders":{"status":"rejected"}');
    expect(logged).not.toContain('distinctive reminder secret');
  });

  test('writes health only after the reminder child settles', async () => {
    const deps = dependencies();
    let release: (() => void) | undefined;
    deps.trialReminderService.runReminderBatch = mock(() => new Promise((resolve) => {
      release = () => resolve(reminder);
    }));
    const { tick } = await import('./billing-reconcile-worker');
    const runningTick = tick(deps);
    await Bun.sleep(0);
    expect(deps.healthEvidence.markHealthy).not.toHaveBeenCalled();
    release?.();
    await runningTick;
    expect(deps.healthEvidence.markHealthy).toHaveBeenCalledTimes(1);
  });
});
