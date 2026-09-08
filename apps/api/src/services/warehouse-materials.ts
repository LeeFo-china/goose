import type { WarehouseMaterialCommand, WarehouseMaterialCommandResult, WarehouseMaterialDocumentType } from '@gooes/domain';

import { Errors } from '@/errors/error-factory';
import { warehouseMaterialCommandsRepository, type WarehouseMaterialCommandsRepository } from '@/repositories/warehouse-material-commands';
import { warehouseMaterialReadsRepository, type WarehouseMaterialReadsRepository } from '@/repositories/warehouse-material-reads';
import type { WarehouseMaterialActor, WarehouseMaterialPageInput } from '@/repositories/warehouse-material-records';
import {
  WarehouseIssueDraftSchema, WarehouseReturnDraftSchema, WarehouseMaterialCommandSchema,
  type WarehouseMaterialListQuery, type WarehouseMaterialProjectQuery,
} from '@/schema/warehouse-materials';
import { accessPolicyService } from './access-policy';
import type { AuthContext } from './authorization';
import { withWarehouseMaterialErrors } from './warehouse-material-errors';

interface Dependencies {
  commands?: Pick<WarehouseMaterialCommandsRepository, 'command'>;
  reads?: Pick<WarehouseMaterialReadsRepository, 'list' | 'get' | 'listItems' | 'listProjects'>;
}

export class WarehouseMaterialsService {
  private readonly commands: NonNullable<Dependencies['commands']>;
  private readonly reads: NonNullable<Dependencies['reads']>;

  constructor(dependencies: Dependencies = {}) {
    this.commands = dependencies.commands ?? warehouseMaterialCommandsRepository;
    this.reads = dependencies.reads ?? warehouseMaterialReadsRepository;
  }

  async list(auth: AuthContext, documentType: WarehouseMaterialDocumentType, query: WarehouseMaterialListQuery) {
    const scope = this.requireScope(auth, 'inventory.stock.view');
    return withWarehouseMaterialErrors(() => this.reads.list({
      ...scope, document_type: documentType, page: query.page, pageSize: query.pageSize,
      warehouse_id: query.warehouseId, project_id: query.projectId, status: query.status, keyword: query.keyword,
    }));
  }

  async get(auth: AuthContext, documentType: WarehouseMaterialDocumentType, orderId: string) {
    const scope = this.requireScope(auth, 'inventory.stock.view');
    return withWarehouseMaterialErrors(() => this.reads.get({ ...scope, document_type: documentType, order_id: orderId }));
  }

  async listItems(auth: AuthContext, documentType: WarehouseMaterialDocumentType, orderId: string, page: WarehouseMaterialPageInput) {
    const scope = this.requireScope(auth, 'inventory.stock.view');
    return withWarehouseMaterialErrors(() => this.reads.listItems({
      ...scope, document_type: documentType, order_id: orderId, ...page,
    }));
  }

  async listProjects(auth: AuthContext, query: WarehouseMaterialProjectQuery) {
    const permission = accessPolicyService.hasPermission(auth, 'inventory.issue.manage')
      ? 'inventory.issue.manage' : 'inventory.issue.approve';
    const scope = this.requireScope(auth, permission);
    return withWarehouseMaterialErrors(() => this.reads.listProjects({ ...scope, ...query }));
  }

  async command(
    auth: AuthContext, documentType: WarehouseMaterialDocumentType, orderId: string,
    command: WarehouseMaterialCommand, input: unknown, idempotencyKey: string,
  ): Promise<WarehouseMaterialCommandResult> {
    const scope = this.requireScope(auth, command === 'complete' ? 'inventory.issue.approve' : 'inventory.issue.manage');
    if (documentType === 'return' && command === 'submit') throw Errors.badRequest('退料单不支持提交操作');
    const key = idempotencyKey.trim();
    if (!key || key.length > 120) throw Errors.badRequest('缺少有效的 Idempotency-Key');
    const schema = command === 'save_draft'
      ? documentType === 'issue' ? WarehouseIssueDraftSchema : WarehouseReturnDraftSchema
      : WarehouseMaterialCommandSchema;
    const parsed = schema.safeParse(input);
    if (!parsed.success) throw Errors.fromZod(parsed.error);
    const { expected_version, ...payload } = parsed.data;
    // SQL verifies project.read data scope and active tenant/employee identity. It
    // resolves successful receipts before mutable rollout/warehouse/version checks.
    return withWarehouseMaterialErrors(() => this.commands.command({
      ...scope, document_type: documentType, order_id: orderId, command,
      expected_version, payload, idempotency_key: key,
    }));
  }

  private requireScope(auth: AuthContext, permission: string): WarehouseMaterialActor {
    const tenantId = accessPolicyService.assertTenantContext(auth);
    accessPolicyService.assertPermission(auth, permission);
    accessPolicyService.assertPermission(auth, 'project.read');
    if (!auth.employeeId || !auth.authUserId || auth.employeeStatus !== 'active') {
      throw Errors.business(403, '当前操作需要有效员工身份', 'WAREHOUSE_MATERIAL_ACTOR_INVALID');
    }
    return { tenant_id: tenantId, actor_user_id: auth.authUserId, actor_employee_id: auth.employeeId };
  }
}
export const warehouseMaterialsService = new WarehouseMaterialsService();
