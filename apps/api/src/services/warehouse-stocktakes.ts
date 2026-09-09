import type { WarehouseStocktakeCommand, WarehouseStocktakeCommandResult } from '@gooes/domain';

import { Errors } from '@/errors/error-factory';
import { warehouseStocktakesRepository, type WarehouseStocktakesRepository } from '@/repositories/warehouse-stocktakes';
import type { WarehouseStocktakeActor, WarehouseStocktakePageInput } from '@/repositories/warehouse-stocktake-records';
import { WarehouseStocktakeCommandSchema, WarehouseStocktakeCountsSchema, WarehouseStocktakeDraftSchema,
  type WarehouseStocktakeListQuery } from '@/schema/warehouse-stocktakes';
import { accessPolicyService } from './access-policy';
import type { AuthContext } from './authorization';
import { withWarehouseStocktakeErrors } from './warehouse-stocktake-errors';

interface Dependencies {
  repository?: Pick<WarehouseStocktakesRepository, 'command' | 'list' | 'get' | 'listItems' | 'getSettings'>;
}
export class WarehouseStocktakesService {
  private readonly repository: NonNullable<Dependencies['repository']>;
  constructor(dependencies: Dependencies = {}) { this.repository = dependencies.repository ?? warehouseStocktakesRepository; }
  async getSettings(auth: AuthContext) {
    const permission = ['inventory.stock.view', 'inventory.stocktake.manage', 'inventory.stocktake.approve']
      .find((code) => accessPolicyService.hasPermission(auth, code));
    if (!permission) throw Errors.forbidden();
    return withWarehouseStocktakeErrors(() => this.repository.getSettings(this.requireScope(auth, permission)));
  }
  async list(auth: AuthContext, query: WarehouseStocktakeListQuery) {
    const scope = this.requireScope(auth, 'inventory.stock.view');
    return withWarehouseStocktakeErrors(() => this.repository.list({ ...scope, page: query.page, pageSize: query.pageSize,
      warehouse_id: query.warehouseId, status: query.status, keyword: query.keyword }));
  }
  async get(auth: AuthContext, orderId: string) {
    return withWarehouseStocktakeErrors(() => this.repository.get({ ...this.requireScope(auth, 'inventory.stock.view'), order_id: orderId }));
  }
  async listItems(auth: AuthContext, orderId: string, page: WarehouseStocktakePageInput) {
    return withWarehouseStocktakeErrors(() => this.repository.listItems({ ...this.requireScope(auth, 'inventory.stock.view'), order_id: orderId, ...page }));
  }
  async command(auth: AuthContext, orderId: string, command: WarehouseStocktakeCommand, input: unknown,
    idempotencyKey: string): Promise<WarehouseStocktakeCommandResult> {
    const scope = this.requireScope(auth, command === 'complete' ? 'inventory.stocktake.approve' : 'inventory.stocktake.manage');
    const key = idempotencyKey.trim();
    if (!key || key.length > 120) throw Errors.badRequest('缺少有效的 Idempotency-Key');
    const schema = command === 'save_draft' ? WarehouseStocktakeDraftSchema
      : command === 'record_counts' ? WarehouseStocktakeCountsSchema : WarehouseStocktakeCommandSchema;
    const parsed = schema.safeParse(input);
    if (!parsed.success) throw Errors.fromZod(parsed.error);
    const { expected_version, ...payload } = parsed.data;
    return withWarehouseStocktakeErrors(() => this.repository.command({ ...scope, order_id: orderId, command,
      expected_version, payload, idempotency_key: key }));
  }
  private requireScope(auth: AuthContext, permission: string): WarehouseStocktakeActor {
    const tenantId = accessPolicyService.assertTenantContext(auth);
    accessPolicyService.assertPermission(auth, permission);
    if (!auth.employeeId || !auth.authUserId || auth.employeeStatus !== 'active') {
      throw Errors.business(403, '当前操作需要有效员工身份', 'WAREHOUSE_STOCKTAKE_ACTOR_INVALID');
    }
    return { tenant_id: tenantId, actor_user_id: auth.authUserId, actor_employee_id: auth.employeeId };
  }
}
export const warehouseStocktakesService = new WarehouseStocktakesService();
