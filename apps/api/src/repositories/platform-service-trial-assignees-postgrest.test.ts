import { describe, expect, test } from 'bun:test';
import { createClient } from '@supabase/supabase-js';

process.env.SUPABASE_URL ??= 'http://127.0.0.1:54321';
process.env.SUPABASE_PUBLISH ??= 'test-publish-key';
process.env.SUPABASE_SERVICE_ROLE_KEY ??= 'test-service-role-key';

const EMPLOYEE_ID = '11111111-1111-4111-8111-111111111111';
const ROLE_ID = '44444444-4444-4444-8444-444444444444';

describe('PlatformServiceTrialAssigneesRepository PostgREST contract', () => {
  test('serializes literal role and escaped keyword filters', async () => {
    const requests: Request[] = [];
    const fetchStub = (async (
      input: string | URL | Request,
      init?: RequestInit,
    ) => {
      const request = input instanceof Request
        ? input
        : new Request(input.toString(), init);
      requests.push(request);
      const isRoleRequest = request.url.includes('/employee_roles');
      return new Response(JSON.stringify(isRoleRequest ? [] : [{
        id: EMPLOYEE_ID,
        name: '张经理',
        phone: '13800008000',
        status: 'active',
        employee_roles: [{ role: { id: ROLE_ID } }],
      }]), {
        status: 200,
        headers: {
          'content-type': 'application/json',
          ...(isRoleRequest ? {} : { 'content-range': '0-0/1' }),
        },
      });
    }) as typeof fetch;
    const client = createClient('http://127.0.0.1:54321', 'test-key', {
      global: { fetch: fetchStub },
    });
    const { PlatformServiceTrialAssigneesRepository } = await import(
      './platform-service-trial-assignees'
    );
    const repository = new PlatformServiceTrialAssigneesRepository(
      () => client as never,
    );

    await repository.listCandidates({
      page: 1,
      pageSize: 20,
      keyword: ' 张%,(_经理) ',
    });

    const listRequest = requests[0];
    const listUrl = new URL(listRequest?.url ?? 'http://invalid');
    expect(listUrl.pathname).toEndWith('/rest/v1/employees');
    expect(listUrl.searchParams.get('select')).toBe(
      'id,name,phone,status,employee_roles!inner(role:roles!employee_roles_role_id_fkey!inner(id))',
    );
    expect(listRequest?.headers.get('prefer')).toContain('count=exact');
    expect(listUrl.searchParams.get('employee_roles.role.code')).toBe(
      'like.platform\\_%',
    );
    expect(listUrl.searchParams.get('or')).toBe(
      '(name.ilike.%张\\% \\_经理%,phone.ilike.%张\\% \\_经理%)',
    );
    expect(listUrl.searchParams.get('offset')).toBe('0');
    expect(listUrl.searchParams.get('limit')).toBe('20');
  });
});
