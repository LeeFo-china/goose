'use client';
import { useMemo, useState } from 'react';
import type { WarehouseStocktakeItem, WarehouseStocktakeOrderSummary } from '@gooes/domain';
import { useStocktakeEditorGuard } from './stocktake-editor-guard';
import { StatusAlert } from '@/components/admin/status-alert';
import { loadBatchWarehouses } from '@/components/supplier-purchase-batches/batch-api';
import { BatchOptionPicker } from '@/components/supplier-purchase-batches/batch-option-picker';
import { Button } from '@/components/ui/button';
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Textarea } from '@/components/ui/textarea';
import { Empty, EmptyHeader, EmptyTitle } from '@/components/ui/empty';
import { loadStocktakeStock } from './stocktake-api';
import { stocktakeDraftSchema, type StocktakeAccess } from './stocktake-rules';
import { StocktakeDiscardDialog } from './stocktake-parts';
import type { StocktakeDraftEdit } from './stocktake-editor-storage';
export interface StocktakeDraftSeed {
  id: string;
  order?: WarehouseStocktakeOrderSummary;
  items: WarehouseStocktakeItem[];
  recovery?: StocktakeDraftEdit;
}
export function StocktakeDraft({
  seed,
  access,
  disabled,
  onSave,
  onClose,
  onEdit,
  onDiscard,
}: {
  seed: StocktakeDraftSeed;
  access: StocktakeAccess;
  disabled: boolean;
  onSave: (path: string, body: object, id: string) => void;
  onClose: () => void;
  onEdit?: (edit: StocktakeDraftEdit) => boolean;
  onDiscard?: () => boolean;
}) {
  const [warehouse, setWarehouse] = useState(
    seed.recovery ? seed.recovery.warehouse : seed.order ? { id: seed.order.warehouse_id, name: seed.order.warehouse_name } : null,
  );
  const [reason, setReason] = useState(seed.recovery?.reason ?? seed.order?.reason ?? '');
  const [lines, setLines] = useState(
    seed.recovery?.lines ?? seed.items.map((item) => ({ id: item.supplier_sku_id, name: item.sku_name + ' · ' + item.sku_code })),
  );
  const [dirty, setDirty] = useState(Boolean(seed.recovery));
  const { discard, setDiscard, close, discardChanges } = useStocktakeEditorGuard(dirty, onClose, onDiscard);
  const [error, setError] = useState('');
  const locked = disabled || !access.canManage;
  function update(change: Partial<Pick<StocktakeDraftEdit, 'warehouse' | 'reason' | 'lines'>>) {
    if (locked) return;
    const next: StocktakeDraftEdit = { kind: 'draft', orderId: seed.id, version: seed.order?.version ?? 0, warehouse, reason, lines, ...change };
    if (onEdit && !onEdit(next)) return;
    setWarehouse(next.warehouse); setReason(next.reason); setLines(next.lines); setDirty(true);
  }
  const stockLoader = useMemo(
    () => (page: number, keyword: string, signal?: AbortSignal) =>
      loadStocktakeStock(warehouse?.id ?? '', page, keyword, signal),
    [warehouse?.id],
  );
  const warehouseLoader = useMemo(
    () => (page: number, keyword: string, signal?: AbortSignal) =>
      loadBatchWarehouses(page, keyword, true, signal),
    [],
  );
  function save() {
    if (locked) return;
    const result = stocktakeDraftSchema.safeParse({
      expected_version: seed.order?.version ?? 0,
      warehouse_id: warehouse?.id,
      reason,
      items: lines.map((line) => ({ supplier_sku_id: line.id })),
    });
    if (!result.success) {
      setError(result.error.issues[0]?.message ?? '请核对盘点草稿');
      return;
    }
    onSave('/warehouse-stocktakes/' + seed.id + '/save-draft', result.data, seed.id);
  }
  return (
    <section aria-label="盘点草稿" className="flex min-w-0 flex-col gap-4">
      <h2 className="text-base font-medium">{seed.order ? '编辑' : '新建'}盘点草稿</h2>
      {error && <StatusAlert>{error}</StatusAlert>}
      <FieldGroup>
        {seed.order ? (
          <p className="text-sm">
            盘点仓库：{warehouse?.name}。已保存草稿不可更换仓库；如需更换仓库，请新建盘点单。
          </p>
        ) : access.canViewWarehouses ? (
          <BatchOptionPicker
            id="stocktake-warehouse"
            label="盘点仓库"
            value={warehouse}
            load={warehouseLoader}
            disabled={locked}
            onChange={(value) => {
              update({ warehouse: { id: value.id, name: value.name }, lines: value.id.toLowerCase() !== warehouse?.id.toLowerCase() ? [] : lines });
            }}
          />
        ) : (
          <StatusAlert tone="warning">新建盘点需要仓库查看权限。</StatusAlert>
        )}
        <Field data-disabled={locked} data-invalid={Boolean(error)}>
          <FieldLabel htmlFor="stocktake-reason">盘点原因</FieldLabel>
          <Textarea
            id="stocktake-reason"
            maxLength={500}
            value={reason}
            disabled={locked}
            aria-invalid={Boolean(error)}
            onChange={(event) => {
              update({ reason: event.target.value });
            }}
          />
        </Field>
        {warehouse && (
          <BatchOptionPicker
            key={warehouse.id}
            id="stocktake-sku"
            label="盘点材料"
            value={null}
            load={stockLoader}
            disabled={locked || lines.length >= 100}
            onChange={(value) => {
              if (lines.some((line) => line.id.toLowerCase() === value.id.toLowerCase())) {
                setError('盘点 SKU 不能重复');
                return;
              }
              update({ lines: [...lines, { id: value.id, name: value.name }] });
              setError('');
            }}
          />
        )}
        <p className="text-sm text-muted-foreground">
          选择 1 至 100 种仓库存料（包含已有零库存）。开始盘点时冻结账面快照；草稿不填写数量或成本。
        </p>
        {!lines.length ? (
          <Empty>
            <EmptyHeader>
              <EmptyTitle>请先选择盘点材料</EmptyTitle>
            </EmptyHeader>
          </Empty>
        ) : (
          lines.map((line) => (
            <Field key={line.id} orientation="horizontal">
              <span className="min-w-0 flex-1 break-words">{line.name}</span>
              <Button
                variant="outline"
                disabled={locked}
                aria-label={'移除 ' + line.name}
                onClick={() => {
                  update({ lines: lines.filter((item) => item.id !== line.id) });
                }}
              >
                移除
              </Button>
            </Field>
          ))
        )}
      </FieldGroup>
      <div className="flex gap-2">
        <Button disabled={locked || !warehouse} onClick={save}>
          保存草稿
        </Button>
        <Button variant="outline" disabled={disabled} onClick={close}>
          关闭编辑
        </Button>
      </div>
      <StocktakeDiscardDialog open={discard} onOpenChange={setDiscard} onDiscard={discardChanges} />
    </section>
  );
}
