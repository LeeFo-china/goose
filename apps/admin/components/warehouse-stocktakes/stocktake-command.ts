'use client';
import { useFrozenInventoryCommand } from '@/components/inventory/use-frozen-inventory-command';
import { sendStocktake } from './stocktake-api';
import { parseStoredStocktakeCommand } from './stocktake-command-state';
import { retainStocktakeCommand, stocktakeError } from './stocktake-rules';
const options = {
  storageSuffix: 'warehouse-stocktake-command',
  parse: parseStoredStocktakeCommand,
  send: sendStocktake,
  retain: retainStocktakeCommand,
  error: stocktakeError,
};
export function useStocktakeCommand(scope: string, onResolved: (id: string) => void) {
  return useFrozenInventoryCommand(scope, onResolved, options);
}
