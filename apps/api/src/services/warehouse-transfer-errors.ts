import { AppError } from '@/errors/app-error';
import { Errors } from '@/errors/error-factory';

const DEFINITIONS: Record<string, { statusCode: number; message: string }> = {
  INVALID: { statusCode: 400, message: '调拨参数无效' },
  ITEMS_INVALID: { statusCode: 400, message: '调拨明细无效' },
  FORBIDDEN: { statusCode: 403, message: '无权访问仓库调拨单据' },
  ACTOR_INVALID: { statusCode: 403, message: '当前员工身份无效' },
  NOT_FOUND: { statusCode: 404, message: '调拨单据不存在' },
  SOURCE_CONFLICT: { statusCode: 409, message: '调拨来源或仓库不匹配' },
  VERSION_CONFLICT: { statusCode: 409, message: '单据已变化，请刷新后重试' },
  STATE_CONFLICT: { statusCode: 409, message: '当前单据状态不允许此操作' },
  IDEMPOTENCY_CONFLICT: { statusCode: 409, message: '幂等键已用于其他请求' },
  NOT_ENABLED: { statusCode: 403, message: '租户尚未启用仓库调拨' },
  WAREHOUSE_INVALID: { statusCode: 400, message: '调出或调入仓库无效' },
  WAREHOUSE_INACTIVE: { statusCode: 409, message: '调出或调入仓库已停用' },
  SKU_INVALID: { statusCode: 400, message: '调拨 SKU 无效' },
  INSUFFICIENT_STOCK: { statusCode: 409, message: '源仓库存不足，无法完成调拨' },
  BALANCE_INVALID: { statusCode: 409, message: '库存余额或金额异常，请核查库存' },
  IMMUTABLE: { statusCode: 409, message: '已确认的调拨事实不可修改' },
};

export async function withWarehouseTransferErrors<T>(action: () => Promise<T>): Promise<T> {
  try { return await action(); } catch (error) {
    const details = error instanceof AppError ? error.details : error;
    const message = details && typeof details === 'object' && 'message' in details ? details.message : details;
    if (typeof message === 'string' && message.startsWith('WAREHOUSE_TRANSFER_')) {
      const definition = DEFINITIONS[message.slice('WAREHOUSE_TRANSFER_'.length)];
      if (definition) throw Errors.business(definition.statusCode, definition.message, message);
    }
    throw error;
  }
}
