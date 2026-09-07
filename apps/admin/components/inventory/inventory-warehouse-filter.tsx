'use client';

import { useEffect, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field';
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
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<WarehousePage | null>(null);
  const [loadedPage, setLoadedPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    if (!canViewWarehouses) return;
    const controller = new AbortController();
    setLoading(true);
    setError('');
    loadInventoryWarehouses(
      canViewWarehouses,
      { page, keyword: '' },
      controller.signal,
    )
      .then((data) => {
        if (controller.signal.aborted || !data) return;
        const lastPage = Math.max(1, data.pagination.totalPages);
        if (page > lastPage) {
          setPage(lastPage);
          return;
        }
        setResult(data);
        setLoadedPage(page);
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
  }, [canViewWarehouses, page, retry]);

  const current = !loading && !error && loadedPage === page;
  const warehouses = current ? (result?.list ?? []) : [];
  const totalPages = Math.max(1, result?.pagination.totalPages ?? 0);
  const options = warehouses.map((warehouse) => ({
    id: warehouse.id,
    name: warehouse.name,
    label: `${warehouse.name}${warehouse.status === 'inactive' ? '（已停用）' : ''}`,
  }));
  if (value && !options.some((option) => option.id === value.id))
    options.push({ ...value, label: value.name });

  if (!canViewWarehouses)
    return (
      <Field className="min-w-0">
        <FieldLabel>仓库</FieldLabel>
        <p className="flex h-9 items-center truncate text-sm" title={value?.name}>
          {value?.name ?? '全部仓库'}
        </p>
        <FieldDescription>可点击库存行中的仓库名称筛选。</FieldDescription>
      </Field>
    );

  return (
    <Field className="min-w-0">
      <FieldLabel htmlFor="inventory-warehouse">仓库</FieldLabel>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            id="inventory-warehouse"
            variant="outline"
            className="w-full justify-between"
            title={value?.name ?? '全部仓库'}
          >
            <span className="truncate">{value?.name ?? '全部仓库'}</span>
            <ChevronDown aria-hidden="true" data-icon="inline-end" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="start"
          aria-label="仓库选项"
          className="w-[var(--radix-dropdown-menu-trigger-width)] min-w-56 max-w-[calc(100vw-2rem)]"
        >
          <DropdownMenuRadioGroup
            value={value?.id ?? 'all'}
            onValueChange={(id) => {
              if (id === 'all') onChange(null);
              else {
                const warehouse = options.find((option) => option.id === id);
                if (warehouse)
                  onChange({ id: warehouse.id, name: warehouse.name });
              }
            }}
          >
            <DropdownMenuRadioItem value="all">全部仓库</DropdownMenuRadioItem>
            {options.map((option) => (
              <DropdownMenuRadioItem
                key={option.id}
                value={option.id}
                className="break-all"
              >
                {option.label}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
          {error ? (
            <DropdownMenuGroup>
              <p role="alert" className="px-2 py-2 text-xs text-destructive">
                {error}
              </p>
              <DropdownMenuItem
                onSelect={(event) => {
                  event.preventDefault();
                  setRetry((value) => value + 1);
                }}
              >
                重试
              </DropdownMenuItem>
            </DropdownMenuGroup>
          ) : !current ? (
            <p role="status" className="px-2 py-2 text-xs text-muted-foreground">
              正在加载仓库选项…
            </p>
          ) : warehouses.length === 0 ? (
            <p role="status" className="px-2 py-2 text-xs text-muted-foreground">
              暂无仓库选项
            </p>
          ) : null}
          {totalPages > 1 && (
            <>
              <DropdownMenuSeparator />
              <p
                className="px-2 py-1 text-xs tabular-nums text-muted-foreground"
                aria-live="polite"
              >
                第 {page} / {totalPages} 页仓库选项
              </p>
              <DropdownMenuGroup className="flex justify-between gap-2">
                <DropdownMenuItem
                  disabled={!current || page <= 1}
                  aria-label="上一页仓库选项"
                  onSelect={(event) => {
                    event.preventDefault();
                    setPage((value) => value - 1);
                  }}
                >
                  上一页
                </DropdownMenuItem>
                <DropdownMenuItem
                  disabled={!current || page >= totalPages}
                  aria-label="下一页仓库选项"
                  onSelect={(event) => {
                    event.preventDefault();
                    setPage((value) => value + 1);
                  }}
                >
                  下一页
                </DropdownMenuItem>
              </DropdownMenuGroup>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </Field>
  );
}
