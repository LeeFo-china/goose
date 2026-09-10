import { AppError } from '@/errors/app-error';
import { Errors } from '@/errors/error-factory';

const DEFINITIONS: Record<string, { statusCode: number; message: string }> = {
  ACTOR_INVALID: { statusCode: 403, message: '当前员工身份无效' },
  BALANCE_INVALID: { statusCode: 409, message: '库存余额或金额异常，请核查库存' },
  COST_BASIS_REQUIRED: { statusCode: 409, message: '库存缺少成本依据，无法完成盘点' },
  COUNTS_REQUIRED: { statusCode: 409, message: '请先完成全部盘点数量录入' },
  DIFFERENCE_REASON_REQUIRED: { statusCode: 400, message: '存在盘点差异时必须填写差异原因' },
  FORBIDDEN: { statusCode: 403, message: '无权访问仓库盘点单据' },
  IDEMPOTENCY_CONFLICT: { statusCode: 409, message: '幂等键已用于其他请求' },
  IMMUTABLE: { statusCode: 409, message: '已确认的盘点事实不可修改' },
  INVALID: { statusCode: 400, message: '盘点参数无效' },
  ITEMS_INVALID: { statusCode: 400, message: '盘点明细无效' },
  NOT_ENABLED: { statusCode: 403, message: '租户尚未启用仓库盘点' },
  NOT_FOUND: { statusCode: 404, message: '盘点单据不存在' },
  SKU_INVALID: { statusCode: 400, message: '盘点 SKU 无效' },
  SNAPSHOT_CONFLICT: { statusCode: 409, message: '库存快照已变化，请取消并新建盘点' },
  SNAPSHOT_IMMUTABLE: { statusCode: 409, message: '盘点快照已冻结，不可修改' },
  SOURCE_CONFLICT: { statusCode: 409, message: '盘点来源或仓库不匹配' },
  STATE_CONFLICT: { statusCode: 409, message: '当前单据状态不允许此操作' },
  VERSION_CONFLICT: { statusCode: 409, message: '单据已变化，请刷新后重试' },
  WAREHOUSE_INACTIVE: { statusCode: 409, message: '盘点仓库已停用' },
  WAREHOUSE_INVALID: { statusCode: 400, message: '盘点仓库无效' },
};

export async function withWarehouseStocktakeErrors<T>(action: () => Promise<T>): Promise<T> {
  try { return await action(); } catch (error) {
    const details = error instanceof AppError ? error.details : error;
    const message = details && typeof details === 'object' && 'message' in details ? details.message : details;
    if (typeof message === 'string' && message.startsWith('WAREHOUSE_STOCKTAKE_')) {
      const definition = DEFINITIONS[message.slice('WAREHOUSE_STOCKTAKE_'.length)];
      if (definition) throw Errors.business(definition.statusCode, definition.message, message);
    }
    throw error;
  }
}
