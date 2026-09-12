import { describe, expect, test } from 'bun:test';
import { RenderingPhoneBindSchema } from './customer-renderings';

const idempotencyKey = '11111111-1111-4111-8111-111111111111';

describe('customer rendering request schemas', () => {
  test('accepts only a server-verifiable phone bind command', () => {
    expect(RenderingPhoneBindSchema.parse({ idempotency_key: idempotencyKey }))
      .toEqual({ idempotency_key: idempotencyKey });

    for (const extra of [
      { phone: '13800138000' },
      { verified: true },
      { tenant_id: idempotencyKey },
    ]) {
      expect(RenderingPhoneBindSchema.safeParse({
        idempotency_key: idempotencyKey,
        ...extra,
      }).success).toBe(false);
    }
  });

  test('requires a UUID idempotency key', () => {
    expect(RenderingPhoneBindSchema.safeParse({}).success).toBe(false);
    expect(RenderingPhoneBindSchema.safeParse({ idempotency_key: 'retry-1' }).success)
      .toBe(false);
  });
});
