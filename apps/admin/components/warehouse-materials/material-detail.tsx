'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import {
  WAREHOUSE_ISSUE_STATUS_LABELS,
  WAREHOUSE_RETURN_STATUS_LABELS,
  type WarehouseMaterialDocumentType,
  type WarehouseMaterialOrder,
} from '@gooes/domain';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { StatusAlert } from '@/components/admin/status-alert';
import {
  readMaterial,
  loadCompleteItems,
  type MaterialItem,
  type MaterialPage,
} from './material-api';
import {
  materialBase,
  materialError,
  type MaterialAccess,
} from './material-rules';
import { MaterialPager, materialMoney } from './material-parts';
import type { MaterialDraftSeed } from './material-draft';

export function MaterialDetail({
  kind,
  id,
  revision,
  access,
  disabled,
  onDraft,
  onCommand,
}: {
  kind: WarehouseMaterialDocumentType;
  id: string;
  revision: number;
  access: MaterialAccess;
  disabled: boolean;
  onDraft: (seed: MaterialDraftSeed) => void;
  onCommand: (path: string, body: object, id: string) => void;
}) {
  const [order, setOrder] = useState<WarehouseMaterialOrder | null>(null);
  const [items, setItems] = useState<MaterialPage<MaterialItem> | null>(null);
  const [page, setPage] = useState(1);
  const [retry, setRetry] = useState(0);
  const [error, setError] = useState('');
  const [draftError, setDraftError] = useState('');
  const [draftBusy, setDraftBusy] = useState(false);
  const [confirm, setConfirm] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    setOrder(null);
    setItems(null);
    setError('');
    setConfirm('');
    Promise.all([
      readMaterial<WarehouseMaterialOrder>(
        `${materialBase(kind)}/${id}`,
        controller.signal,
      ),
      readMaterial<MaterialPage<MaterialItem>>(
        `${materialBase(kind)}/${id}/items?page=${page}&pageSize=20`,
        controller.signal,
      ),
    ])
      .then(([next, lines]) => {
        if (controller.signal.aborted) return;
        setOrder(next);
        setItems(lines);
      })
      .catch((error) => {
        if (!controller.signal.aborted) setError(materialError(error));
      });
    return () => controller.abort();
  }, [kind, id, revision, page, retry]);
  // Abort the bounded editor read on route/order changes as well as unmount.
  const [draftController] = useState(() => ({
    current: new AbortController(),
  }));
  useEffect(() => {
    draftController.current = new AbortController();
    return () => draftController.current.abort();
  }, [draftController, id, revision]);
  async function edit(returning = false) {
    if (!order) return;
    const signal = draftController.current.signal;
    setDraftBusy(true);
    setDraftError('');
    try {
      const complete = await loadCompleteItems(kind, order, signal);
      if (signal.aborted) return;
      if (!complete.items) {
        setDraftError(complete.error);
        return;
      }
      onDraft({
        kind: returning ? 'return' : kind,
        id: returning ? crypto.randomUUID() : id,
        order: returning ? undefined : order,
        source: returning ? order : undefined,
        items: complete.items,
      });
    } catch (error) {
      if (!signal.aborted) setDraftError(materialError(error));
    } finally {
      if (!signal.aborted) setDraftBusy(false);
    }
  }
  if (error)
    return (
      <StatusAlert title="单据读取失败">
        {error}
        <p>若刚才已提示操作成功，仅重新读取，不会重复提交。</p>
        <Button variant="link" onClick={() => setRetry((value) => value + 1)}>
          重新读取单据
        </Button>
      </StatusAlert>
    );
  if (!order || !items) return <p role="status">正在读取单据…</p>;
  const locked = disabled || draftBusy;
  const actions: { key: string; label: string }[] = [];
  if (access.canManage && kind === 'issue' && order.status === 'draft')
    actions.push({ key: 'submit', label: '提交领料' });
  if (
    access.canApprove &&
    ((kind === 'issue' && order.status === 'submitted') ||
      (kind === 'return' && order.status === 'draft'))
  )
    actions.push({
      key: 'complete',
      label: kind === 'issue' ? '确认出库' : '确认退料',
    });
  if (access.canManage && ['draft', 'submitted'].includes(order.status))
    actions.push({ key: 'cancel', label: '取消单据' });
  return (
    <section aria-label="单据详情" className="flex min-w-0 flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-base font-medium">{order.order_no}</h2>
        <Badge variant="secondary">
          {order.document_type === 'issue'
            ? WAREHOUSE_ISSUE_STATUS_LABELS[order.status]
            : WAREHOUSE_RETURN_STATUS_LABELS[order.status]}
        </Badge>
        <span className="text-xs text-muted-foreground">
          版本 {order.version}
        </span>
      </div>
      <p className="text-sm">
        {order.warehouse_name} · {order.project_name} · 成本金额{' '}
        {materialMoney(order.total_amount)}
      </p>
      <p className="break-words text-sm">原因：{order.reason || '未填写'}</p>
      {order.document_type === 'return' && (
        <div>
          <Button variant="link" asChild>
            <Link
              href={`/warehouse-issues?order_id=${order.original_issue_order_id}`}
            >
              原领料单 {order.original_issue_order_no}
            </Link>
          </Button>
        </div>
      )}
      {draftError && <StatusAlert>{draftError}</StatusAlert>}
      <div className="flex flex-wrap gap-2">
        {access.canManage && order.status === 'draft' && (
          <Button disabled={locked} onClick={() => void edit()}>
            编辑草稿
          </Button>
        )}
        {access.canManage &&
          kind === 'issue' &&
          order.status === 'completed' && (
            <Button disabled={locked} onClick={() => void edit(true)}>
              发起退料
            </Button>
          )}
        {actions.map((action) => (
          <Button
            key={action.key}
            variant="outline"
            disabled={locked}
            onClick={() => setConfirm(action.key)}
          >
            {action.label}
          </Button>
        ))}
      </div>
      {confirm && (
        <StatusAlert tone="warning" title="确认单据操作">
          <p>
            将以版本 {order.version} 执行「
            {actions.find((action) => action.key === confirm)?.label}
            」。出入库完成后不可修改；库存和可退数量以服务端结果为准。
          </p>
          <div className="mt-2 flex gap-2">
            <Button
              disabled={locked}
              onClick={() => {
                onCommand(
                  `${materialBase(kind)}/${id}/${confirm}`,
                  { expected_version: order.version },
                  id,
                );
                setConfirm('');
              }}
            >
              确认执行
            </Button>
            <Button
              variant="outline"
              disabled={locked}
              onClick={() => setConfirm('')}
            >
              返回
            </Button>
          </div>
        </StatusAlert>
      )}
      <Table aria-label="材料明细" className="min-w-[850px]">
        <TableHeader>
          <TableRow>
            {[
              '材料',
              '数量',
              '成本单价',
              '成本金额',
              '成本类别',
              '原领料',
              '已退',
              '可退',
            ].map((label) => (
              <TableHead key={label}>{label}</TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.list.map((item) => (
            <TableRow key={item.id}>
              <TableCell>
                {item.sku_name}
                <p className="text-xs text-muted-foreground">{item.sku_code}</p>
              </TableCell>
              <TableCell>{item.quantity}</TableCell>
              <TableCell>{materialMoney(item.unit_cost)}</TableCell>
              <TableCell>{materialMoney(item.amount)}</TableCell>
              <TableCell>{item.cost_category_name ?? '由系统确认'}</TableCell>
              <TableCell>{item.original_issued_quantity}</TableCell>
              <TableCell>{item.returned_quantity}</TableCell>
              <TableCell>{item.returnable_quantity}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <MaterialPager pagination={items.pagination} onPage={setPage} />
    </section>
  );
}
