'use client';

import { useMemo, useState } from 'react';
import type { WarehouseMaterialOrder } from '@gooes/domain';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field';
import { StatusAlert } from '@/components/admin/status-alert';
import { BatchWarehousePicker } from '@/components/supplier-purchase-batches/batch-warehouse-picker';
import { BatchOptionPicker } from '@/components/supplier-purchase-batches/batch-option-picker';
import { loadProjects, loadStock, type MaterialItem } from './material-api';
import {
  materialBase,
  validateLines,
  type MaterialAccess,
} from './material-rules';

export type MaterialDraftSeed = {
  kind: 'issue' | 'return';
  id: string;
  order?: WarehouseMaterialOrder;
  source?: WarehouseMaterialOrder;
  items: MaterialItem[];
};
export function MaterialDraft({
  seed,
  access,
  disabled,
  onSave,
  onClose,
}: {
  seed: MaterialDraftSeed;
  access: MaterialAccess;
  disabled: boolean;
  onSave: (path: string, body: object, id: string) => void;
  onClose: () => void;
}) {
  const origin = seed.order ?? seed.source;
  const [warehouse, setWarehouse] = useState(
    origin ? { id: origin.warehouse_id, name: origin.warehouse_name } : null,
  );
  const [project, setProject] = useState(
    origin ? { id: origin.project_id, name: origin.project_name } : null,
  );
  const [reason, setReason] = useState(seed.order?.reason ?? '');
  const [lines, setLines] = useState(
    seed.items.map((item) => ({
      id:
        seed.kind === 'issue'
          ? item.supplier_sku_id
          : 'original_issue_item_id' in item
            ? item.original_issue_item_id
            : item.id,
      name: `${item.sku_name} · ${item.sku_code}`,
      quantity: seed.source ? '' : item.quantity,
      original: item.original_issued_quantity,
      returned: item.returned_quantity,
      remaining: item.returnable_quantity,
    })),
  );
  const [error, setError] = useState('');
  const stockLoader = useMemo(
    () => (page: number, keyword: string, signal?: AbortSignal) =>
      loadStock(warehouse?.id ?? '', page, keyword, signal),
    [warehouse?.id],
  );
  const immutable = Boolean(origin);
  const save = () => {
    const selected =
      seed.kind === 'return'
        ? lines.filter((line) => line.quantity !== '')
        : lines;
    const validation = validateLines(selected);
    if (validation) {
      setError(validation);
      return;
    }
    if (!warehouse || !project) {
      setError('请选择仓库与项目');
      return;
    }
    setError('');
    const base = {
      expected_version: seed.order?.version ?? 0,
      reason: reason.trim() || null,
    };
    const body =
      seed.kind === 'issue'
        ? {
            ...base,
            warehouse_id: warehouse.id,
            project_id: project.id,
            items: selected.map((line) => ({
              supplier_sku_id: line.id,
              quantity: line.quantity,
            })),
          }
        : {
            ...base,
            original_issue_order_id:
              seed.source?.id ??
              (seed.order?.document_type === 'return'
                ? seed.order.original_issue_order_id
                : ''),
            items: selected.map((line) => ({
              original_issue_item_id: line.id,
              quantity: line.quantity,
            })),
          };
    onSave(`${materialBase(seed.kind)}/${seed.id}/save-draft`, body, seed.id);
  };
  return (
    <section aria-label="材料草稿" className="flex min-w-0 flex-col gap-4">
      <h2 className="text-base font-medium">
        {seed.order ? '编辑' : '新建'}
        {seed.kind === 'issue' ? '领料' : '退料'}草稿
      </h2>
      {error && <StatusAlert>{error}</StatusAlert>}
      <FieldGroup>
        {immutable ? (
          <p className="text-sm">
            仓库：{warehouse?.name} · 项目：{project?.name}
            {seed.source ? ` · 原领料单：${seed.source.order_no}` : ''}
            （保存后不可更改）
          </p>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {access.canViewWarehouses ? (
              <BatchWarehousePicker
                value={warehouse}
                disabled={disabled}
                onChange={(value) => {
                  setWarehouse(value);
                  setLines([]);
                }}
              />
            ) : (
              <StatusAlert tone="warning">
                新建领料需要仓库查看权限，请联系管理员。
              </StatusAlert>
            )}
            <BatchOptionPicker
              id="material-project"
              label="领料项目"
              value={project}
              load={loadProjects}
              disabled={disabled}
              onChange={setProject}
            />
          </div>
        )}
        <Field>
          <FieldLabel htmlFor="material-reason">原因 / 用途</FieldLabel>
          <Textarea
            id="material-reason"
            maxLength={500}
            value={reason}
            disabled={disabled}
            onChange={(event) => setReason(event.target.value)}
          />
        </Field>
        {seed.kind === 'issue' && warehouse && (
          <BatchOptionPicker
            key={warehouse.id}
            id="material-sku"
            label="库存材料"
            value={null}
            load={stockLoader}
            disabled={disabled || lines.length >= 100}
            onChange={(value) => {
              if (lines.some((line) => line.id === value.id)) {
                setError('材料不可重复');
                return;
              }
              setError('');
              setLines((current) => [
                ...current,
                {
                  id: value.id,
                  name: value.name,
                  quantity: '1',
                  original: '0',
                  returned: '0',
                  remaining: '0',
                },
              ]);
            }}
          />
        )}
        <p className="text-sm text-muted-foreground">
          最多 100 种材料；数量最多 4
          位小数。成本单价和默认成本类别由系统确认，不能手动修改。
          {seed.kind === 'return'
            ? '未填写数量的材料不退回。'
            : '提交不预占库存，确认出库时校验可用量。'}
        </p>
        {lines.map((line) => (
          <Field key={line.id}>
            <FieldLabel htmlFor={`material-quantity-${line.id}`}>
              {line.name}
            </FieldLabel>
            {seed.kind === 'return' && (
              <p className="text-xs text-muted-foreground">
                原领料 {line.original} · 已退 {line.returned} · 可退{' '}
                {line.remaining}
              </p>
            )}
            <div className="flex gap-2">
              <Input
                id={`material-quantity-${line.id}`}
                aria-label={`数量 ${line.name}`}
                inputMode="decimal"
                value={line.quantity}
                disabled={disabled}
                maxLength={19}
                onChange={(event) =>
                  setLines((current) =>
                    current.map((item) =>
                      item.id === line.id
                        ? { ...item, quantity: event.target.value }
                        : item,
                    ),
                  )
                }
              />
              <Button
                type="button"
                variant="outline"
                disabled={disabled}
                onClick={() =>
                  setLines((current) =>
                    current.filter((item) => item.id !== line.id),
                  )
                }
              >
                移除
              </Button>
            </div>
          </Field>
        ))}
      </FieldGroup>
      <div className="flex flex-wrap gap-2">
        <Button disabled={disabled || !warehouse || !project} onClick={save}>
          保存草稿
        </Button>
        <Button variant="outline" disabled={disabled} onClick={onClose}>
          关闭编辑
        </Button>
      </div>
    </section>
  );
}
