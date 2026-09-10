'use client';
import { useFrozenInventoryCommand } from '@/components/inventory/use-frozen-inventory-command';
import { sendStocktake } from './stocktake-api';
import { parseStoredStocktakeCommand } from './stocktake-command-state';
import { restoreStocktakeCommand, stocktakeRecoveryStorageKey } from './stocktake-command-storage';
import { retainStocktakeCommand, stocktakeError } from './stocktake-rules';
const options = {
  storageSuffix: 'warehouse-stocktake-command',
  storageKey: stocktakeRecoveryStorageKey,
  restore: restoreStocktakeCommand,
  parse: parseStoredStocktakeCommand,
  send: sendStocktake,
  retain: retainStocktakeCommand,
  error: stocktakeError,
};
export function useStocktakeCommand(scope: string, onResolved: (id: string, outcome: 'success' | 'conflict') => void) {
  return useFrozenInventoryCommand(scope, onResolved, options);
}
