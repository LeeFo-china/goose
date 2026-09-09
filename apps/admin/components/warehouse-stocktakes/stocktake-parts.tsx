'use client';
import type { WarehouseStocktakeItem, WarehouseStocktakeStatus } from '@gooes/domain';
import { WAREHOUSE_STOCKTAKE_STATUS_LABELS } from '@gooes/domain';
import { formatInventoryDecimal, formatInventoryTime } from '@/components/inventory/inventory-rules';
import { InventoryDocumentPager } from '@/components/inventory/inventory-document-pager';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
export const stocktakeMoney = (value: string | null) =>
  value === null ? '待确认' : formatInventoryDecimal(value);
export { formatInventoryTime as stocktakeTime };
export function StocktakePager(props: React.ComponentProps<typeof InventoryDocumentPager>) {
  return <InventoryDocumentPager {...props} label={props.label ?? '盘点分页'} />;
}
export function StocktakeStatus({ status }: { status: WarehouseStocktakeStatus }) {
  return (
    <Badge
      variant={
        status === 'completed'
          ? 'success'
          : status === 'submitted'
            ? 'warning'
            : status === 'cancelled'
              ? 'outline'
              : 'secondary'
      }
    >
      {WAREHOUSE_STOCKTAKE_STATUS_LABELS[status]}
    </Badge>
  );
}
export function StocktakeLoading() {
  return (
    <div role="status" aria-label="正在读取盘点数据" className="flex flex-col gap-3">
      <Skeleton className="h-8 w-1/3" />
      <Skeleton className="h-24 w-full" />
    </div>
  );
}
export function StocktakeItemTable({ items }: { items: WarehouseStocktakeItem[] }) {
  return (
    <Table aria-label="盘点明细" className="min-w-[1100px]">
      <TableHeader>
        <TableRow>
          {[
            '材料',
            '账面数量',
            '账面金额',
            '账面单价',
            '实盘数量',
            '差异数量',
            '差异原因',
            '过账单价',
            '过账金额',
          ].map((label) => (
            <TableHead key={label}>{label}</TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {items.map((item) => (
          <TableRow key={item.id}>
            <TableCell>
              {item.sku_name}
              <p className="text-xs text-muted-foreground">{item.sku_code}</p>
            </TableCell>
            <TableCell>
              {item.book_quantity === null ? '未冻结' : formatInventoryDecimal(item.book_quantity)}
            </TableCell>
            <TableCell>{stocktakeMoney(item.book_value)}</TableCell>
            <TableCell>{stocktakeMoney(item.book_unit_cost)}</TableCell>
            <TableCell>
              {item.counted_quantity === null ? '未录入' : formatInventoryDecimal(item.counted_quantity)}
            </TableCell>
            <TableCell>
              {item.difference_quantity === null
                ? '待确认'
                : formatInventoryDecimal(item.difference_quantity, true)}
            </TableCell>
            <TableCell className="max-w-64 whitespace-normal break-words">
              {item.difference_reason ?? '—'}
            </TableCell>
            <TableCell>{stocktakeMoney(item.unit_cost ?? null)}</TableCell>
            <TableCell>{stocktakeMoney(item.amount)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
export function StocktakeDiscardDialog({
  open,
  onOpenChange,
  onDiscard,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDiscard: () => void;
}) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>放弃未保存的修改？</AlertDialogTitle>
          <AlertDialogDescription>
            关闭编辑会丢失本次未保存的输入。可以返回继续编辑并保存。
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>继续编辑</AlertDialogCancel>
          <AlertDialogAction onClick={onDiscard}>放弃修改</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
