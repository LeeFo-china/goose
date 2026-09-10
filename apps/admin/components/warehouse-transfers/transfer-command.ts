'use client';
import { useFrozenInventoryCommand } from '@/components/inventory/use-frozen-inventory-command';
import { sendTransfer } from './transfer-api';
import { parseStoredTransferCommand } from './transfer-command-state';
import { restoreTransferCommand, transferRecoveryStorageKey } from './transfer-command-storage';
import { retainTransferCommand, transferError } from './transfer-rules';
const options = {
  storageSuffix: 'warehouse-transfer-command',
  storageKey: transferRecoveryStorageKey,
  restore: restoreTransferCommand,
  parse: parseStoredTransferCommand,
  send: sendTransfer,
  retain: retainTransferCommand,
  error: transferError,
};
export function useTransferCommand(scope: string, onResolved: (id: string, outcome: 'success' | 'conflict') => void) {
  return useFrozenInventoryCommand(scope, onResolved, options);
}
