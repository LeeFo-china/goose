'use client';

import { useEffect, useRef, useState } from 'react';
import { WAREHOUSE_TRANSFER_STATUS_LABELS, type WarehouseTransferItem, type WarehouseTransferSummary } from '@gooes/domain';

import { StatusAlert } from '@/components/admin/status-alert';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

import { loadCompleteTransferItems, readTransfer, type TransferPage } from './transfer-api';
import type { TransferDraftSeed } from './transfer-draft';
import { TransferPager, transferMoney, transferTime } from './transfer-parts';
import { transferError, type TransferAccess } from './transfer-rules';

type CommandAction = 'submit' | 'complete' | 'cancel';
export function TransferDetail({ id, revision, access, disabled, onDraft, onCommand }: {
  id: string; revision: number; access: TransferAccess; disabled: boolean;
  onDraft: (seed: TransferDraftSeed) => void; onCommand: (path: string, body: object, id: string) => void;
}) {
  const [order, setOrder] = useState<WarehouseTransferSummary | null>(null);
  const [items, setItems] = useState<TransferPage<WarehouseTransferItem> | null>(null);
  const [page, setPage] = useState(1); const [retry, setRetry] = useState(0); const [error, setError] = useState('');
  const [editError, setEditError] = useState(''); const [editBusy, setEditBusy] = useState(false);
  const [confirm, setConfirm] = useState<CommandAction | null>(null);
  const editController = useRef<AbortController | null>(null);
  useEffect(() => {
    const controller = new AbortController(); setOrder(null); setItems(null); setError(''); setConfirm(null);
    Promise.all([
      readTransfer<WarehouseTransferSummary>(`/warehouse-transfers/${id}`, controller.signal),
      readTransfer<TransferPage<WarehouseTransferItem>>(`/warehouse-transfers/${id}/items?page=${page}&pageSize=20`, controller.signal),
    ]).then(([nextOrder, nextItems]) => { if (!controller.signal.aborted) { setOrder(nextOrder); setItems(nextItems); } })
      .catch((caught) => { if (!controller.signal.aborted) setError(transferError(caught)); });
    return () => controller.abort();
  }, [id, revision, page, retry]);
  useEffect(() => () => editController.current?.abort(), [id, revision]);
  async function edit() {
    if (!order) return;
    editController.current?.abort();
    const controller = new AbortController(); editController.current = controller; setEditBusy(true); setEditError('');
    try { const complete = await loadCompleteTransferItems(order, controller.signal); if (controller.signal.aborted) return; if (!complete.items) setEditError(complete.error); else onDraft({ id, order, items: complete.items }); }
    catch (caught) { if (!controller.signal.aborted) setEditError(transferError(caught)); }
    finally { if (!controller.signal.aborted) setEditBusy(false); }
  }
  if (error) return <StatusAlert title="调拨单读取失败">{error}<Button variant="link" onClick={() => setRetry((value) => value + 1)}>重新读取单据</Button></StatusAlert>;
  if (!order || !items) return <p role="status">正在读取调拨单…</p>;
  const locked = disabled || editBusy;
  const actions: { key: CommandAction; label: string }[] = [];
  if (access.canManage && order.status === 'draft') actions.push({ key: 'submit', label: '提交调拨' });
  if (access.canApprove && order.status === 'submitted') actions.push({ key: 'complete', label: '完成调拨' });
  if (access.canManage && ['draft', 'submitted'].includes(order.status)) actions.push({ key: 'cancel', label: '取消调拨' });
  return <section aria-label="调拨单详情" className="flex min-w-0 flex-col gap-4">
    <div className="flex flex-wrap items-center gap-3"><h2 className="text-base font-medium">{order.order_no}</h2><Badge variant="secondary">{WAREHOUSE_TRANSFER_STATUS_LABELS[order.status]}</Badge><span className="text-xs text-muted-foreground">版本 {order.version}</span></div>
    <p className="text-sm">{order.source_warehouse_name} → {order.destination_warehouse_name} · {order.item_count} 种材料 · 总金额 {transferMoney(order.total_amount)}</p>
    <p className="text-sm">原因：{order.reason}</p><p className="text-xs text-muted-foreground">更新于 {transferTime(order.updated_at)}</p>
    {editError && <StatusAlert>{editError}</StatusAlert>}
    <div className="flex flex-wrap gap-2">{access.canManage && order.status === 'draft' && <Button disabled={locked} onClick={() => void edit()}>编辑草稿</Button>}{actions.map((action) => <Button key={action.key} variant="outline" disabled={locked} onClick={() => setConfirm(action.key)}>{action.label}</Button>)}</div>
    <Table aria-label="调拨明细" className="min-w-[650px]"><TableHeader><TableRow>{['材料', '数量', '成本单价', '金额'].map((label) => <TableHead key={label}>{label}</TableHead>)}</TableRow></TableHeader><TableBody>{items.list.map((item) => <TableRow key={item.id}><TableCell>{item.sku_name}<p className="text-xs text-muted-foreground">{item.sku_code}</p></TableCell><TableCell>{item.quantity}</TableCell><TableCell>{transferMoney(item.unit_cost)}</TableCell><TableCell>{transferMoney(item.amount)}</TableCell></TableRow>)}</TableBody></Table>
    <TransferPager label="调拨明细分页" pagination={items.pagination} onPage={setPage} />
    <AlertDialog open={Boolean(confirm)} onOpenChange={(open) => { if (!open) setConfirm(null); }}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>确认调拨操作</AlertDialogTitle><AlertDialogDescription>{confirm === 'complete' ? '完成后将同时扣减调出仓库并增加调入仓库库存，且不生成项目成本、应付或付款记录。' : `将以版本 ${order.version} 执行“${actions.find((action) => action.key === confirm)?.label ?? ''}”，请核对单据后继续。`}</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel disabled={locked}>返回</AlertDialogCancel><AlertDialogAction disabled={locked} onClick={() => { if (confirm) onCommand(`/warehouse-transfers/${id}/${confirm}`, { expected_version: order.version }, id); setConfirm(null); }}>确认执行</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </section>;
}
