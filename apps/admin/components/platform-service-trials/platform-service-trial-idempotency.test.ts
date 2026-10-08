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

test('retains retries but rotates when command payload or expected version changes', () => {
  let count = 0;
  const intent = createTrialIdempotencyIntent(() => `intent-${++count}`);
  const payload = { expected_version: 3, scope: { version: 1, capabilities: ['core.projects'] }, reason: '试用' };
  const first = intent.forPayload(payload);
  expect(intent.forPayload({ ...payload })).toBe(first);
  const changed = intent.forPayload({ ...payload, reason: '补齐范围' });
  expect(changed).not.toBe(first);
  expect(intent.forPayload({ ...payload, reason: '补齐范围' })).toBe(changed);
  expect(intent.forPayload({ ...payload, expected_version: 4 })).not.toBe(changed);
  intent.beginNew();
  expect(intent.forPayload(payload)).not.toBe(first);
});
