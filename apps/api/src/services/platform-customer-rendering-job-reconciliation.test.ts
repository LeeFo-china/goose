import { beforeAll, expect, mock, test } from 'bun:test';
import type { CustomerRenderingJobReconciliationRepositoryPort } from '@/repositories/customer-rendering-job-reconciliation';

process.env.SUPABASE_URL ??= 'http://127.0.0.1:54321';
process.env.SUPABASE_PUBLISH ??= 'test-publish-key';
process.env.SUPABASE_SERVICE_ROLE_KEY ??= 'test-service-role-key';

let Service: typeof import('./platform-customer-rendering-job-reconciliation').PlatformCustomerRenderingJobReconciliationService;
beforeAll(async () => { ({ PlatformCustomerRenderingJobReconciliationService: Service } = await import('./platform-customer-rendering-job-reconciliation')); });

const context = { employeeId: '33333333-3333-4333-8333-333333333333', isPlatformSuperAdmin: true };
const input = { tenantId: '11111111-1111-4111-8111-111111111111',
  jobId: '22222222-2222-4222-8222-222222222222',
  decision: 'approve_audited' as const, evidenceRef: 'WO-2026-001' };

test('service derives operator from authenticated employee and returns only public status', async () => {
  const reconcile = mock(async () => ({ decision: 'reconciled' as const,
    status: 'succeeded' as const }));
  const service = new Service({ reconcile });
  expect(await service.reconcile(context, input)).toEqual({
    tenant_id: input.tenantId, job_id: input.jobId, decision: input.decision,
    status: 'succeeded', idempotent: false,
  });
  expect(reconcile).toHaveBeenCalledWith({ ...input,
    operatorRef: `employee:${context.employeeId}` });
});

test('service maps idempotent existing and RPC business decisions', async () => {
  const cases = [
    { decision: 'not_found', statusCode: 404, code: 'RENDERING_JOB_NOT_FOUND' },
    { decision: 'invalid_state', statusCode: 409, code: 'RENDERING_JOB_INVALID_STATE' },
    { decision: 'conflict', statusCode: 409, code: 'RENDERING_JOB_RECONCILE_CONFLICT' },
    { decision: 'invalid_request', statusCode: 400, code: 'VALIDATION_ERROR' },
  ] as const;
  for (const item of cases) {
    const service = new Service({ reconcile: async () => ({ decision: item.decision }) });
    await expect(service.reconcile(context, input)).rejects.toMatchObject({
      statusCode: item.statusCode, code: item.code,
    });
  }
  const existing = new Service({ reconcile: async () => ({ decision: 'existing', status: 'failed' }) });
  expect(await existing.reconcile(context, { ...input, decision: 'release' })).toMatchObject({
    status: 'failed', idempotent: true,
  });
  await expect(existing.reconcile(context, input)).rejects.toMatchObject({ statusCode: 500 });
});

test('service refuses untrusted or missing operator identity before RPC', async () => {
  const reconcile = mock(async () => ({ decision: 'reconciled' as const, status: 'succeeded' as const }));
  const service = new Service({ reconcile } satisfies CustomerRenderingJobReconciliationRepositoryPort);
  await expect(service.reconcile({ ...context, isPlatformSuperAdmin: false }, input))
    .rejects.toMatchObject({ statusCode: 403 });
  await expect(service.reconcile({ ...context, employeeId: 'forged' }, input))
    .rejects.toMatchObject({ statusCode: 403 });
  expect(reconcile).not.toHaveBeenCalled();
});
