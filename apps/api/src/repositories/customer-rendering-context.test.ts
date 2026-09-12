import { beforeAll, describe, expect, mock, test } from 'bun:test';

process.env.SUPABASE_URL ??= 'http://127.0.0.1:54321';
process.env.SUPABASE_PUBLISH ??= 'test-publish-key';
process.env.SUPABASE_SERVICE_ROLE_KEY ??= 'test-service-role-key';

let Repository: typeof import('./customer-rendering-context').CustomerRenderingContextRepository;
beforeAll(async () => {
  ({ CustomerRenderingContextRepository: Repository } = await import('./customer-rendering-context'));
});

type Result = { data: unknown; error: unknown };
type Call = { method: string; args: unknown[] };

function harness(result: Result) {
  const calls: Call[] = [];
  class Query {
    select(...args: unknown[]) { calls.push({ method: 'select', args }); return this; }
    eq(...args: unknown[]) { calls.push({ method: 'eq', args }); return this; }
    gt(...args: unknown[]) { calls.push({ method: 'gt', args }); return this; }
    order(...args: unknown[]) { calls.push({ method: 'order', args }); return this; }
    limit(...args: unknown[]) { calls.push({ method: 'limit', args }); return this; }
    maybeSingle() { calls.push({ method: 'maybeSingle', args: [] }); return Promise.resolve(result); }
  }
  return {
    client: { from: mock((table: string) => {
      calls.push({ method: 'from', args: [table] });
      return new Query();
    }) },
    calls,
  };
}

describe('customer rendering context repository', () => {
  test('reads one current selected visitor tenant with bounded fields', async () => {
    const selectedTenantId = '11111111-1111-4111-8111-111111111111';
    const { client, calls } = harness({
      data: { selected_tenant_id: selectedTenantId },
      error: null,
    });
    const repository = new Repository(client as never);

    await expect(repository.findLatestSelectedVisitorTenant('visitor-1', '2026-09-12T00:00:00.000Z'))
      .resolves.toBe(selectedTenantId);
    expect(calls).toContainEqual({ method: 'from', args: ['user_location_contexts'] });
    expect(calls).toContainEqual({ method: 'select', args: ['selected_tenant_id'] });
    expect(calls).toContainEqual({ method: 'eq', args: ['visitor_id', 'visitor-1'] });
    expect(calls).toContainEqual({ method: 'eq', args: ['selection_status', 'selected'] });
    expect(calls).toContainEqual({ method: 'limit', args: [1] });
  });

  test('returns only an active tenant identity', async () => {
    const tenant = {
      id: '11111111-1111-4111-8111-111111111111',
      status: 'active' as const,
    };
    const { client, calls } = harness({ data: tenant, error: null });
    const repository = new Repository(client as never);

    await expect(repository.findActiveTenant(tenant.id)).resolves.toEqual(tenant);
    expect(calls).toContainEqual({ method: 'from', args: ['tenants'] });
    expect(calls).toContainEqual({ method: 'select', args: ['id,status'] });
    expect(calls).toContainEqual({ method: 'eq', args: ['status', 'active'] });
    expect(calls).toContainEqual({ method: 'limit', args: [1] });
  });
});
