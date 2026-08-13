import { describe, expect, test } from 'bun:test';

process.env.SUPABASE_URL ??= 'http://127.0.0.1:54321';
process.env.SUPABASE_PUBLISH ??= 'test-publish-key';
process.env.SUPABASE_SERVICE_ROLE_KEY ??= 'test-service-role-key';

const EMPLOYEE_ID = '11111111-1111-4111-8111-111111111111';
const SECOND_EMPLOYEE_ID = '22222222-2222-4222-8222-222222222222';
const INCLUDED_EMPLOYEE_ID = '33333333-3333-4333-8333-333333333333';

type QueryResult = {
  data: unknown;
  error: unknown;
  count?: number | null;
};

type Call = {
  table: string;
  method: string;
  args: unknown[];
};

function createHarness(responses: Record<string, QueryResult[]>) {
  const calls: Call[] = [];
  const from = (table: string) => {
    const result = responses[table]?.shift();
    if (!result) throw new Error(`Missing stub response for ${table}`);
    const resultPromise = Promise.resolve(result);

    const query = {
      select: (...args: unknown[]) => record('select', args),
      eq: (...args: unknown[]) => record('eq', args),
      is: (...args: unknown[]) => record('is', args),
      in: (...args: unknown[]) => record('in', args),
      like: (...args: unknown[]) => record('like', args),
      or: (...args: unknown[]) => record('or', args),
      order: (...args: unknown[]) => record('order', args),
      range: (...args: unknown[]) => record('range', args),
      maybeSingle: async () => {
        calls.push({ table, method: 'maybeSingle', args: [] });
        return result;
      },
      then: resultPromise.then.bind(resultPromise),
    };

    function record(method: string, args: unknown[]) {
      calls.push({ table, method, args });
      return query;
    }

    return query;
  };

  return {
    calls,
    clientProvider: () => ({ from }),
  };
}

function employee(
  id: string,
  overrides: Record<string, unknown> = {},
) {
  return {
    id,
    name: '张经理',
    phone: '13800008000',
    status: 'active',
    employee_roles: [{ role: { id: 'role-filter-only' } }],
    secret: 'must-not-leak',
    ...overrides,
  };
}

function callsFor(calls: Call[], table: string, method: string) {
  return calls.filter((call) => call.table === table && call.method === method);
}

