export type TransferCommand = Readonly<{ path: string; body: string; key: string; orderId: string }>;
type TransferCommandStorage = Pick<Storage, 'getItem' | 'removeItem'>;
export interface TransferCommandLifecycle {
  activate: () => number;
  deactivate: () => void;
  isCurrent: (owner: number) => boolean;
}

export function createTransferCommandLifecycle(): TransferCommandLifecycle {
  let generation = 0;
  let active = false;
  return {
    activate: () => { active = true; generation += 1; return generation; },
    deactivate: () => { active = false; generation += 1; },
    isCurrent: (owner) => active && owner === generation,
  };
}
const TRANSFER_COMMAND_PATH = /^\/warehouse-transfers\/([\da-f]{8}-[\da-f]{4}-[1-5][\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12})\/(save-draft|submit|complete|cancel)$/i;

export function parseStoredTransferCommand(raw: string): TransferCommand | null {
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== 'object') return null;
    const record = value as Record<string, unknown>;
    if (typeof record.path !== 'string' || typeof record.body !== 'string' || typeof record.key !== 'string' ||
      !record.key || typeof record.orderId !== 'string' || !TRANSFER_COMMAND_PATH.test(record.path) ||
      record.path.split('/')[2]?.toLowerCase() !== record.orderId.toLowerCase()) return null;
    const body: unknown = JSON.parse(record.body);
    if (!body || typeof body !== 'object' || !Number.isInteger((body as Record<string, unknown>).expected_version)) return null;
    return Object.freeze({ path: record.path, body: record.body, key: record.key, orderId: record.orderId });
  } catch { return null; }
}

export function clearStoredTransferCommand(
  storage: TransferCommandStorage,
  storageKey: string,
  command: TransferCommand,
  isOwnerCurrent: () => boolean = () => true,
): 'cleared' | 'stale' | 'error' | 'inactive' {
  if (!isOwnerCurrent()) return 'inactive';
  try {
    const current = storage.getItem(storageKey);
    const parsed = current ? parseStoredTransferCommand(current) : null;
    if (!parsed || parsed.path !== command.path || parsed.body !== command.body ||
      parsed.key !== command.key || parsed.orderId !== command.orderId) return 'stale';
    if (!isOwnerCurrent()) return 'inactive';
    storage.removeItem(storageKey);
    return 'cleared';
  } catch { return 'error'; }
}

export function matchStoredTransferCommand(
  storage: Pick<Storage, 'getItem'>,
  storageKey: string,
  command: TransferCommand,
): 'current' | 'stale' | 'error' {
  try {
    const raw = storage.getItem(storageKey);
    const parsed = raw ? parseStoredTransferCommand(raw) : null;
    return parsed && parsed.path === command.path && parsed.body === command.body &&
      parsed.key === command.key && parsed.orderId === command.orderId ? 'current' : 'stale';
  } catch { return 'error'; }
}
