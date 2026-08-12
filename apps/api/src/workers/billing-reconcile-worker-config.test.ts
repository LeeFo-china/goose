import { afterEach, beforeEach, describe, expect, test } from 'bun:test';

import {
  captureWorkerEnv,
  clearWorkerConfigEnv,
  restoreWorkerEnv,
  setSupabaseTestEnv,
  type WorkerEnv,
} from './billing-reconcile-worker-test-fixtures';

let previousEnv: WorkerEnv;

beforeEach(() => {
  previousEnv = captureWorkerEnv();
  setSupabaseTestEnv();
  clearWorkerConfigEnv();
});

afterEach(() => restoreWorkerEnv(previousEnv));

async function config() {
  const { getWorkerConfig } = await import('./billing-reconcile-worker');
  return getWorkerConfig();
}

describe('billing reconcile worker config', () => {
  test('uses the enabled bounded defaults', async () => {
    expect(await config()).toEqual({
      enabled: true, intervalMs: 60_000, batchSize: 100,
      rechargeExpirationBatchSize: 50,
      brandingAddonExpirationBatchSize: 50,
      brandingVirtualPaymentBatchSize: 20,
      refundBatchSize: 20,
      serviceTrialReminderBatchSize: 50,
    });
  });

  test('falls back for blank and invalid refund batch sizes', async () => {
    process.env.BILLING_REFUND_RECONCILE_BATCH_SIZE = ' ';
    expect((await config()).refundBatchSize).toBe(20);
    process.env.BILLING_REFUND_RECONCILE_BATCH_SIZE = 'invalid';
    expect((await config()).refundBatchSize).toBe(20);
  });

  test('clamps refund batch size to 1 through 100', async () => {
    process.env.BILLING_REFUND_RECONCILE_BATCH_SIZE = '0';
    expect((await config()).refundBatchSize).toBe(1);
    process.env.BILLING_REFUND_RECONCILE_BATCH_SIZE = '500';
    expect((await config()).refundBatchSize).toBe(100);
  });

  test('keeps the existing subscription and interval bounds', async () => {
    process.env.BILLING_RECONCILE_BATCH_SIZE = '500';
    process.env.BILLING_RECONCILE_INTERVAL_MS = '1';
    expect(await config()).toMatchObject({ batchSize: 100, intervalMs: 10_000 });
  });
});
