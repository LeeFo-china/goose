import { expect, test } from 'bun:test';
import { CustomerLeadListQuerySchema } from './customer-lead-query';
import { CUSTOMER_LEAD_SOURCE_VALUES, CUSTOMER_LEAD_SOURCE_LABELS } from './customer-lead';

test('customer leads accept H5 and mixed queries but keep unknown sources closed', () => {
  expect(CustomerLeadListQuerySchema.safeParse({ source: 'h5' }).success).toBe(true);
  expect(CustomerLeadListQuerySchema.parse({})).not.toHaveProperty('source');
  expect(CUSTOMER_LEAD_SOURCE_VALUES).toEqual(['douyin_miniapp', 'h5']);
  expect(CUSTOMER_LEAD_SOURCE_LABELS).toMatchObject({ h5: 'H5活动' });
  expect(CustomerLeadListQuerySchema.safeParse({ source: 'platform' }).success).toBe(false);
});
