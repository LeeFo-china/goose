'use client';
import { useState } from 'react';
import type {
  WarehouseStocktakeItem,
  WarehouseStocktakeOrderSummary,
  WarehouseStocktakeCountsInput,
} from '@gooes/domain';
import { useStocktakeEditorGuard } from './stocktake-editor-guard';
import { StatusAlert } from '@/components/admin/status-alert';
import { Button } from '@/components/ui/button';
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { formatInventoryDecimal } from '@/components/inventory/inventory-rules';
import { stocktakeCountsSchema, stocktakeDifference } from './stocktake-rules';
import { StocktakeDiscardDialog, stocktakeMoney } from './stocktake-parts';
interface CountLine {
  item: WarehouseStocktakeItem;
  counted: string;
  reason: string;
}
export function buildStocktakeCounts(
  version: number,
  lines: CountLine[],
): { payload?: WarehouseStocktakeCountsInput; error: string } {
  const selected = lines.filter((line) => line.counted !== '');
  for (const line of selected) {
    const difference = stocktakeDifference(line.counted, line.item.book_quantity);
    if (difference === null) return { error: '请核对实盘数量与账面快照，数量最多 14 位整数、4 位小数' };
    if (difference !== '0' && !line.reason.trim()) return { error: line.item.sku_name + '：请填写差异原因' };
  }
  const result = stocktakeCountsSchema.safeParse({
    expected_version: version,
    items: selected.map((line) => ({
      supplier_sku_id: line.item.supplier_sku_id,
      counted_quantity: line.counted,
      difference_reason: line.reason.trim() || null,
    })),
  });
  return result.success
    ? { payload: result.data, error: '' }
    : { error: result.error.issues[0]?.message ?? '请至少录入一种材料' };
}
export function StocktakeCounts({
  order,
  items,
  disabled,
  onSave,
  onClose,
}: {
  order: WarehouseStocktakeOrderSummary;
  items: WarehouseStocktakeItem[];
  disabled: boolean;
  onSave: (path: string, body: object, id: string) => void;
  onClose: () => void;
}) {
  const [lines, setLines] = useState<CountLine[]>(
    items.map((item) => ({
      item,
      counted: item.counted_quantity ?? '',
      reason: item.difference_reason ?? '',
    })),
  );
  const [dirty, setDirty] = useState(false);
  const { discard, setDiscard, close, discardChanges } = useStocktakeEditorGuard(dirty, onClose);
  const [error, setError] = useState('');
  function update(id: string, change: Partial<Pick<CountLine, 'counted' | 'reason'>>) {
    setLines((current) => current.map((line) => (line.item.id === id ? { ...line, ...change } : line)));
    setDirty(true);
  }
  function save() {
    if (disabled) return;
    const result = buildStocktakeCounts(order.version, lines);
    if (!result.payload) {
      setError(result.error);
      return;
    }
    onSave('/warehouse-stocktakes/' + order.id + '/record-counts', result.payload, order.id);
  }
  return (
    <section aria-label="录入实盘" className="flex min-w-0 flex-col gap-4">
      <h2 className="text-base font-medium">录入实盘 · {order.order_no}</h2>
      <p className="text-sm text-muted-foreground">
        空白表示暂不录入，0 表示实盘为零。允许分次保存；全部保存后才能提交。当前版本 {order.version}。
      </p>
      {error && <StatusAlert>{error}</StatusAlert>}
      {lines.map((line) => (
        <FieldGroup key={line.item.id}>
          <h3 className="text-sm font-medium">
            {line.item.sku_name} · {line.item.sku_code}
          </h3>
          <p className="text-sm">
            账面数量{' '}
            {line.item.book_quantity === null ? '未冻结' : formatInventoryDecimal(line.item.book_quantity)} ·
            账面金额 {stocktakeMoney(line.item.book_value)} · 账面单价{' '}
            {stocktakeMoney(line.item.book_unit_cost)}
          </p>
          <Field data-disabled={disabled} data-invalid={Boolean(error)}>
            <FieldLabel htmlFor={'stocktake-count-' + line.item.id}>实盘数量</FieldLabel>
            <Input
              id={'stocktake-count-' + line.item.id}
              aria-label={'实盘数量 ' + line.item.sku_name + ' ' + line.item.sku_code}
              inputMode="decimal"
              maxLength={19}
              value={line.counted}
              disabled={disabled}
              aria-invalid={Boolean(error)}
              onChange={(event) => update(line.item.id, { counted: event.target.value })}
            />
          </Field>
          <p className="text-sm">
            差异数量：{stocktakeDifference(line.counted, line.item.book_quantity) ?? '未录入或数量无效'}
          </p>
          <Field data-disabled={disabled}>
            <FieldLabel htmlFor={'stocktake-difference-reason-' + line.item.id}>
              差异原因（差异非零必填）
            </FieldLabel>
            <Textarea
              id={'stocktake-difference-reason-' + line.item.id}
              aria-label={'差异原因 ' + line.item.sku_name + ' ' + line.item.sku_code}
              maxLength={500}
              value={line.reason}
              disabled={disabled}
              onChange={(event) => update(line.item.id, { reason: event.target.value })}
            />
          </Field>
        </FieldGroup>
      ))}
      <div className="flex gap-2">
        <Button disabled={disabled} onClick={save}>
          保存实盘
        </Button>
        <Button variant="outline" disabled={disabled} onClick={close}>
          关闭编辑
        </Button>
      </div>
      <StocktakeDiscardDialog open={discard} onOpenChange={setDiscard} onDiscard={discardChanges} />
    </section>
  );
}
