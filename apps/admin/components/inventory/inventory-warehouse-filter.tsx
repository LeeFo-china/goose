'use client';

import { useEffect, useState } from 'react';
import { Search } from 'lucide-react';
import { FormSelect } from '@/components/admin/form-select';
import { Button } from '@/components/ui/button';
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field';
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from '@/components/ui/input-group';
import type { WarehousePage } from '@/components/warehouses/warehouse-types';
import { loadInventoryWarehouses } from './inventory-api';
import type { InventoryIdentity } from './inventory-types';

type Props = {
  canViewWarehouses: boolean;
  value: InventoryIdentity | null;
  onChange: (value: InventoryIdentity | null) => void;
};

export function InventoryWarehouseFilter({
  canViewWarehouses,
  value,
  onChange,
}: Props) {
  const [keyword, setKeyword] = useState('');
  const [search, setSearch] = useState({ keyword: '', page: 1 });
  const [result, setResult] = useState<WarehousePage | null>(null);
  const [loadedKey, setLoadedKey] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const key = `${search.page}:${search.keyword}`;

  useEffect(() => {
    if (!canViewWarehouses) return;
    const timer = window.setTimeout(
      () =>
        setSearch((current) =>
          current.keyword === keyword.trim()
            ? current
            : { keyword: keyword.trim(), page: 1 },
        ),
      300,
    );
    return () => window.clearTimeout(timer);
  }, [canViewWarehouses, keyword]);

  useEffect(() => {
    if (!canViewWarehouses) return;
    const controller = new AbortController();
    setLoading(true);
    setError('');
    loadInventoryWarehouses(canViewWarehouses, search, controller.signal)
      .then((data) => {
        if (controller.signal.aborted || !data) return;
        if (search.page > Math.max(1, data.pagination.totalPages)) {
          setSearch((current) => ({
            ...current,
            page: Math.max(1, data.pagination.totalPages),
          }));
          return;
        }
        setResult(data);
        setLoadedKey(key);
      })
      .catch((caught: unknown) => {
        if (!controller.signal.aborted)
          setError(
            caught instanceof Error ? caught.message : '仓库选项加载失败',
          );
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [canViewWarehouses, search, key, retry]);

  const current =
    !loading &&
    !error &&
    loadedKey === key &&
    keyword.trim() === search.keyword;
  const warehouses = current ? (result?.list ?? []) : [];
  const options = [
    { value: 'all', label: '全部仓库' },
    ...warehouses.map((warehouse) => ({
      value: warehouse.id,
      label: `${warehouse.name}${warehouse.status === 'inactive' ? '（已停用）' : ''}`,
    })),
  ];
  if (value && !options.some((option) => option.value === value.id))
    options.push({ value: value.id, label: value.name });

  if (!canViewWarehouses)
    return (
      <Field className="min-w-0">
        <FieldLabel>仓库</FieldLabel>
        <p className="flex h-10 items-center text-sm">
          {value?.name ?? '全部仓库'}
        </p>
        <FieldDescription>可点击库存行中的仓库名称筛选。</FieldDescription>
      </Field>
    );

  return (
    <Field className="min-w-0">
      <FieldLabel htmlFor="inventory-warehouse">仓库</FieldLabel>
      <FormSelect
        id="inventory-warehouse"
        value={value?.id ?? 'all'}
        options={options}
        onChange={(id) => {
          if (id === 'all') onChange(null);
          else {
            const warehouse = warehouses.find((row) => row.id === id);
            if (warehouse) onChange({ id: warehouse.id, name: warehouse.name });
          }
        }}
      />
      <InputGroup>
        <InputGroupAddon>
          <Search aria-hidden="true" />
        </InputGroupAddon>
        <InputGroupInput
          aria-label="搜索仓库选项"
          placeholder="搜索仓库名称"
          maxLength={80}
          value={keyword}
          onChange={(event) => setKeyword(event.target.value)}
        />
      </InputGroup>
      {error ? (
        <div
          role="alert"
          className="flex flex-wrap items-center gap-2 text-xs text-destructive"
        >
          {error}
          <Button
            variant="link"
            size="sm"
            onClick={() => setRetry((value) => value + 1)}
          >
            重试
          </Button>
        </div>
      ) : (
        <div
          className="flex items-center justify-between gap-2 text-xs text-muted-foreground"
          aria-live="polite"
        >
          <span>
            {current
              ? `第 ${search.page} / ${Math.max(1, result?.pagination.totalPages ?? 0)} 页仓库选项`
              : '正在加载仓库选项…'}
          </span>
          <div className="flex gap-1">
            <Button
              variant="ghost"
              size="sm"
              disabled={!current || search.page <= 1}
              onClick={() =>
                setSearch((value) => ({ ...value, page: value.page - 1 }))
              }
              aria-label="上一页仓库选项"
            >
              上一页
            </Button>
            <Button
              variant="ghost"
              size="sm"
              disabled={
                !current || search.page >= (result?.pagination.totalPages ?? 0)
              }
              onClick={() =>
                setSearch((value) => ({ ...value, page: value.page + 1 }))
              }
              aria-label="下一页仓库选项"
            >
              下一页
            </Button>
          </div>
        </div>
      )}
    </Field>
  );
}
