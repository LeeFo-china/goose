import { z } from 'zod';
import { Errors } from '@/errors/error-factory';
import {
  customerRenderingJobReconciliationRepository,
  type CustomerRenderingJobReconciliationRepositoryPort,
  type CustomerRenderingManualDecision,
} from '@/repositories/customer-rendering-job-reconciliation';
import type { PlatformStaffAuthContext } from '@/services/platform-authorization';

export type PlatformRenderingReconcileInput = {
  tenantId: string;
  jobId: string;
  decision: CustomerRenderingManualDecision;
  evidenceRef: string;
};

export type PlatformRenderingReconcileResponse = {
  tenant_id: string;
  job_id: string;
  decision: CustomerRenderingManualDecision;
  status: 'succeeded' | 'failed';
  idempotent: boolean;
};

export class PlatformCustomerRenderingJobReconciliationService {
  constructor(private readonly repository: CustomerRenderingJobReconciliationRepositoryPort = customerRenderingJobReconciliationRepository) {}

  async reconcile(authContext: Pick<PlatformStaffAuthContext, 'employeeId' | 'isPlatformSuperAdmin'>,
    input: PlatformRenderingReconcileInput): Promise<PlatformRenderingReconcileResponse> {
    if (!authContext.isPlatformSuperAdmin || !z.uuid().safeParse(authContext.employeeId).success) {
      throw Errors.forbidden();
    }
    const result = await this.repository.reconcile({
      ...input,
      operatorRef: `employee:${authContext.employeeId}`,
    });
    if (result.decision === 'not_found') {
      throw Errors.business(404, '客户生图任务不存在', 'RENDERING_JOB_NOT_FOUND');
    }
    if (result.decision === 'invalid_state') {
      throw Errors.business(409, '任务状态不允许人工对账', 'RENDERING_JOB_INVALID_STATE');
    }
    if (result.decision === 'conflict') {
      throw Errors.business(409, '任务已有不同的人工对账决定', 'RENDERING_JOB_RECONCILE_CONFLICT');
    }
    if (result.decision === 'invalid_request') {
      throw Errors.badRequest('人工对账参数无效');
    }
    if (result.decision !== 'reconciled' && result.decision !== 'existing') {
      throw Errors.dbError('客户生图任务人工对账响应无效');
    }
    if (result.status !== (input.decision === 'approve_audited' ? 'succeeded' : 'failed')) {
      throw Errors.dbError('客户生图任务人工对账响应无效');
    }
    return {
      tenant_id: input.tenantId,
      job_id: input.jobId,
      decision: input.decision,
      status: result.status,
      idempotent: result.decision === 'existing',
    };
  }
}

export const platformCustomerRenderingJobReconciliationService = new PlatformCustomerRenderingJobReconciliationService();
