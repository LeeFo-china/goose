import { AppError } from '@/errors/app-error';
import { Errors } from '@/errors/error-factory';

const DEFINITIONS: Record<string, { statusCode: number; message: string }> = {
  INVALID: { statusCode: 400, message: '领退料参数无效' },
  ITEMS_INVALID: { statusCode: 400, message: '领退料明细无效' },
  FORBIDDEN: { statusCode: 403, message: '无权访问此项目的领退料单据' },
  ACTOR_INVALID: { statusCode: 403, message: '当前员工身份无效' },
  NOT_FOUND: { statusCode: 404, message: '领退料单据不存在' },
  SOURCE_CONFLICT: { statusCode: 409, message: '原领料单据或明细不匹配' },
  VERSION_CONFLICT: { statusCode: 409, message: '单据已变化，请刷新后重试' },
  STATE_CONFLICT: { statusCode: 409, message: '当前单据状态不允许此操作' },
  IDEMPOTENCY_CONFLICT: { statusCode: 409, message: '幂等键已用于其他请求' },
  NOT_ENABLED: { statusCode: 403, message: '租户尚未启用项目领退料' },
  WAREHOUSE_INVALID: { statusCode: 400, message: '仓库无效' },
  WAREHOUSE_INACTIVE: { statusCode: 409, message: '仓库已停用' },
  SKU_INVALID: { statusCode: 400, message: '领料 SKU 无效' },
  RETURN_QUANTITY_EXCEEDED: { statusCode: 409, message: '退料数量超过剩余可退数量' },
  COST_CATEGORY_REQUIRED: { statusCode: 409, message: '请先为领料 SKU 配置材料成本科目' },
  INSUFFICIENT_STOCK: { statusCode: 409, message: '库存不足，无法完成领料' },
  IMMUTABLE: { statusCode: 409, message: '单据来源、仓库及项目不可变更' },
};

export async function withWarehouseMaterialErrors<T>(action: () => Promise<T>): Promise<T> {
  try {
    return await action();
  } catch (error) {
    const details = error instanceof AppError ? error.details : error;
    const message = details && typeof details === 'object' && 'message' in details ? details.message : details;
    if (typeof message === 'string' && message.startsWith('WAREHOUSE_MATERIAL_')) {
      const definition = DEFINITIONS[message.slice('WAREHOUSE_MATERIAL_'.length)];
      if (definition) throw Errors.business(definition.statusCode, definition.message, message);
    }
    throw error;
  }
}
