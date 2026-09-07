'use client';

import Link from 'next/link';
import { INVENTORY_TRANSACTION_TYPE_LABELS } from '@gooes/domain';
import { Button } from '@/components/ui/button';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from '@/components/ui/empty';
import { Skeleton } from '@/components/ui/skeleton';
import { StatusAlert } from '@/components/admin/status-alert';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { formatInventoryDecimal, formatInventoryTime } from './inventory-rules';
import type {
  InventoryBalance,
  InventoryIdentity,
  InventoryState,
  InventoryTransaction,
} from './inventory-types';

type Props = {
  tab: InventoryState['tab'];
  balances: InventoryBalance[];
  transactions: InventoryTransaction[];
  canViewPurchaseOrders: boolean;
  loading: boolean;
  error: string;
  onRetry: () => void;
  onReset: () => void;
  onWarehouse: (warehouse: InventoryIdentity) => void;
  onDrill: (balance: InventoryBalance) => void;
};

function Product({ row }: { row: InventoryBalance | InventoryTransaction }) {
  return (
    <div className="min-w-40 max-w-64 break-words">
      <p className="font-medium">{row.sku_name}</p>
      <p className="text-xs text-muted-foreground">{row.sku_code}</p>
      {'specification' in row && (
        <p className="text-xs text-muted-foreground">
          {[row.specification, row.model].filter(Boolean).join(' · ')}
        </p>
      )}
    </div>
  );
}

function SourceDocument({
  row,
  canViewPurchaseOrders,
}: {
  row: InventoryTransaction;
  canViewPurchaseOrders: boolean;
}) {
  const source = row.source_document;
  if (!source)
    return <span className="text-muted-foreground">来源单据不可用</span>;
  return (
    <div className="flex max-w-64 flex-col gap-1 break-words">
      <span>收货单 {source.receipt_no}</span>
      {canViewPurchaseOrders ? (
        <Link
          className="text-primary underline-offset-4 hover:underline"
          href={`/supplier-purchase-orders?purchase_order_id=${encodeURIComponent(source.purchase_order_id)}`}
        >
          采购单 {source.order_no}
        </Link>
      ) : (
        <span className="text-muted-foreground">采购单 {source.order_no}</span>
      )}
    </div>
  );
}

export function InventoryTable(props: Props) {
  const { tab, loading, error, balances, transactions, onWarehouse, onDrill } =
    props;
  const headers =
    tab === 'balances'
      ? [
          '商品 / SKU',
          '仓库',
          '现存数量',
          '平均成本',
          '库存金额',
          '最近更新',
          '操作',
        ]
      : [
          '时间',
          '类型',
          '商品 / SKU',
          '仓库',
          '数量变化',
          '价值变化',
          '来源单据',
          '操作人',
        ];
  const count = tab === 'balances' ? balances.length : transactions.length;
  return (
    <Table
      containerClassName="min-h-0 flex-1 [container-type:inline-size]"
      className="min-w-[980px] text-sm"
      aria-label={tab === 'balances' ? '库存余额' : '库存流水'}
      aria-busy={loading}
    >
      <TableHeader className="sticky top-0 bg-card">
        <TableRow>
          {headers.map((header) => (
            <TableHead key={header} className="whitespace-nowrap">
              {header}
            </TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {loading ? (
          <TableRow>
            <TableCell colSpan={headers.length} className="p-0">
              <div
                role="status"
                className="sticky left-0 flex w-[100cqw] flex-col gap-3 p-5"
              >
                <span className="sr-only">正在加载库存</span>
                {[0, 1, 2, 3, 4].map((index) => (
                  <Skeleton key={index} className="h-8 w-full" />
                ))}
              </div>
            </TableCell>
          </TableRow>
        ) : error ? (
          <TableRow>
            <TableCell colSpan={headers.length} className="p-0">
              <div className="sticky left-0 w-[100cqw] p-5">
                <StatusAlert title="库存加载失败">{error}</StatusAlert>
                <Button
                  variant="outline"
                  className="mt-3"
                  onClick={props.onRetry}
                >
                  重试
                </Button>
              </div>
            </TableCell>
          </TableRow>
        ) : !count ? (
          <TableRow>
            <TableCell colSpan={headers.length} className="p-0">
              <div className="sticky left-0 w-[100cqw]">
                <Empty>
                  <EmptyHeader>
                    <EmptyTitle className="text-base">
                      暂无符合条件的
                      {tab === 'balances' ? '库存余额' : '库存流水'}
                    </EmptyTitle>
                    <EmptyDescription>
                      可调整筛选条件；采购收货入库后会生成库存记录。
                    </EmptyDescription>
                  </EmptyHeader>
                  <Button variant="outline" onClick={props.onReset}>
                    清除筛选
                  </Button>
                </Empty>
              </div>
            </TableCell>
          </TableRow>
        ) : tab === 'balances' ? (
          balances.map((row) => (
            <TableRow key={row.id}>
              <TableCell>
                <Product row={row} />
              </TableCell>
              <TableCell>
                <Button
                  variant="link"
                  className="h-auto max-w-48 whitespace-normal p-0 text-left"
                  onClick={() =>
                    onWarehouse({
                      id: row.warehouse_id,
                      name: row.warehouse_name,
                    })
                  }
                >
                  {row.warehouse_name}
                </Button>
              </TableCell>
              <TableCell className="whitespace-nowrap tabular-nums">
                {formatInventoryDecimal(row.quantity_on_hand)}
              </TableCell>
              <TableCell className="whitespace-nowrap tabular-nums">
                {formatInventoryDecimal(row.average_unit_cost)}
              </TableCell>
              <TableCell className="whitespace-nowrap tabular-nums">
                {formatInventoryDecimal(row.inventory_value)}
              </TableCell>
              <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                {formatInventoryTime(row.updated_at)}
              </TableCell>
              <TableCell>
                <Button
                  variant="link"
                  className="h-auto whitespace-nowrap p-0"
                  onClick={() => onDrill(row)}
                  aria-label={`查看 ${row.sku_name} 在 ${row.warehouse_name} 的流水`}
                >
                  查看流水
                </Button>
              </TableCell>
            </TableRow>
          ))
        ) : (
          transactions.map((row) => (
            <TableRow key={row.id}>
              <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                {formatInventoryTime(row.occurred_at)}
              </TableCell>
              <TableCell className="whitespace-nowrap">
                {INVENTORY_TRANSACTION_TYPE_LABELS[row.transaction_type]}
              </TableCell>
              <TableCell>
                <Product row={row} />
              </TableCell>
              <TableCell>
                <Button
                  variant="link"
                  className="h-auto max-w-48 whitespace-normal p-0 text-left"
                  onClick={() =>
                    onWarehouse({
                      id: row.warehouse_id,
                      name: row.warehouse_name,
                    })
                  }
                >
                  {row.warehouse_name}
                </Button>
              </TableCell>
              <TableCell className="whitespace-nowrap tabular-nums">
                {formatInventoryDecimal(row.quantity_delta, true)}
              </TableCell>
              <TableCell className="whitespace-nowrap tabular-nums">
                {formatInventoryDecimal(row.value_delta, true)}
              </TableCell>
              <TableCell>
                <SourceDocument
                  row={row}
                  canViewPurchaseOrders={props.canViewPurchaseOrders}
                />
              </TableCell>
              <TableCell className="whitespace-nowrap">
                {row.created_by_employee_name || '操作人不可用'}
              </TableCell>
            </TableRow>
          ))
        )}
      </TableBody>
    </Table>
  );
}
