'use client';

import { useEffect, useState } from 'react';
import { ClipboardList, RotateCcw, Search } from 'lucide-react';
import {
  WAREHOUSE_STOCKTAKE_STATUS_LABELS,
  type WarehouseStocktakeOrderSummary,
} from '@gooes/domain';

import { FormSelect } from '@/components/admin/form-select';
import { StatusAlert } from '@/components/admin/status-alert';
import { WarehouseFilterCombobox } from '@/components/warehouses/warehouse-filter-combobox';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import { Field, FieldLabel } from '@/components/ui/field';
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from '@/components/ui/input-group';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

import {
  loadStocktakeFilterWarehouses,
  readStocktake,
  type StocktakePage,
} from './stocktake-api';
import {
  StocktakePager,
  StocktakeStatus,
  stocktakeMoney,
  stocktakeTime,
} from './stocktake-parts';
import {
  stocktakeError,
  stocktakeListPath,
  type StocktakeAccess,
} from './stocktake-rules';

const STOCKTAKE_COLUMNS = [
  '单号',
  '盘点仓库',
  '状态',
  '材料数',
  '已实盘',
  '盘盈 / 盘亏金额',
  '更新时间',
  '操作',
] as const;

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
  const [warehouse, setWarehouse] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [result, setResult] =
    useState<StocktakePage<WarehouseStocktakeOrderSummary> | null>(null);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const path = stocktakeListPath({
    page,
    pageSize: 20,
    keyword,
    status: status === 'all' ? '' : status,
    warehouseId: warehouse?.id,
  });
  const hasFilters = Boolean(search || keyword || status !== 'all' || warehouse);
  const loading = !result && !error;

  useEffect(() => {
    if (!active) return;
    const controller = new AbortController();
    setResult(null);
    setError('');
    readStocktake<StocktakePage<WarehouseStocktakeOrderSummary>>(
      path,
      controller.signal,
    )
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
  }, [active, page, path, retry, revision]);

  function applySearch() {
    setKeyword(search.trim());
    setPage(1);
  }

  function clearFilters() {
    setWarehouse(null);
    setStatus('all');
    setKeyword('');
    setSearch('');
    setPage(1);
  }

  return (
    <section
      className="flex min-h-[28rem] min-w-0 flex-1 lg:min-h-0"
      aria-label="盘点单列表"
    >
      <Card
        data-slot="document-list-card"
        className="flex min-w-0 flex-1 flex-col overflow-hidden shadow-none"
      >
      <CardHeader className="shrink-0 border-b bg-muted/20 p-4">
        <form
          aria-label="筛选盘点单"
          className="grid items-end gap-3 md:grid-cols-2 xl:grid-cols-[minmax(16rem,2fr)_minmax(10rem,0.8fr)_minmax(14rem,1.2fr)_auto]"
          onSubmit={(event) => {
            event.preventDefault();
            applySearch();
          }}
        >
          <Field>
            <FieldLabel htmlFor="stocktake-search">单号或原因</FieldLabel>
            <InputGroup className="h-9 bg-card">
              <InputGroupAddon><Search aria-hidden="true" /></InputGroupAddon>
              <InputGroupInput
                id="stocktake-search"
                aria-label="搜索单号 / 原因"
                value={search}
                maxLength={100}
                placeholder="搜索盘点单号或原因"
                onChange={(event) => setSearch(event.target.value)}
              />
              <InputGroupAddon align="inline-end">
                <InputGroupButton
                  type="submit"
                  size="icon-xs"
                  aria-label="搜索"
                  title="搜索盘点单"
                >
                  <Search />
                </InputGroupButton>
              </InputGroupAddon>
            </InputGroup>
          </Field>
          <Field>
            <FieldLabel htmlFor="stocktake-status">状态</FieldLabel>
            <FormSelect
              id="stocktake-status"
              value={status}
              options={[
                { value: 'all', label: '全部状态' },
                ...Object.entries(WAREHOUSE_STOCKTAKE_STATUS_LABELS).map(
                  ([value, label]) => ({ value, label }),
                ),
              ]}
              onChange={(value) => {
                setStatus(value);
                setPage(1);
              }}
            />
          </Field>
          {access.canViewWarehouses ? (
            <WarehouseFilterCombobox
              id="stocktake-warehouse-filter"
              label="盘点仓库"
              value={warehouse}
              load={loadStocktakeFilterWarehouses}
              onChange={(value) => {
                setWarehouse(value);
                setPage(1);
              }}
            />
          ) : null}
          <div className="flex h-9 items-center justify-end">
            {hasFilters ? (
              <Button type="button" size="sm" variant="ghost" onClick={clearFilters}>
                <RotateCcw data-icon="inline-start" />
                清除筛选
              </Button>
            ) : null}
          </div>
        </form>
      </CardHeader>
      <CardContent className="flex min-h-0 flex-1 flex-col p-0">
        <div className="min-h-0 flex-1 overflow-auto">
          <Table
            aria-label="盘点单列表"
            aria-busy={loading}
            className="min-w-[900px]"
            containerClassName="overflow-visible"
          >
            <TableHeader className="bg-card lg:sticky lg:top-0 lg:z-10">
              <TableRow>
                {STOCKTAKE_COLUMNS.map((label) => (
                  <TableHead key={label}>{label}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <LoadingRows columns={STOCKTAKE_COLUMNS.length} />
              ) : result?.list.map((order) => (
                <TableRow key={order.id}>
                  <TableCell className="font-medium tabular-nums">{order.order_no}</TableCell>
                  <TableCell>{order.warehouse_name}</TableCell>
                  <TableCell><StocktakeStatus status={order.status} /></TableCell>
                  <TableCell className="tabular-nums">{order.item_count}</TableCell>
                  <TableCell className="tabular-nums">{order.counted_count}</TableCell>
                  <TableCell className="tabular-nums">
                    {stocktakeMoney(order.gain_amount)} / {stocktakeMoney(order.loss_amount)}
                  </TableCell>
                  <TableCell className="tabular-nums">{stocktakeTime(order.updated_at)}</TableCell>
                  <TableCell>
                    <Button variant="link" onClick={() => onOpen(order.id)}>
                      查看 {order.order_no}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {error ? (
            <div className="p-4">
              <StatusAlert title="盘点列表读取失败">
                {error}
                <Button variant="link" onClick={() => setRetry((value) => value + 1)}>
                  重试列表
                </Button>
              </StatusAlert>
            </div>
          ) : !loading && result && !result.list.length ? (
            <Empty className="min-h-64 rounded-none border-0">
              <EmptyHeader>
                <EmptyMedia variant="icon"><ClipboardList /></EmptyMedia>
                <EmptyTitle>{hasFilters ? '没有匹配的盘点单' : '还没有盘点单'}</EmptyTitle>
                <EmptyDescription>
                  {hasFilters
                    ? '调整筛选条件，或清除筛选查看全部盘点记录。'
                    : access.canManage
                      ? '新建盘点后，单据和实盘进度会显示在这里。'
                      : '当前暂无可查看的盘点记录。'}
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : null}
        </div>
        <div className="shrink-0 border-t bg-card px-4">
          <StocktakePager
            label="盘点单分页"
            pagination={result?.pagination}
            onPage={setPage}
          />
        </div>
      </CardContent>
      </Card>
    </section>
  );
}

function LoadingRows({ columns }: { columns: number }) {
  return Array.from({ length: 5 }, (_, row) => (
    <TableRow key={row} aria-hidden="true">
      {Array.from({ length: columns }, (_, column) => (
        <TableCell key={column}>
          <Skeleton className={skeletonWidth(column)} />
        </TableCell>
      ))}
    </TableRow>
  ));
}

function skeletonWidth(column: number) {
  if (column === 0 || column === 1) return 'h-4 w-32';
  if (column === 5 || column === 6) return 'h-4 w-28';
  return 'h-4 w-16';
}
