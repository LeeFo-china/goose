export type FrozenInventoryCommand = Readonly<{ path: string; body: string; key: string; orderId: string }>;
type FrozenInventoryCommandStorage = Pick<Storage, 'getItem' | 'removeItem'>;
export function restoreFrozenInventoryCommand(
  storage: Pick<Storage, 'getItem'> | null,
  storageKey: string,
  parse: (raw: string) => FrozenInventoryCommand | null,
): { ready: boolean; pending: FrozenInventoryCommand | null; message: string } {
  const blocked = (message: string) => ({ ready: false, pending: null, message });
  if (!storage) return blocked('无法读取待确认请求记录，暂不能执行操作');
  try {
    const raw = storage.getItem(storageKey);
    const pending = raw === null ? null : parse(raw);
    if (raw !== null && !pending) return blocked('待确认请求记录无效，请联系管理员核实后处理');
    return { ready: true, pending, message: '' };
  } catch {
    return blocked('无法读取待确认请求记录，请核实最近一次操作');
  }
}

export interface FrozenInventoryCommandLifecycle {
  activate: () => number;
  deactivate: () => void;
  isCurrent: (owner: number) => boolean;
}

export function createFrozenInventoryCommandLifecycle(): FrozenInventoryCommandLifecycle {
  let generation = 0;
  let active = false;
  return {
    activate: () => {
      active = true;
      generation += 1;
      return generation;
    },
    deactivate: () => {
      active = false;
      generation += 1;
    },
    isCurrent: (owner) => active && owner === generation,
  };
}

export function parseStoredFrozenInventoryCommand(
  raw: string,
  validate: (command: FrozenInventoryCommand) => boolean = () => true,
): FrozenInventoryCommand | null {
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== 'object') return null;
    const record = value as Record<string, unknown>;
    if (
      typeof record.path !== 'string' ||
      typeof record.body !== 'string' ||
      typeof record.key !== 'string' ||
      !record.key ||
      typeof record.orderId !== 'string' ||
      record.path.split('/')[2]?.toLowerCase() !== record.orderId.toLowerCase()
    )
      return null;
    const body: unknown = JSON.parse(record.body);
    if (
      !body ||
      typeof body !== 'object' ||
      !Number.isInteger((body as Record<string, unknown>).expected_version)
    )
      return null;
    const command = Object.freeze({
      path: record.path,
      body: record.body,
      key: record.key,
      orderId: record.orderId,
    });
    return validate(command) ? command : null;
  } catch {
    return null;
  }
}

export function clearStoredFrozenInventoryCommand(
  storage: FrozenInventoryCommandStorage,
  storageKey: string,
  command: FrozenInventoryCommand,
  isOwnerCurrent: () => boolean = () => true,
): 'cleared' | 'stale' | 'error' | 'inactive' {
  if (!isOwnerCurrent()) return 'inactive';
  try {
    const current = storage.getItem(storageKey);
    const parsed = current ? parseStoredFrozenInventoryCommand(current) : null;
    if (
      !parsed ||
      parsed.path !== command.path ||
      parsed.body !== command.body ||
      parsed.key !== command.key ||
      parsed.orderId !== command.orderId
    )
      return 'stale';
    if (!isOwnerCurrent()) return 'inactive';
    storage.removeItem(storageKey);
    return 'cleared';
  } catch {
    return 'error';
  }
}

export function matchStoredFrozenInventoryCommand(
  storage: Pick<Storage, 'getItem'>,
  storageKey: string,
  command: FrozenInventoryCommand,
): 'current' | 'stale' | 'error' {
  try {
    const raw = storage.getItem(storageKey);
    const parsed = raw ? parseStoredFrozenInventoryCommand(raw) : null;
    return parsed &&
      parsed.path === command.path &&
      parsed.body === command.body &&
      parsed.key === command.key &&
      parsed.orderId === command.orderId
      ? 'current'
      : 'stale';
  } catch {
    return 'error';
  }
}
