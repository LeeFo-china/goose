'use client';

import { useEffect, useState } from 'react';
import { WAREHOUSE_TRANSFER_STATUS_LABELS, type WarehouseTransferSummary } from '@gooes/domain';

import { FormSelect } from '@/components/admin/form-select';
import { StatusAlert } from '@/components/admin/status-alert';
import { BatchOptionPicker } from '@/components/supplier-purchase-batches/batch-option-picker';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Empty, EmptyHeader, EmptyTitle } from '@/components/ui/empty';
import { Field, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

import { loadTransferFilterWarehouses, readTransfer, type TransferPage } from './transfer-api';
import { TransferPager, transferMoney, transferTime } from './transfer-parts';
import { transferError, transferListPath, type TransferAccess } from './transfer-rules';

export function TransferList({ access, revision, onOpen }: { access: TransferAccess; revision: number; onOpen: (id: string) => void }) {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState(''); const [keyword, setKeyword] = useState('');
  const [status, setStatus] = useState('all');
  const [source, setSource] = useState<{ id: string; name: string } | null>(null);
  const [destination, setDestination] = useState<{ id: string; name: string } | null>(null);
  const [result, setResult] = useState<TransferPage<WarehouseTransferSummary> | null>(null);
  const [error, setError] = useState(''); const [retry, setRetry] = useState(0);
  const warehouseLoader = loadTransferFilterWarehouses;
  const path = transferListPath({ page, pageSize: 20, keyword, status: status === 'all' ? '' : status,
    sourceWarehouseId: source?.id, destinationWarehouseId: destination?.id });
  useEffect(() => {
    const controller = new AbortController(); setResult(null); setError('');
    readTransfer<TransferPage<WarehouseTransferSummary>>(path, controller.signal).then((next) => {
      if (controller.signal.aborted) return;
      if (page > Math.max(1, next.pagination.totalPages)) { setPage(Math.max(1, next.pagination.totalPages)); return; }
      setResult(next);
    }).catch((caught) => { if (!controller.signal.aborted) setError(transferError(caught)); });
    return () => controller.abort();
  }, [path, revision, retry, page]);
  return <section className="flex min-w-0 flex-col gap-3" aria-label="调拨单列表">
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
      <form onSubmit={(event) => { event.preventDefault(); setKeyword(search.trim()); setPage(1); }}><Field><FieldLabel htmlFor="transfer-search">搜索单号 / 原因</FieldLabel><div className="flex gap-2"><Input id="transfer-search" value={search} maxLength={100} onChange={(event) => setSearch(event.target.value)} /><Button type="submit" variant="outline">搜索</Button></div></Field></form>
      <Field><FieldLabel htmlFor="transfer-status">状态</FieldLabel><FormSelect id="transfer-status" value={status} options={[{ value: 'all', label: '全部状态' }, ...Object.entries(WAREHOUSE_TRANSFER_STATUS_LABELS).map(([value, label]) => ({ value, label }))]} onChange={(value) => { setStatus(value); setPage(1); }} /></Field>
      {access.canViewWarehouses && <BatchOptionPicker id="transfer-source-filter" label="调出仓库" value={source} load={warehouseLoader} onChange={(value) => { setSource(value); setPage(1); }} />}
      {access.canViewWarehouses && <BatchOptionPicker id="transfer-destination-filter" label="调入仓库" value={destination} load={warehouseLoader} onChange={(value) => { setDestination(value); setPage(1); }} />}
    </div>
    <div><Button size="sm" variant="ghost" onClick={() => { setSource(null); setDestination(null); setStatus('all'); setKeyword(''); setSearch(''); setPage(1); }}>清除筛选</Button></div>
    {error ? <StatusAlert title="调拨列表读取失败">{error}<Button variant="link" onClick={() => setRetry((value) => value + 1)}>重试列表</Button></StatusAlert> :
      !result ? <p role="status">正在加载调拨单…</p> : !result.list.length ? <Empty><EmptyHeader><EmptyTitle>暂无符合条件的调拨单</EmptyTitle></EmptyHeader></Empty> :
      <Table aria-label="调拨单列表" className="min-w-[900px]"><TableHeader><TableRow>{['单号', '调出仓库', '调入仓库', '状态', '材料数', '总金额', '更新时间', '操作'].map((label) => <TableHead key={label}>{label}</TableHead>)}</TableRow></TableHeader><TableBody>
        {result.list.map((order) => <TableRow key={order.id}><TableCell>{order.order_no}</TableCell><TableCell>{order.source_warehouse_name}</TableCell><TableCell>{order.destination_warehouse_name}</TableCell><TableCell><Badge variant="secondary">{WAREHOUSE_TRANSFER_STATUS_LABELS[order.status]}</Badge></TableCell><TableCell>{order.item_count}</TableCell><TableCell>{transferMoney(order.total_amount)}</TableCell><TableCell>{transferTime(order.updated_at)}</TableCell><TableCell><Button variant="link" onClick={() => onOpen(order.id)}>查看 {order.order_no}</Button></TableCell></TableRow>)}
      </TableBody></Table>}
    <TransferPager label="调拨单分页" pagination={result?.pagination} onPage={setPage} />
  </section>;
}
