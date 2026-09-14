import { beforeAll, expect, mock, test } from 'bun:test';

process.env.SUPABASE_URL ??= 'http://127.0.0.1:54321';
process.env.SUPABASE_PUBLISH ??= 'test-publish-key';
process.env.SUPABASE_SERVICE_ROLE_KEY ??= 'test-service-role-key';

let Repository: typeof import('./customer-rendering-job-reconciliation').CustomerRenderingJobReconciliationRepository;
beforeAll(async () => { ({ CustomerRenderingJobReconciliationRepository: Repository } = await import('./customer-rendering-job-reconciliation')); });

const command = {
  tenantId: '11111111-1111-4111-8111-111111111111',
  jobId: '22222222-2222-4222-8222-222222222222',
  decision: 'approve_audited' as const,
  operatorRef: 'employee:33333333-3333-4333-8333-333333333333',
  evidenceRef: 'TICKET-2026-001',
};

test('manual reconciliation invokes the existing RPC exactly and strips internal quota', async () => {
  const rpc = mock(async () => ({ data: { decision: 'reconciled', status: 'succeeded',
    quota: { consumed: 1, active_job_id: null } }, error: null }));
  const repository = new Repository({ rpc });
  expect(await repository.reconcile(command)).toEqual({ decision: 'reconciled', status: 'succeeded' });
  expect(rpc).toHaveBeenCalledWith('reconcile_customer_rendering_job', {
    p_tenant_id: command.tenantId, p_job_id: command.jobId,
    p_decision: command.decision, p_operator_ref: command.operatorRef,
    p_evidence_ref: command.evidenceRef,
  });
});

test('manual reconciliation parses existing and rejects malformed or failed RPC results', async () => {
  const existing = new Repository({ rpc: async () => ({ data: { decision: 'existing', status: 'failed' }, error: null }) });
  expect(await existing.reconcile({ ...command, decision: 'release' }))
    .toEqual({ decision: 'existing', status: 'failed' });
  for (const data of [{ decision: 'reconciled', status: 'processing' }, { decision: 'unknown' }, null]) {
    const repository = new Repository({ rpc: async () => ({ data, error: null }) });
    await expect(repository.reconcile(command)).rejects.toMatchObject({ statusCode: 500 });
  }
  const failed = new Repository({ rpc: async () => ({ data: null, error: { message: 'denied' } }) });
  await expect(failed.reconcile(command)).rejects.toMatchObject({ statusCode: 500 });
});
