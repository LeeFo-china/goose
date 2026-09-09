'use client';

import { useMemo, useState } from 'react';
import type { WarehouseTransferItem, WarehouseTransferSummary } from '@gooes/domain';

import { StatusAlert } from '@/components/admin/status-alert';
import { loadBatchWarehouses } from '@/components/supplier-purchase-batches/batch-api';
import { BatchOptionPicker } from '@/components/supplier-purchase-batches/batch-option-picker';
import { Button } from '@/components/ui/button';
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';

import { loadTransferStock } from './transfer-api';
import { validateTransferDraft, type TransferAccess } from './transfer-rules';

export interface TransferDraftSeed { id: string; order?: WarehouseTransferSummary; items: WarehouseTransferItem[] }
export function TransferDraft({ seed, access, disabled, onSave, onClose }: {
  seed: TransferDraftSeed; access: TransferAccess; disabled: boolean;
  onSave: (path: string, body: object, id: string) => void; onClose: () => void;
}) {
  const [source, setSource] = useState(seed.order ? { id: seed.order.source_warehouse_id, name: seed.order.source_warehouse_name } : null);
  const [destination, setDestination] = useState(seed.order ? { id: seed.order.destination_warehouse_id, name: seed.order.destination_warehouse_name } : null);
  const [reason, setReason] = useState(seed.order?.reason ?? '');
  const [lines, setLines] = useState(seed.items.map((item) => ({ id: item.supplier_sku_id, name: `${item.sku_name} · ${item.sku_code}`, quantity: item.quantity })));
  const [error, setError] = useState('');
  const stockLoader = useMemo(() => (page: number, keyword: string, signal?: AbortSignal) =>
    loadTransferStock(source?.id ?? '', page, keyword, signal), [source?.id]);
  const warehouseLoader = useMemo(() => (page: number, keyword: string, signal?: AbortSignal) =>
    loadBatchWarehouses(page, keyword, true, signal), []);
  const save = () => {
    const validation = validateTransferDraft({ sourceWarehouseId: source?.id ?? '', destinationWarehouseId: destination?.id ?? '', reason, lines });
    if (validation) { setError(validation); return; }
    onSave(`/warehouse-transfers/${seed.id}/save-draft`, {
      expected_version: seed.order?.version ?? 0, source_warehouse_id: source?.id,
      destination_warehouse_id: destination?.id, reason: reason.trim(),
      items: lines.map((line) => ({ supplier_sku_id: line.id, quantity: line.quantity })),
    }, seed.id);
  };
  return <section aria-label="调拨草稿" className="flex min-w-0 flex-col gap-4">
    <h2 className="text-base font-medium">{seed.order ? '编辑' : '新建'}调拨草稿</h2>
    {error && <StatusAlert>{error}</StatusAlert>}
    <FieldGroup>
      {seed.order ? <p className="text-sm">调出仓库：{source?.name} · 调入仓库：{destination?.name}。已保存草稿不可更换仓库；如需更换仓库，请新建调拨单。</p> : access.canViewWarehouses ?
        <div className="grid gap-4 md:grid-cols-2">
          <BatchOptionPicker id="transfer-source-warehouse" label="调出仓库" value={source} load={warehouseLoader} disabled={disabled} onChange={(value) => { if (value.id.toLowerCase() !== source?.id.toLowerCase()) setLines([]); setSource(value); }} />
          <BatchOptionPicker id="transfer-destination-warehouse" label="调入仓库" value={destination} load={warehouseLoader} disabled={disabled} onChange={setDestination} />
        </div> : <StatusAlert tone="warning">新建调拨需要仓库查看权限。</StatusAlert>}
      <Field><FieldLabel htmlFor="transfer-reason">调拨原因</FieldLabel><Textarea id="transfer-reason" maxLength={500} value={reason} disabled={disabled} onChange={(event) => setReason(event.target.value)} /></Field>
      {source && <BatchOptionPicker key={source.id} id="transfer-sku" label="调出仓库存料" value={null} load={stockLoader} disabled={disabled || lines.length >= 100} onChange={(value) => {
        if (lines.some((line) => line.id.toLowerCase() === value.id.toLowerCase())) { setError('调拨 SKU 不能重复'); return; }
        setError(''); setLines((current) => [...current, { id: value.id, name: value.name, quantity: '1' }]);
      }} />}
      <p className="text-sm text-muted-foreground">1 至 100 种材料，数量最多 14 位整数和 4 位小数。成本与金额由系统完成调拨时确认。</p>
      {lines.map((line) => <Field key={line.id}><FieldLabel htmlFor={`transfer-quantity-${line.id}`}>{line.name}</FieldLabel><div className="flex gap-2">
        <Input id={`transfer-quantity-${line.id}`} inputMode="decimal" maxLength={19} value={line.quantity} disabled={disabled} onChange={(event) => setLines((current) => current.map((item) => item.id === line.id ? { ...item, quantity: event.target.value } : item))} />
        <Button type="button" variant="outline" disabled={disabled} onClick={() => setLines((current) => current.filter((item) => item.id !== line.id))}>移除</Button>
      </div></Field>)}
    </FieldGroup>
    <div className="flex gap-2"><Button disabled={disabled || !source || !destination} onClick={save}>保存草稿</Button><Button variant="outline" disabled={disabled} onClick={onClose}>关闭编辑</Button></div>
  </section>;
}
