'use client';

import { useEffect, useState } from 'react';
import { WAREHOUSE_STOCKTAKE_STATUS_LABELS, type WarehouseStocktakeOrderSummary } from '@gooes/domain';

import { FormSelect } from '@/components/admin/form-select';
import { StatusAlert } from '@/components/admin/status-alert';
import { BatchOptionPicker } from '@/components/supplier-purchase-batches/batch-option-picker';
import { Button } from '@/components/ui/button';
import { Empty, EmptyHeader, EmptyTitle } from '@/components/ui/empty';
import { Field, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

import { loadStocktakeFilterWarehouses, readStocktake, type StocktakePage } from './stocktake-api';
import {
  StocktakePager,
  StocktakeLoading,
  StocktakeStatus,
  stocktakeMoney,
  stocktakeTime,
} from './stocktake-parts';
import { stocktakeError, stocktakeListPath, type StocktakeAccess } from './stocktake-rules';

export function StocktakeList({
  access,
  revision,
  onOpen,
  active = true,
}: {
  access: StocktakeAccess;
  revision: number;
  onOpen: (id: string) => void;
  active?: boolean;
}) {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [keyword, setKeyword] = useState('');
  const [status, setStatus] = useState('all');
  const [warehouse, setWarehouse] = useState<{ id: string; name: string } | null>(null);
  const [result, setResult] = useState<StocktakePage<WarehouseStocktakeOrderSummary> | null>(null);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const warehouseLoader = loadStocktakeFilterWarehouses;
  const path = stocktakeListPath({
    page,
    pageSize: 20,
    keyword,
    status: status === 'all' ? '' : status,
    warehouseId: warehouse?.id,
  });
  useEffect(() => {
    if (!active) return;
    const controller = new AbortController();
    setResult(null);
    setError('');
    readStocktake<StocktakePage<WarehouseStocktakeOrderSummary>>(path, controller.signal)
      .then((next) => {
        if (controller.signal.aborted) return;
        if (page > Math.max(1, next.pagination.totalPages)) {
          setPage(Math.max(1, next.pagination.totalPages));
          return;
        }
        setResult(next);
      })
      .catch((caught) => {
        if (!controller.signal.aborted) setError(stocktakeError(caught));
      });
    return () => controller.abort();
  }, [path, revision, retry, page, active]);
  return (
    <section className="flex min-w-0 flex-col gap-3" aria-label="盘点单列表">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            setKeyword(search.trim());
            setPage(1);
          }}
        >
          <Field>
            <FieldLabel htmlFor="stocktake-search">搜索单号 / 原因</FieldLabel>
            <div className="flex gap-2">
              <Input
                id="stocktake-search"
                value={search}
                maxLength={100}
                onChange={(event) => setSearch(event.target.value)}
              />
              <Button type="submit" variant="outline">
                搜索
              </Button>
            </div>
          </Field>
        </form>
        <Field>
          <FieldLabel htmlFor="stocktake-status">状态</FieldLabel>
          <FormSelect
            id="stocktake-status"
            value={status}
            options={[
              { value: 'all', label: '全部状态' },
              ...Object.entries(WAREHOUSE_STOCKTAKE_STATUS_LABELS).map(([value, label]) => ({
                value,
                label,
              })),
            ]}
            onChange={(value) => {
              setStatus(value);
              setPage(1);
            }}
          />
        </Field>
        {access.canViewWarehouses && (
          <BatchOptionPicker
            id="stocktake-warehouse-filter"
            label="盘点仓库"
            value={warehouse}
            load={warehouseLoader}
            onChange={(value) => {
              setWarehouse(value);
              setPage(1);
            }}
          />
        )}
      </div>
      <div>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            setWarehouse(null);
            setStatus('all');
            setKeyword('');
            setSearch('');
            setPage(1);
          }}
        >
          清除筛选
        </Button>
      </div>
      {error ? (
        <StatusAlert title="盘点列表读取失败">
          {error}
          <Button variant="link" onClick={() => setRetry((value) => value + 1)}>
            重试列表
          </Button>
        </StatusAlert>
      ) : !result ? (
        <StocktakeLoading />
      ) : !result.list.length ? (
        <Empty>
          <EmptyHeader>
            <EmptyTitle>暂无符合条件的盘点单</EmptyTitle>
          </EmptyHeader>
        </Empty>
      ) : (
        <Table aria-label="盘点单列表" className="min-w-[900px]">
          <TableHeader>
            <TableRow>
              {['单号', '盘点仓库', '状态', '材料数', '已实盘', '盘盈 / 盘亏金额', '更新时间', '操作'].map(
                (label) => (
                  <TableHead key={label}>{label}</TableHead>
                ),
              )}
            </TableRow>
          </TableHeader>
          <TableBody>
            {result.list.map((order) => (
              <TableRow key={order.id}>
                <TableCell>{order.order_no}</TableCell>
                <TableCell>{order.warehouse_name}</TableCell>
                <TableCell>
                  <StocktakeStatus status={order.status} />
                </TableCell>
                <TableCell>{order.item_count}</TableCell>
                <TableCell>{order.counted_count}</TableCell>
                <TableCell>
                  {stocktakeMoney(order.gain_amount)} / {stocktakeMoney(order.loss_amount)}
                </TableCell>
                <TableCell>{stocktakeTime(order.updated_at)}</TableCell>
                <TableCell>
                  <Button variant="link" onClick={() => onOpen(order.id)}>
                    查看 {order.order_no}
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      <StocktakePager label="盘点单分页" pagination={result?.pagination} onPage={setPage} />
    </section>
  );
}
