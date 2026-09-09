'use client';
import { useFrozenInventoryCommand } from '@/components/inventory/use-frozen-inventory-command';
import { sendTransfer } from './transfer-api';
import { parseStoredTransferCommand } from './transfer-command-state';
import { retainTransferCommand, transferError } from './transfer-rules';
const options = {
  storageSuffix: 'warehouse-transfer-command',
  parse: parseStoredTransferCommand,
  send: sendTransfer,
  retain: retainTransferCommand,
  error: transferError,
};
export function useTransferCommand(scope: string, onResolved: (id: string) => void) {
  return useFrozenInventoryCommand(scope, onResolved, options);
}
