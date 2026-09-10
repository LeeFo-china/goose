import type { WarehouseStocktakeOrderSummary } from '@gooes/domain';
import { loadCompleteStocktakeItems, readStocktake } from './stocktake-api';
import type { StocktakeEdit } from './stocktake-editor-storage';

export async function recoverStocktakeEditor(edit: StocktakeEdit, tenantId: string | null, signal: AbortSignal) {
  if (edit.kind === 'draft' && edit.version === 0)
    return { draft: { id: edit.orderId, items: [], recovery: edit } };
  const order = await readStocktake<WarehouseStocktakeOrderSummary>('/warehouse-stocktakes/' + edit.orderId, signal);
  if (order.id.toLowerCase() !== edit.orderId.toLowerCase() || order.tenant_id !== tenantId ||
    order.version !== edit.version || order.status !== (edit.kind === 'draft' ? 'draft' : 'counting') ||
    (edit.kind === 'draft' && order.warehouse_id.toLowerCase() !== edit.warehouse?.id.toLowerCase()))
    return { error: '单据身份、状态或版本已变化，不能恢复到新版本；原输入仍保留' };
  const complete = await loadCompleteStocktakeItems(order, signal);
  if (!complete.items) return { error: complete.error };
  if (edit.kind === 'counts') {
    const ids = new Set(complete.items.map((item) => item.supplier_sku_id.toLowerCase()));
    if (edit.lines.length !== ids.size || edit.lines.some((line) => !ids.has(line.skuId.toLowerCase())))
      return { error: '实盘材料已变化，原输入仍保留' };
    return { counts: { order, items: complete.items, recovery: edit } };
  }
  return { draft: { id: order.id, order, items: complete.items, recovery: edit } };
}
