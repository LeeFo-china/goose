import { z } from 'zod';
import { Errors } from '@/errors/error-factory';
import { SupabaseDB } from '@/utils/supabase';

export type CustomerRenderingManualDecision = 'approve_audited' | 'release';
export type CustomerRenderingReconcileCommand = {
  tenantId: string;
  jobId: string;
  decision: CustomerRenderingManualDecision;
  operatorRef: string;
  evidenceRef: string;
};

const Result = z.discriminatedUnion('decision', [
  z.object({ decision: z.enum(['reconciled', 'existing']), status: z.enum(['succeeded', 'failed']) }),
  z.object({ decision: z.enum(['not_found', 'invalid_state', 'conflict', 'invalid_request']) }),
]);
export type CustomerRenderingReconcileResult = z.infer<typeof Result>;

export interface CustomerRenderingJobReconciliationRepositoryPort {
  reconcile(command: CustomerRenderingReconcileCommand): Promise<CustomerRenderingReconcileResult>;
}

type RpcClient = { rpc(name: string, params: Record<string, unknown>): PromiseLike<{ data: unknown; error: unknown }> };

export class CustomerRenderingJobReconciliationRepository implements CustomerRenderingJobReconciliationRepositoryPort {
  constructor(private readonly configuredClient?: RpcClient) {}

  async reconcile(command: CustomerRenderingReconcileCommand): Promise<CustomerRenderingReconcileResult> {
    const client = this.configuredClient ?? SupabaseDB.getAdminClient() as unknown as RpcClient;
    let result: { data: unknown; error: unknown };
    try {
      result = await client.rpc('reconcile_customer_rendering_job', {
        p_tenant_id: command.tenantId,
        p_job_id: command.jobId,
        p_decision: command.decision,
        p_operator_ref: command.operatorRef,
        p_evidence_ref: command.evidenceRef,
      });
    } catch { throw Errors.dbError('客户生图任务人工对账失败'); }
    if (result.error) throw Errors.dbError('客户生图任务人工对账失败');
    const parsed = Result.safeParse(result.data);
    if (!parsed.success) throw Errors.dbError('客户生图任务人工对账响应无效');
    return parsed.data;
  }
}

export const customerRenderingJobReconciliationRepository = new CustomerRenderingJobReconciliationRepository();
