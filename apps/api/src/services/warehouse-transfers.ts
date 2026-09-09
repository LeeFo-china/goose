import type { WarehouseTransferCommand, WarehouseTransferCommandResult } from '@gooes/domain';

import { Errors } from '@/errors/error-factory';
import { warehouseTransfersRepository, type WarehouseTransfersRepository } from '@/repositories/warehouse-transfers';
import type { WarehouseTransferActor, WarehouseTransferPageInput } from '@/repositories/warehouse-transfer-records';
import { WarehouseTransferDraftSchema, WarehouseTransferCommandSchema, type WarehouseTransferListQuery } from '@/schema/warehouse-transfers';
import { accessPolicyService } from './access-policy';
import type { AuthContext } from './authorization';
import { withWarehouseTransferErrors } from './warehouse-transfer-errors';

interface Dependencies {
  repository?: Pick<WarehouseTransfersRepository, 'command' | 'list' | 'get' | 'listItems' | 'getSettings'>;
}

export class WarehouseTransfersService {
  private readonly repository: NonNullable<Dependencies['repository']>;
  constructor(dependencies: Dependencies = {}) { this.repository = dependencies.repository ?? warehouseTransfersRepository; }

  async getSettings(auth: AuthContext) {
    const permission = ['inventory.stock.view', 'inventory.transfer.manage', 'inventory.transfer.approve']
      .find((code) => accessPolicyService.hasPermission(auth, code));
    if (!permission) throw Errors.forbidden();
    const scope = this.requireScope(auth, permission);
    return withWarehouseTransferErrors(() => this.repository.getSettings(scope));
  }

  async list(auth: AuthContext, query: WarehouseTransferListQuery) {
    const scope = this.requireScope(auth, 'inventory.stock.view');
    return withWarehouseTransferErrors(() => this.repository.list({ ...scope,
      page: query.page, pageSize: query.pageSize, source_warehouse_id: query.sourceWarehouseId,
      destination_warehouse_id: query.destinationWarehouseId, status: query.status, keyword: query.keyword,
    }));
  }

  async get(auth: AuthContext, orderId: string) {
    const scope = this.requireScope(auth, 'inventory.stock.view');
    return withWarehouseTransferErrors(() => this.repository.get({ ...scope, order_id: orderId }));
  }

  async listItems(auth: AuthContext, orderId: string, page: WarehouseTransferPageInput) {
    const scope = this.requireScope(auth, 'inventory.stock.view');
    return withWarehouseTransferErrors(() => this.repository.listItems({ ...scope, order_id: orderId, ...page }));
  }

  async command(auth: AuthContext, orderId: string, command: WarehouseTransferCommand, input: unknown, idempotencyKey: string): Promise<WarehouseTransferCommandResult> {
    const scope = this.requireScope(auth, command === 'complete' ? 'inventory.transfer.approve' : 'inventory.transfer.manage');
    const key = idempotencyKey.trim();
    if (!key || key.length > 120) throw Errors.badRequest('缺少有效的 Idempotency-Key');
    const parsed = (command === 'save_draft' ? WarehouseTransferDraftSchema : WarehouseTransferCommandSchema).safeParse(input);
    if (!parsed.success) throw Errors.fromZod(parsed.error);
    const { expected_version, ...payload } = parsed.data;
    // SQL enforces identity, replay, rollout and stock atomically. Do not pre-read
    // mutable settings/version here: successful receipts survive disabled flags.
    return withWarehouseTransferErrors(() => this.repository.command({ ...scope, order_id: orderId, command,
      expected_version, payload, idempotency_key: key,
    }));
  }

  private requireScope(auth: AuthContext, permission: string): WarehouseTransferActor {
    const tenantId = accessPolicyService.assertTenantContext(auth);
    accessPolicyService.assertPermission(auth, permission);
    // Same-tenant transfers are independent of projects and project.read.
    if (!auth.employeeId || !auth.authUserId || auth.employeeStatus !== 'active') {
      throw Errors.business(403, '当前操作需要有效员工身份', 'WAREHOUSE_TRANSFER_ACTOR_INVALID');
    }
    return { tenant_id: tenantId, actor_user_id: auth.authUserId, actor_employee_id: auth.employeeId };
  }
}
export const warehouseTransfersService = new WarehouseTransfersService();
