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
export interface StocktakeDraftSeed {
  id: string;
  order?: WarehouseStocktakeOrderSummary;
  items: WarehouseStocktakeItem[];
}
export function StocktakeDraft({
  seed,
  access,
  disabled,
  onSave,
  onClose,
}: {
  seed: StocktakeDraftSeed;
  access: StocktakeAccess;
  disabled: boolean;
  onSave: (path: string, body: object, id: string) => void;
  onClose: () => void;
}) {
  const [warehouse, setWarehouse] = useState(
    seed.order ? { id: seed.order.warehouse_id, name: seed.order.warehouse_name } : null,
  );
  const [reason, setReason] = useState(seed.order?.reason ?? '');
  const [lines, setLines] = useState(
    seed.items.map((item) => ({ id: item.supplier_sku_id, name: item.sku_name + ' · ' + item.sku_code })),
  );
  const [dirty, setDirty] = useState(false);
  const { discard, setDiscard, close, discardChanges } = useStocktakeEditorGuard(dirty, onClose);
  const [error, setError] = useState('');
  const locked = disabled || !access.canManage;
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
              if (value.id.toLowerCase() !== warehouse?.id.toLowerCase()) setLines([]);
              setWarehouse(value);
              setDirty(true);
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
              setReason(event.target.value);
              setDirty(true);
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
              setLines((current) => [...current, value]);
              setDirty(true);
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
                  setLines((current) => current.filter((item) => item.id !== line.id));
                  setDirty(true);
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
