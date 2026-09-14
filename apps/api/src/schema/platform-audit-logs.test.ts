import { expect, test } from 'bun:test';
import { PlatformAuditLogListQuerySchema } from './platform-audit-logs';

test('platform audit query accepts a paginated tenant rendering settings filter', () => {
  const parsed = PlatformAuditLogListQuerySchema.safeParse({
    page: '1', pageSize: '10', action: 'customer_rendering_settings_update',
    target_tenant_id: '11111111-1111-4111-8111-111111111111',
    resource_type: 'tenant_customer_rendering_settings',
  });
  expect(parsed.success).toBe(true);
  if (parsed.success) {
    expect(parsed.data).toMatchObject({ page: 1, pageSize: 10,
      action: 'customer_rendering_settings_update' });
  }
});
