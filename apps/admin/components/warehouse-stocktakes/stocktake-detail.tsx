'use client';
import { useEffect, useRef, useState } from 'react';
import type { WarehouseStocktakeItem, WarehouseStocktakeOrderSummary } from '@gooes/domain';
import { StatusAlert } from '@/components/admin/status-alert';
import { Button } from '@/components/ui/button';
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
import { loadCompleteStocktakeItems, readStocktake, type StocktakePage } from './stocktake-api';
import type { StocktakeDraftSeed } from './stocktake-draft';
import {
  StocktakeItemTable,
  StocktakeLoading,
  StocktakePager,
  StocktakeStatus,
  stocktakeMoney,
  stocktakeTime,
} from './stocktake-parts';
import {
  stocktakeActions,
  stocktakeError,
  type StocktakeAccess,
  type StocktakeAction,
} from './stocktake-rules';
export type StocktakeCountsSeed = { order: WarehouseStocktakeOrderSummary; items: WarehouseStocktakeItem[] };
const LABELS: Record<StocktakeAction, string> = {
  'save-draft': '编辑草稿',
  start: '开始盘点',
  'record-counts': '录入实盘',
  submit: '提交盘点',
  complete: '完成盘点',
  cancel: '取消盘点',
};
export function StocktakeDetail({
  id,
  revision,
  access,
  disabled,
  onDraft,
  onCounts,
  onCommand,
}: {
  id: string;
  revision: number;
  access: StocktakeAccess;
  disabled: boolean;
  onDraft: (seed: StocktakeDraftSeed) => void;
  onCounts: (seed: StocktakeCountsSeed) => void;
  onCommand: (path: string, body: object, id: string) => void;
}) {
  const [order, setOrder] = useState<WarehouseStocktakeOrderSummary | null>(null);
  const [items, setItems] = useState<StocktakePage<WarehouseStocktakeItem> | null>(null);
  const [page, setPage] = useState(1);
  const [retry, setRetry] = useState(0);
  const [error, setError] = useState('');
  const [editError, setEditError] = useState('');
  const [editBusy, setEditBusy] = useState(false);
  const editController = useRef<AbortController | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    setOrder(null);
    setItems(null);
    setError('');
    setEditBusy(false);
    setEditError('');
    Promise.all([
      readStocktake<WarehouseStocktakeOrderSummary>('/warehouse-stocktakes/' + id, controller.signal),
      readStocktake<StocktakePage<WarehouseStocktakeItem>>(
        '/warehouse-stocktakes/' + id + '/items?page=' + page + '&pageSize=20',
        controller.signal,
      ),
    ])
      .then(([nextOrder, nextItems]) => {
        if (controller.signal.aborted) return;
        if (page > Math.max(1, nextItems.pagination.totalPages)) {
          setPage(Math.max(1, nextItems.pagination.totalPages));
          return;
        }
        setOrder(nextOrder);
        setItems(nextItems);
      })
      .catch((caught) => {
        if (!controller.signal.aborted) setError(stocktakeError(caught));
      });
    return () => {
      controller.abort();
      editController.current?.abort();
    };
  }, [id, revision, page, retry]);
  async function edit() {
    if (!order || disabled || editBusy || !access.canManage) return;
    editController.current?.abort();
    const controller = new AbortController();
    editController.current = controller;
    setEditBusy(true);
    setEditError('');
    try {
      const complete = await loadCompleteStocktakeItems(order, controller.signal);
      if (controller.signal.aborted) return;
      if (!complete.items) setEditError(complete.error);
      else if (order.status === 'draft') onDraft({ id, order, items: complete.items });
      else if (order.status === 'counting') onCounts({ order, items: complete.items });
    } catch (caught) {
      if (!controller.signal.aborted) setEditError(stocktakeError(caught));
    } finally {
      if (!controller.signal.aborted) setEditBusy(false);
    }
  }
  if (error)
    return (
      <StatusAlert title="盘点单读取失败">
        {error}
        <Button variant="link" onClick={() => setRetry((value) => value + 1)}>
          重新读取单据
        </Button>
      </StatusAlert>
    );
  if (!order || !items) return <StocktakeLoading />;
  return (
    <>
      {editError && <StatusAlert>{editError}</StatusAlert>}
      <StocktakeDetailContent
        key={order.id + ':' + order.version}
        order={order}
        items={items}
        access={access}
        disabled={disabled || editBusy}
        onEdit={() => void edit()}
        onCommand={onCommand}
        onPage={setPage}
      />
    </>
  );
}
export function StocktakeDetailContent({
  order,
  items,
  access,
  disabled,
  onEdit,
  onCommand,
  onPage,
}: {
  order: WarehouseStocktakeOrderSummary;
  items: StocktakePage<WarehouseStocktakeItem>;
  access: StocktakeAccess;
  disabled: boolean;
  onEdit: () => void;
  onCommand: (path: string, body: object, id: string) => void;
  onPage: (page: number) => void;
}) {
  const [confirm, setConfirm] = useState<StocktakeAction | null>(null);
  const actions = stocktakeActions(
    order.status,
    access,
    order.item_count > 0 && order.counted_count === order.item_count,
  );
  const descriptions = {
    start: '开始后冻结所选材料的账面数量、金额与成本快照，再录入实盘。',
    submit: '提交后不可继续录入实盘，请确认所有材料及差异原因均已保存。',
    complete: '完成后按差异数量调整仓库库存；发生快照冲突时需取消并重新盘点。',
    cancel: '取消后本单不可继续操作。如需盘点，请新建单据。',
  };
  return (
    <section aria-label="盘点单详情" className="flex min-w-0 flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-base font-medium">{order.order_no}</h2>
        <StocktakeStatus status={order.status} />
        <span className="text-xs text-muted-foreground">版本 {order.version}</span>
      </div>
      <p className="text-sm">
        {order.warehouse_name} · {order.item_count} 种材料 · 已实盘 {order.counted_count} · 有差异{' '}
        {order.difference_count}
      </p>
      <p className="text-sm">
        盘盈金额 {stocktakeMoney(order.gain_amount ?? null)} · 盘亏金额{' '}
        {stocktakeMoney(order.loss_amount ?? null)}
      </p>
      <p className="text-sm break-words">原因：{order.reason}</p>
      <p className="text-xs text-muted-foreground">更新于 {stocktakeTime(order.updated_at)}</p>
      <div className="flex flex-wrap gap-2">
        {actions.map((action) => (
          <Button
            key={action}
            variant="outline"
            disabled={disabled}
            onClick={() =>
              action === 'save-draft' || action === 'record-counts' ? onEdit() : setConfirm(action)
            }
          >
            {LABELS[action]}
          </Button>
        ))}
      </div>
      {order.status === 'counting' && order.counted_count !== order.item_count && (
        <p className="text-sm text-muted-foreground">请先录入并保存全部实盘数量，再提交盘点。</p>
      )}
      <StocktakeItemTable items={items.list} />
      <StocktakePager label="盘点明细分页" pagination={items.pagination} onPage={onPage} />
      <AlertDialog
        open={Boolean(confirm)}
        onOpenChange={(open) => {
          if (!open) setConfirm(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirm ? LABELS[confirm] : '确认盘点操作'}</AlertDialogTitle>
            <AlertDialogDescription>
              {confirm && confirm in descriptions ? descriptions[confirm as keyof typeof descriptions] : ''}{' '}
              将以版本 {order.version} 执行。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={disabled}>返回</AlertDialogCancel>
            <AlertDialogAction
              disabled={disabled}
              onClick={() => {
                if (confirm && actions.includes(confirm) && !disabled)
                  onCommand(
                    '/warehouse-stocktakes/' + order.id + '/' + confirm,
                    { expected_version: order.version },
                    order.id,
                  );
                setConfirm(null);
              }}
            >
              确认执行
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
