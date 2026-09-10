import { ADMIN_SESSION_STORAGE_PREFIX } from '@/components/layout/admin-session-scope';
import { matchStoredTransferCommand, parseStoredTransferCommand, type TransferCommand } from './transfer-command-state';

type TransferRecoveryStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
interface TransferRecovery {
  ready: boolean;
  pending: TransferCommand | null;
  message: string;
}

// Same tab and identity isolation as before, but logout must not erase an unknown result.
export function transferRecoveryStorageKey(scope: string): string {
  return `gooes:warehouse-transfer-recovery:${scope}:warehouse-transfer-command`;
}

export function restoreTransferCommand(storage: TransferRecoveryStorage | null, scope: string): TransferRecovery {
  const blocked = (message: string): TransferRecovery => ({ ready: false, pending: null, message });
  if (!storage) return blocked('无法读取待确认请求记录，暂不能执行操作');
  const key = transferRecoveryStorageKey(scope);
  const legacyKey = `${ADMIN_SESSION_STORAGE_PREFIX}${scope}:warehouse-transfer-command`;
  try {
    const raw = storage.getItem(key);
    const legacyRaw = storage.getItem(legacyKey);
    const current = raw === null ? null : parseStoredTransferCommand(raw);
    const legacy = legacyRaw === null ? null : parseStoredTransferCommand(legacyRaw);
    if ((raw !== null && !current) || (legacyRaw !== null && !legacy))
      return blocked('待确认请求记录无效，请联系管理员核实后处理');
    if (legacy && legacyRaw !== null) {
      if (current && matchStoredTransferCommand(storage, key, legacy) !== 'current')
        return blocked('新旧待确认请求记录不一致，请联系管理员核实后处理');
      if (!current) {
        storage.setItem(key, legacyRaw);
        if (storage.getItem(key) !== legacyRaw)
          return blocked('无法保存待确认请求记录，暂不能执行操作');
      }
      // Copy and verify before deleting; failed migration leaves a recoverable original.
      storage.removeItem(legacyKey);
    }
    return { ready: true, pending: current ?? legacy, message: '' };
  } catch {
    return blocked('无法迁移或读取待确认请求记录，请核实最近一次操作');
  }
}
