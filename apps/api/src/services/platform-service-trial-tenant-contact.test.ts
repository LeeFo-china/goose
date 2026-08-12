import { beforeAll, describe, expect, test } from 'bun:test';

process.env.SUPABASE_URL ??= 'http://127.0.0.1:54321';
process.env.SUPABASE_PUBLISH ??= 'test-publish-key';
process.env.SUPABASE_SERVICE_ROLE_KEY ??= 'test-service-role-key';

import type { ServiceTrialClient } from '@/repositories/service-trials';
import { TrialDetailSchema } from '@/repositories/service-trial-records';
import {
  makeActiveTrial,
  makeTrialDetail,
  makeTrialListRecord,
  NOW,
  TRIAL_ID,
} from './service-trial-test-fixtures';

let ServiceTrialRepository: typeof import('@/repositories/service-trials').ServiceTrialRepository;
let serializeServiceTrial: typeof import('./service-trial-views').serializeServiceTrial;

beforeAll(async () => {
  ({ ServiceTrialRepository } = await import('@/repositories/service-trials'));
  ({ serializeServiceTrial } = await import('./service-trial-views'));
});

const MASKED_TENANT = {
  id: '22222222-2222-4222-8222-222222222222',
  name: '示例装企',
  slug: 'example-tenant',
  contact_name: '张**',
  contact_phone: '138****8000',
};

const RAW_TENANT = {
  ...MASKED_TENANT,
  contact_name: '张经理',
  contact_phone: '13800138000',
};
const NOW_ISO = NOW.toISOString();

function listRepository(tenant: typeof MASKED_TENANT) {
  const row = { ...makeTrialListRecord(makeActiveTrial()), tenant };
  const client = {
    from() { throw new Error('platform list must use the RPC') },
    rpc() {
      return Promise.resolve({ data: {
        items: [{ trial: row, effective_status: 'active' }],
        total: 1, page: 1, page_size: 20, server_time: NOW_ISO,
      }, error: null });
    },
  };
  return new ServiceTrialRepository(() => client as unknown as ServiceTrialClient);
}

describe('platform trial tenant master contacts', () => {
  test('accepts only masked tenant master contacts from the list RPC', async () => {
    const result = await listRepository(MASKED_TENANT)
      .listPlatformTrials({ nowIso: NOW_ISO });
    expect(result.list[0]?.tenant).toEqual(MASKED_TENANT);

    await expect(listRepository(RAW_TENANT)
      .listPlatformTrials({ nowIso: NOW_ISO })).rejects.toMatchObject({
      statusCode: 500,
      code: 'DB_ERROR',
    });
  });

  test('accepts raw detail facts and masks them exactly once for HTTP output', () => {
    const detail = { ...makeTrialDetail(makeActiveTrial()), tenant: RAW_TENANT };
    const parsed = TrialDetailSchema.parse(detail);
    const serialized = serializeServiceTrial(parsed, new Date(NOW));

    expect(serialized.tenant).toEqual(MASKED_TENANT);
    expect(JSON.stringify(serialized)).not.toContain('13800138000');
    expect(JSON.stringify(serialized)).not.toContain('张经理');
  });

  test('normalizes blank names and does not reveal short contact numbers', () => {
    const detail = { ...makeTrialDetail(makeActiveTrial()), tenant: {
      ...RAW_TENANT, contact_name: '   ', contact_phone: '021',
    } };
    const parsed = TrialDetailSchema.parse(detail);
    const serialized = serializeServiceTrial(parsed, new Date(NOW));

    expect(serialized.tenant).toMatchObject({
      contact_name: null,
      contact_phone: '0****1',
    });
    expect(JSON.stringify(serialized)).not.toContain('021');
  });

  test('selects tenant master contacts in the bounded detail relation', async () => {
    const calls: Array<readonly [string, ...unknown[]]> = [];
    const detail = { ...makeTrialDetail(makeActiveTrial()), tenant: RAW_TENANT };
    const query = {
      select(columns: string) { calls.push(['select', columns]); return this },
      eq(column: string, value: unknown) { calls.push(['eq', column, value]); return this },
      order() { return this },
      limit() { return this },
      maybeSingle() { return Promise.resolve({ data: detail, error: null }) },
    };
    const client = { from() { return query }, rpc() {
      return Promise.resolve({ data: null, error: null });
    } };
    const repository = new ServiceTrialRepository(
      () => client as unknown as ServiceTrialClient,
    );

    await expect(repository.findTrialById({ id: TRIAL_ID })).resolves.toBeTruthy();
    expect(calls[0]?.[1]).toContain(
      'tenant:tenants!tenant_service_trials_tenant_id_fkey(id,name,slug,contact_name,contact_phone)',
    );
  });
});
