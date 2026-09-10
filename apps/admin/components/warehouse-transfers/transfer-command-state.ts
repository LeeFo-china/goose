import {
  clearStoredFrozenInventoryCommand,
  createFrozenInventoryCommandLifecycle,
  matchStoredFrozenInventoryCommand,
  parseStoredFrozenInventoryCommand,
  type FrozenInventoryCommand,
  type FrozenInventoryCommandLifecycle,
} from '@/components/inventory/frozen-inventory-command';
export type TransferCommand = FrozenInventoryCommand;
export type TransferCommandLifecycle = FrozenInventoryCommandLifecycle;
export {
  clearStoredFrozenInventoryCommand as clearStoredTransferCommand,
  createFrozenInventoryCommandLifecycle as createTransferCommandLifecycle,
  matchStoredFrozenInventoryCommand as matchStoredTransferCommand,
};
const TRANSFER_COMMAND_PATH =
  /^\/warehouse-transfers\/([\da-f]{8}-[\da-f]{4}-[1-5][\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12})\/(save-draft|submit|complete|cancel)$/i;
export function parseStoredTransferCommand(raw: string): TransferCommand | null {
  return parseStoredFrozenInventoryCommand(raw, (command) => TRANSFER_COMMAND_PATH.test(command.path));
}
