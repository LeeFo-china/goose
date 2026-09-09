import {
  clearStoredFrozenInventoryCommand,
  createFrozenInventoryCommandLifecycle,
  matchStoredFrozenInventoryCommand,
  parseStoredFrozenInventoryCommand,
  type FrozenInventoryCommand,
} from '@/components/inventory/frozen-inventory-command';
import {
  stocktakeUuid,
  stocktakeCommandSchema,
  stocktakeDraftSchema,
  stocktakeCountsSchema,
} from './stocktake-rules';
export type StocktakeCommand = FrozenInventoryCommand;
export {
  clearStoredFrozenInventoryCommand as clearStoredStocktakeCommand,
  createFrozenInventoryCommandLifecycle as createStocktakeCommandLifecycle,
  matchStoredFrozenInventoryCommand as matchStoredStocktakeCommand,
};
export function parseStoredStocktakeCommand(raw: string): StocktakeCommand | null {
  return parseStoredFrozenInventoryCommand(raw, (command) => {
    const parts = command.path.split('/');
    if (
      parts.length !== 4 ||
      parts[0] !== '' ||
      parts[1] !== 'warehouse-stocktakes' ||
      !stocktakeUuid.safeParse(parts[2]).success
    )
      return false;
    const action = parts[3];
    if (!['save-draft', 'start', 'record-counts', 'submit', 'complete', 'cancel'].includes(action))
      return false;
    const schema =
      action === 'save-draft'
        ? stocktakeDraftSchema
        : action === 'record-counts'
          ? stocktakeCountsSchema
          : stocktakeCommandSchema;
    return schema.safeParse(JSON.parse(command.body)).success;
  });
}
