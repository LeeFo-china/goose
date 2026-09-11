'use client';

import {
  useEffect,
  useState,
  type Dispatch,
  type SetStateAction,
} from 'react';
import { ArrowLeftRight, RotateCcw, Search } from 'lucide-react';
import {
  WAREHOUSE_TRANSFER_STATUS_LABELS,
  type WarehouseTransferSummary,
} from '@gooes/domain';

import { FormSelect } from '@/components/admin/form-select';
import { StatusAlert } from '@/components/admin/status-alert';
import { WarehouseFilterCombobox } from '@/components/warehouses/warehouse-filter-combobox';
import { Badge } from '@/components/ui/badge';
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
  loadTransferFilterWarehouses,
  readTransfer,
  type TransferPage,
} from './transfer-api';
import { TransferPager, transferMoney, transferTime } from './transfer-parts';
import {
  transferError,
  transferListPath,
  type TransferAccess,
} from './transfer-rules';

export interface TransferListState {
  page: number;
  search: string;
  keyword: string;
  status: string;
  source: { id: string; name: string } | null;
  destination: { id: string; name: string } | null;
}

export const INITIAL_TRANSFER_LIST_STATE: TransferListState = {
  page: 1,
  search: '',
  keyword: '',
  status: 'all',
  source: null,
  destination: null,
};

const TRANSFER_COLUMNS = [
  '单号',
  '调出仓库',
  '调入仓库',
  '状态',
  '材料数',
  '总金额',
  '更新时间',
  '操作',
] as const;