describe('PlatformServiceTrialAssigneesRepository', () => {
  test('queries a bounded exact-count page and batch loads active platform roles', async () => {
    const harness = createHarness({
      employees: [{
        data: [employee(EMPLOYEE_ID), employee(SECOND_EMPLOYEE_ID)],
        error: null,
        count: 21,
      }],
      employee_roles: [{
        data: [
          {
            employee_id: EMPLOYEE_ID,
            role: { code: 'platform_operations', name: '平台运营' },
          },
          {
            employee_id: SECOND_EMPLOYEE_ID,
            role: { code: 'platform_finance_review', name: '财务复核' },
          },
        ],
        error: null,
      }],
    });
    const { PlatformServiceTrialAssigneesRepository } = await import(
      './platform-service-trial-assignees'
    );
    const repository = new PlatformServiceTrialAssigneesRepository(
      harness.clientProvider,
    );

    const result = await repository.listCandidates({ page: 2, pageSize: 20 });

    expect(result).toEqual({
      list: [
        {
          id: EMPLOYEE_ID,
          name: '张经理',
          phone: '13800008000',
          status: 'active',
          roles: [{ code: 'platform_operations', name: '平台运营' }],
        },
        {
          id: SECOND_EMPLOYEE_ID,
          name: '张经理',
          phone: '13800008000',
          status: 'active',
          roles: [{ code: 'platform_finance_review', name: '财务复核' }],
        },
      ],
      includedEmployee: null,
      pagination: {
        page: 2,
        pageSize: 20,
        total: 21,
        totalPages: 2,
      },
    });

    const employeeSelect = callsFor(harness.calls, 'employees', 'select')[0];
    expect(employeeSelect?.args[0]).toBe(
      'id,name,phone,status,employee_roles!inner(role:roles!employee_roles_role_id_fkey!inner(id))',
    );
    expect(employeeSelect?.args[1]).toEqual({ count: 'exact' });
    expect(String(employeeSelect?.args[0])).not.toContain('*');
    expect(String(employeeSelect?.args[0])).not.toContain('last_login_time');
    expect(callsFor(harness.calls, 'employees', 'is')).toContainEqual({
      table: 'employees', method: 'is', args: ['tenant_id', null],
    });
    expect(callsFor(harness.calls, 'employees', 'eq')).toEqual(
      expect.arrayContaining([
        { table: 'employees', method: 'eq', args: ['status', 'active'] },
        {
          table: 'employees',
          method: 'eq',
          args: ['employee_roles.role.status', 'active'],
        },
      ]),
    );
    expect(callsFor(harness.calls, 'employees', 'is')).toContainEqual({
      table: 'employees',
      method: 'is',
      args: ['employee_roles.role.tenant_id', null],
    });
    expect(callsFor(harness.calls, 'employees', 'like')).toContainEqual({
      table: 'employees',
      method: 'like',
      args: ['employee_roles.role.code', 'platform_%'],
    });
    expect(callsFor(harness.calls, 'employees', 'range')).toEqual([{
      table: 'employees', method: 'range', args: [20, 39],
    }]);
    expect(callsFor(harness.calls, 'employee_roles', 'in')).toEqual([{
      table: 'employee_roles',
      method: 'in',
      args: ['employee_id', [EMPLOYEE_ID, SECOND_EMPLOYEE_ID]],
    }]);
    expect(callsFor(harness.calls, 'employee_roles', 'select')).toEqual([{
      table: 'employee_roles',
      method: 'select',
      args: [
        'employee_id,role:roles!employee_roles_role_id_fkey!inner(code,name)',
      ],
    }]);
    expect(callsFor(harness.calls, 'employee_roles', 'is')).toContainEqual({
      table: 'employee_roles', method: 'is', args: ['role.tenant_id', null],
    });
    expect(callsFor(harness.calls, 'employee_roles', 'eq')).toContainEqual({
      table: 'employee_roles', method: 'eq', args: ['role.status', 'active'],
    });
    expect(callsFor(harness.calls, 'employee_roles', 'like')).toContainEqual({
      table: 'employee_roles',
      method: 'like',
      args: ['role.code', 'platform_%'],
    });
  });

  test('escapes name and phone keyword filter syntax', async () => {
    const harness = createHarness({
      employees: [{ data: [], error: null, count: 0 }],
    });
    const { PlatformServiceTrialAssigneesRepository } = await import(
      './platform-service-trial-assignees'
    );
    const repository = new PlatformServiceTrialAssigneesRepository(
      harness.clientProvider,
    );

    await repository.listCandidates({
      page: 1,
      pageSize: 20,
      keyword: ' 张%,(_经理) ',
    });

    expect(callsFor(harness.calls, 'employees', 'or')).toEqual([{
      table: 'employees',
      method: 'or',
      args: ['name.ilike.%张\\% \\_经理%,phone.ilike.%张\\% \\_经理%'],
    }]);
    expect(callsFor(harness.calls, 'employee_roles', 'select')).toHaveLength(0);
  });

  test('fetches an absent included employee exactly once and shares the role batch', async () => {
    const harness = createHarness({
      employees: [
        { data: [employee(EMPLOYEE_ID)], error: null, count: 1 },
        {
          data: employee(INCLUDED_EMPLOYEE_ID, {
            name: '历史员工',
            status: 'suspended',
          }),
          error: null,
        },
      ],
      employee_roles: [{
        data: [{
          employee_id: EMPLOYEE_ID,
          role: { code: 'platform_operations', name: '平台运营' },
        }],
        error: null,
      }],
    });
    const { PlatformServiceTrialAssigneesRepository } = await import(
      './platform-service-trial-assignees'
    );
    const repository = new PlatformServiceTrialAssigneesRepository(
      harness.clientProvider,
    );

    const result = await repository.listCandidates({
      page: 1,
      pageSize: 20,
      includeEmployeeId: INCLUDED_EMPLOYEE_ID,
    });

    expect(result.includedEmployee).toEqual({
      id: INCLUDED_EMPLOYEE_ID,
      name: '历史员工',
      phone: '13800008000',
      status: 'suspended',
      roles: [],
    });
    expect(callsFor(harness.calls, 'employees', 'maybeSingle')).toHaveLength(1);
    expect(callsFor(harness.calls, 'employees', 'eq')).toContainEqual({
      table: 'employees', method: 'eq', args: ['id', INCLUDED_EMPLOYEE_ID],
    });
    expect(callsFor(harness.calls, 'employee_roles', 'in')).toEqual([{
      table: 'employee_roles',
      method: 'in',
      args: ['employee_id', [EMPLOYEE_ID, INCLUDED_EMPLOYEE_ID]],
    }]);
    expect(callsFor(harness.calls, 'employee_roles', 'select')).toHaveLength(1);
  });

  test('does not refetch an included employee already present in the page', async () => {
    const harness = createHarness({
      employees: [{ data: [employee(EMPLOYEE_ID)], error: null, count: 1 }],
      employee_roles: [{ data: [], error: null }],
    });
    const { PlatformServiceTrialAssigneesRepository } = await import(
      './platform-service-trial-assignees'
    );
    const repository = new PlatformServiceTrialAssigneesRepository(
      harness.clientProvider,
    );

    const result = await repository.listCandidates({
      page: 1,
      pageSize: 20,
      includeEmployeeId: EMPLOYEE_ID,
    });

    expect(result.includedEmployee).toBeNull();
    expect(callsFor(harness.calls, 'employees', 'maybeSingle')).toHaveLength(0);
    expect(callsFor(harness.calls, 'employees', 'select')).toHaveLength(1);
  });

  test.each([
    ['candidate page', {
      employees: [{ data: null, error: { message: 'sentinel-page' } }],
    }, {}],
    ['included employee', {
      employees: [
        { data: [], error: null, count: 0 },
        { data: null, error: { message: 'sentinel-included' } },
      ],
    }, { includeEmployeeId: INCLUDED_EMPLOYEE_ID }],
    ['role batch', {
      employees: [{ data: [employee(EMPLOYEE_ID)], error: null, count: 1 }],
      employee_roles: [{ data: null, error: { message: 'sentinel-roles' } }],
    }, {}],
  ])('wraps %s failures without raw database details', async (
    _label,
    responses,
    query,
  ) => {
    const harness = createHarness(responses);
    const { PlatformServiceTrialAssigneesRepository } = await import(
      './platform-service-trial-assignees'
    );
    const repository = new PlatformServiceTrialAssigneesRepository(
      harness.clientProvider,
    );

    try {
      await repository.listCandidates({ page: 1, pageSize: 20, ...query });
      throw new Error('Expected repository to reject');
    } catch (error) {
      expect(error).toMatchObject({
        statusCode: 500,
        code: 'DB_ERROR',
        details: undefined,
      });
      expect((error as Error).message).not.toContain('sentinel');
    }
  });
});
