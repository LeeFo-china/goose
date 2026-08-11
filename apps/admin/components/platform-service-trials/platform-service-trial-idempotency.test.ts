import { describe, expect, test } from 'bun:test';

import { createTrialIdempotencyIntent } from './platform-service-trial-idempotency';

describe('trial admin idempotency intent', () => {
  test('keeps one key for retries and only rotates for a new dialog intent', () => {
    const keys = ['first-key', 'second-key'];
    const intent = createTrialIdempotencyIntent(() => keys.shift()!);

    expect(intent.current()).toBe('first-key');
    expect(intent.current()).toBe('first-key');
    intent.beginNew();
    expect(intent.current()).toBe('second-key');
  });
});