export function TransferList({
  access,
  revision,
  onOpen,
  state,
  onChange,
}: {
  access: TransferAccess;
  revision: number;
  onOpen: (id: string) => void;
  state: TransferListState;
  onChange: Dispatch<SetStateAction<TransferListState>>;
}) {
  const { page, search, keyword, status, source, destination } = state;
  const update = (change: Partial<TransferListState>) =>
    onChange((current) => ({ ...current, ...change }));
  const [result, setResult] =
    useState<TransferPage<WarehouseTransferSummary> | null>(null);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const path = transferListPath({
    page,
    pageSize: 20,
    keyword,
    status: status === 'all' ? '' : status,
    sourceWarehouseId: source?.id,
    destinationWarehouseId: destination?.id,
  });
  const hasFilters = Boolean(
    search || keyword || status !== 'all' || source || destination,
  );
  const loading = !result && !error;

  useEffect(() => {
    const controller = new AbortController();
    setResult(null);
    setError('');
    readTransfer<TransferPage<WarehouseTransferSummary>>(path, controller.signal)
      .then((next) => {
        if (controller.signal.aborted) return;
        if (page > Math.max(1, next.pagination.totalPages)) {
          onChange((current) => ({
            ...current,
            page: Math.max(1, next.pagination.totalPages),
          }));
          return;
        }
        setResult(next);
      })
      .catch((caught) => {
        if (!controller.signal.aborted) setError(transferError(caught));
      });
    return () => controller.abort();
  }, [onChange, page, path, retry, revision]);

  function clearFilters() {
    onChange(INITIAL_TRANSFER_LIST_STATE);
  }

  return (
    <section
      className="flex min-h-[28rem] min-w-0 flex-1 lg:min-h-0"
      aria-label="调拨单列表"
    >
      <Card
        data-slot="document-list-card"
        className="flex min-w-0 flex-1 flex-col overflow-hidden shadow-none"
      >
      <CardHeader className="shrink-0 border-b bg-muted/20 p-4">
        <form
          aria-label="筛选调拨单"
          className="grid items-end gap-3 md:grid-cols-2 xl:grid-cols-[minmax(15rem,1.7fr)_minmax(9rem,0.7fr)_minmax(12rem,1fr)_minmax(12rem,1fr)_auto]"
          onSubmit={(event) => {
            event.preventDefault();
            update({ keyword: search.trim(), page: 1 });
          }}
        >
          <Field>
            <FieldLabel htmlFor="transfer-search">单号或原因</FieldLabel>
            <InputGroup className="h-9 bg-card">
              <InputGroupAddon><Search aria-hidden="true" /></InputGroupAddon>
              <InputGroupInput
                id="transfer-search"
                aria-label="搜索单号 / 原因"
                value={search}
                maxLength={100}
                placeholder="搜索调拨单号或原因"
                onChange={(event) => update({ search: event.target.value })}
              />
              <InputGroupAddon align="inline-end">
                <InputGroupButton
                  type="submit"
                  size="icon-xs"
                  aria-label="搜索"
                  title="搜索调拨单"
                >
                  <Search />
                </InputGroupButton>
              </InputGroupAddon>
            </InputGroup>
          </Field>
          <Field>
            <FieldLabel htmlFor="transfer-status">状态</FieldLabel>
            <FormSelect
              id="transfer-status"
              value={status}
              options={[
                { value: 'all', label: '全部状态' },
                ...Object.entries(WAREHOUSE_TRANSFER_STATUS_LABELS).map(
                  ([value, label]) => ({ value, label }),
                ),
              ]}
              onChange={(value) => update({ status: value, page: 1 })}
            />
          </Field>
          {access.canViewWarehouses ? (
            <>
              <WarehouseFilterCombobox
                id="transfer-source-filter"
                label="调出仓库"
                value={source}
                load={loadTransferFilterWarehouses}
                onChange={(value) => update({ source: value, page: 1 })}
              />
              <WarehouseFilterCombobox
                id="transfer-destination-filter"
                label="调入仓库"
                value={destination}
                load={loadTransferFilterWarehouses}
                onChange={(value) => update({ destination: value, page: 1 })}
              />
            </>
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
            aria-label="调拨单列表"
            aria-busy={loading}
            className="min-w-[900px]"
            containerClassName="overflow-visible"
          >
            <TableHeader className="bg-card lg:sticky lg:top-0 lg:z-10">
              <TableRow>
                {TRANSFER_COLUMNS.map((label) => (
                  <TableHead key={label}>{label}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <LoadingRows columns={TRANSFER_COLUMNS.length} />
              ) : result?.list.map((order) => (
                <TableRow key={order.id}>
                  <TableCell className="font-medium tabular-nums">{order.order_no}</TableCell>
                  <TableCell>{order.source_warehouse_name}</TableCell>
                  <TableCell>{order.destination_warehouse_name}</TableCell>
                  <TableCell>
                    <Badge variant="secondary">
                      {WAREHOUSE_TRANSFER_STATUS_LABELS[order.status]}
                    </Badge>
                  </TableCell>
                  <TableCell className="tabular-nums">{order.item_count}</TableCell>
                  <TableCell className="tabular-nums">{transferMoney(order.total_amount)}</TableCell>
                  <TableCell className="tabular-nums">{transferTime(order.updated_at)}</TableCell>
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
              <StatusAlert title="调拨列表读取失败">
                {error}
                <Button variant="link" onClick={() => setRetry((value) => value + 1)}>
                  重试列表
                </Button>
              </StatusAlert>
            </div>
          ) : !loading && result && !result.list.length ? (
            <Empty className="min-h-64 rounded-none border-0">
              <EmptyHeader>
                <EmptyMedia variant="icon"><ArrowLeftRight /></EmptyMedia>
                <EmptyTitle>{hasFilters ? '没有匹配的调拨单' : '还没有调拨单'}</EmptyTitle>
                <EmptyDescription>
                  {hasFilters
                    ? '调整筛选条件，或清除筛选查看全部调拨记录。'
                    : access.canManage
                      ? '新建调拨后，仓库流转记录会显示在这里。'
                      : '当前暂无可查看的调拨记录。'}
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : null}
        </div>
        <div className="shrink-0 border-t bg-card px-4">
          <TransferPager
            label="调拨单分页"
            pagination={result?.pagination}
            onPage={(value) => update({ page: value })}
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
  if (column <= 2) return 'h-4 w-32';
  if (column === 5 || column === 6) return 'h-4 w-28';
  return 'h-4 w-16';
}
