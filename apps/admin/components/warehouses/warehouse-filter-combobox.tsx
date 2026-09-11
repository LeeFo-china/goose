'use client';

import { useEffect, useState } from 'react';
import { Check, ChevronsUpDown, Loader2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Command,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Field, FieldLabel } from '@/components/ui/field';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

export interface WarehouseFilterOption {
  id: string;
  name: string;
  status?: string | null;
}

interface WarehouseFilterPage {
  list: WarehouseFilterOption[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

export type WarehouseFilterLoader = (
  page: number,
  keyword: string,
  signal?: AbortSignal,
) => Promise<WarehouseFilterPage>;

const SEARCH_DEBOUNCE_MS = 250;

export function WarehouseFilterCombobox({
  id,
  label,
  value,
  load,
  onChange,
  disabled = false,
}: {
  id: string;
  label: string;
  value: WarehouseFilterOption | null;
  load: WarehouseFilterLoader;
  onChange: (value: WarehouseFilterOption | null) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [keyword, setKeyword] = useState('');
  const [search, setSearch] = useState({ page: 1, keyword: '' });
  const [result, setResult] = useState<WarehouseFilterPage | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    if (!open || disabled) return;
    const timeoutId = window.setTimeout(() => {
      const nextKeyword = keyword.trim();
      setSearch((current) =>
        current.keyword === nextKeyword ? current : { page: 1, keyword: nextKeyword },
      );
    }, SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timeoutId);
  }, [disabled, keyword, open]);

  useEffect(() => {
    if (!open || disabled) return;
    const controller = new AbortController();
    setLoading(true);
    setError('');
    load(search.page, search.keyword, controller.signal)
      .then((next) => {
        if (controller.signal.aborted) return;
        const totalPages = Math.max(1, next.pagination.totalPages);
        if (search.page > totalPages) {
          setSearch((current) => ({ ...current, page: totalPages }));
          return;
        }
        setResult(next);
      })
      .catch((caught: unknown) => {
        if (!controller.signal.aborted) {
          setError(caught instanceof Error ? caught.message : '仓库选项加载失败');
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [disabled, load, open, retry, search.keyword, search.page]);

  useEffect(() => {
    if (open || value) return;
    setKeyword('');
    setSearch((current) =>
      current.page === 1 && !current.keyword ? current : { page: 1, keyword: '' },
    );
    setResult(null);
  }, [open, value]);

  const options = result?.list ?? [];
  const totalPages = Math.max(1, result?.pagination.totalPages ?? 1);
  const searchPending = keyword.trim() !== search.keyword;
  const busy = loading || searchPending;

  function handleOpenChange(nextOpen: boolean) {
    if (disabled) return;
    setOpen(nextOpen);
  }

  function select(option: WarehouseFilterOption | null) {
    onChange(option);
    setOpen(false);
  }

  return (
    <Field className="min-w-0">
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Popover open={open} onOpenChange={handleOpenChange}>
        <PopoverTrigger asChild>
          <Button
            id={id}
            type="button"
            variant="outline"
            role="combobox"
            aria-label={label}
            aria-expanded={open}
            disabled={disabled}
            className="w-full justify-between bg-card font-normal"
          >
            <span className={cn('truncate', !value && 'text-muted-foreground')}>
              {value?.name ?? '全部仓库'}
            </span>
            {open && busy ? (
              <Loader2 data-icon="inline-end" className="animate-spin opacity-60" />
            ) : (
              <ChevronsUpDown data-icon="inline-end" className="opacity-50" />
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          className="w-[var(--radix-popover-trigger-width)] min-w-64 p-0"
        >
          <Command label={`搜索${label}`} shouldFilter={false}>
            <CommandInput
              aria-label={`搜索${label}`}
              value={keyword}
              maxLength={80}
              placeholder={`搜索${label}`}
              onValueChange={setKeyword}
            />
            <CommandList aria-busy={busy}>
              {busy ? (
                <p role="status" className="px-3 py-6 text-center text-sm text-muted-foreground">
                  正在加载仓库...
                </p>
              ) : error ? (
                <div className="px-3 py-4 text-center">
                  <p role="alert" className="text-sm text-destructive">{error}</p>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="mt-2"
                    onClick={() => setRetry((current) => current + 1)}
                  >
                    重新加载
                  </Button>
                </div>
              ) : (
                <>
                  <CommandGroup>
                    <CommandItem value="__all_warehouses__" onSelect={() => select(null)}>
                      <Check className={cn('opacity-0', !value && 'opacity-100')} />
                      全部仓库
                    </CommandItem>
                    {options.map((option) => (
                      <CommandItem
                        key={option.id}
                        value={option.id}
                        onSelect={() => select(option)}
                      >
                        <Check className={cn('opacity-0', value?.id === option.id && 'opacity-100')} />
                        <span className="min-w-0 flex-1 truncate">
                          {option.name}
                          {option.status === 'inactive' ? '（已停用）' : ''}
                        </span>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                  {!options.length && search.keyword ? (
                    <p className="px-3 py-5 text-center text-sm text-muted-foreground">
                      没有匹配的仓库
                    </p>
                  ) : null}
                </>
              )}
            </CommandList>
            {totalPages > 1 && !error ? (
              <div className="flex items-center justify-between border-t px-2 py-2">
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  disabled={busy || search.page <= 1}
                  onClick={() => setSearch((current) => ({ ...current, page: current.page - 1 }))}
                >
                  上一页
                </Button>
                <span className="text-xs tabular-nums text-muted-foreground">
                  {search.page} / {totalPages}
                </span>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  disabled={busy || search.page >= totalPages}
                  onClick={() => setSearch((current) => ({ ...current, page: current.page + 1 }))}
                >
                  下一页
                </Button>
              </div>
            ) : null}
          </Command>
        </PopoverContent>
      </Popover>
    </Field>
  );
}
