'use client';
import { formatInventoryDecimal, formatInventoryTime } from '@/components/inventory/inventory-rules';
import { InventoryDocumentPager } from '@/components/inventory/inventory-document-pager';
export const transferMoney = (value: string | null) =>
  value === null ? '待确认' : formatInventoryDecimal(value);
export { formatInventoryTime as transferTime };
export function TransferPager(props: React.ComponentProps<typeof InventoryDocumentPager>) {
  return <InventoryDocumentPager {...props} label={props.label ?? '调拨分页'} />;
}
