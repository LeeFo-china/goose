import { ADMIN_SESSION_STORAGE_PREFIX } from '@/components/layout/admin-session-scope';
import { matchStoredFrozenInventoryCommand } from '@/components/inventory/frozen-inventory-command';
import { parseStoredStocktakeCommand, type StocktakeCommand } from './stocktake-command-state';

export function stocktakeRecoveryStorageKey(scope: string) {
  return `gooes:warehouse-stocktake-recovery:${scope}:warehouse-stocktake-command`;
}

export function restoreStocktakeCommand(
  storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | null,
  scope: string,
): { ready: boolean; pending: StocktakeCommand | null; message: string } {
  const blocked = (message: string) => ({ ready: false, pending: null, message });
  if (!storage) return blocked('无法读取待确认请求记录，暂不能执行操作');
  const key = stocktakeRecoveryStorageKey(scope);
  const legacyKey = `${ADMIN_SESSION_STORAGE_PREFIX}${scope}:warehouse-stocktake-command`;
  try {
    const raw = storage.getItem(key);
    const legacyRaw = storage.getItem(legacyKey);
    const current = raw === null ? null : parseStoredStocktakeCommand(raw);
    const legacy = legacyRaw === null ? null : parseStoredStocktakeCommand(legacyRaw);
    if ((raw !== null && !current) || (legacyRaw !== null && !legacy))
      return blocked('待确认请求记录无效，请联系管理员核实后处理');
    if (legacy && legacyRaw !== null) {
      if (current && matchStoredFrozenInventoryCommand(storage, key, legacy) !== 'current')
        return blocked('新旧待确认请求记录不一致，请联系管理员核实后处理');
      if (!current) {
        storage.setItem(key, legacyRaw);
        if (storage.getItem(key) !== legacyRaw) return blocked('无法保存待确认请求记录，暂不能执行操作');
      }
      // Preserve the original until the dedicated record has been written and verified.
      storage.removeItem(legacyKey);
    }
    return { ready: true, pending: current ?? legacy, message: '' };
  } catch {
    return blocked('无法迁移或读取待确认请求记录，请核实最近一次操作');
  }
}
