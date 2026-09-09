'use client';

import { useEffect, useReducer, useState } from 'react';
import { Search } from 'lucide-react';
import Link from 'next/link';
import {
  INVENTORY_TRANSACTION_TYPE_LABELS,
  INVENTORY_TRANSACTION_TYPE_VALUES,
} from '@gooes/domain';
import {
  adminTabsListClassName,
  adminTabsTriggerClassName,
} from '@/components/admin/admin-tabs';
import { FormSelect } from '@/components/admin/form-select';
import { StatusAlert } from '@/components/admin/status-alert';
import { Button } from '@/components/ui/button';
import { Card, CardFooter, CardHeader } from '@/components/ui/card';
import { Field, FieldLabel } from '@/components/ui/field';
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from '@/components/ui/input-group';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { loadInventory, type InventoryResult } from './inventory-api';
import {
  buildInventoryPath,
  initialInventoryState,
  inventoryReducer,
} from './inventory-rules';
import { InventoryTable } from './inventory-table';
import { InventoryWarehouseFilter } from './inventory-warehouse-filter';

type Props = {
  canView: boolean;
  canViewWarehouses: boolean;
  canViewPurchaseOrders: boolean;
  canViewMaterials?: boolean;
};
const transactionOptions = [
  { value: 'all', label: '全部类型' },
  ...INVENTORY_TRANSACTION_TYPE_VALUES.map((value) => ({
    value,
    label: INVENTORY_TRANSACTION_TYPE_LABELS[value],
  })),
];

export function InventoryWorkspace({
  canView,
  canViewWarehouses,
  canViewPurchaseOrders,
  canViewMaterials = false,
}: Props) {
  const [state, dispatch] = useReducer(inventoryReducer, initialInventoryState);
  const [keyword, setKeyword] = useState('');
  const [result, setResult] = useState<InventoryResult | null>(null);
  const [loadedPath, setLoadedPath] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const path = buildInventoryPath(state);

  useEffect(() => {
    if (!canView) return;
    const controller = new AbortController();
    setLoading(true);
    setError('');
    loadInventory(canView, state, controller.signal)
      .then((next) => {
        if (controller.signal.aborted || !next) return;
        const lastPage = Math.max(1, next.data.pagination.totalPages);
        if (state.page > lastPage) {
          dispatch({ type: 'page', page: lastPage });
          return;
        }
        setResult(next);
        setLoadedPath(path);
      })
      .catch((caught: unknown) => {
        if (!controller.signal.aborted)
          setError(
            caught instanceof Error ? caught.message : '库存数据加载失败',
          );
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [canView, state, path, retry]);

  const current = loadedPath === path && !loading && !error;
  const busy = loading || (!error && !current);
  const pagination = current ? result?.data.pagination : null;
  const reset = () => {
    setKeyword('');
    dispatch({ type: 'reset' });
  };

  if (!canView)
    return (
      <StatusAlert tone="warning" title="暂无库存查看权限">
        请联系管理员开通库存查看权限。
      </StatusAlert>
    );

  return (
    <div className="flex h-[calc(100dvh-6.5625rem)] min-h-0 flex-col overflow-hidden">
      <Tabs
        value={state.tab}
        onValueChange={(tab) => {
          if (tab === 'balances' || tab === 'transactions')
            dispatch({ type: 'tab', tab });
        }}
        className="flex min-h-0 flex-1 flex-col gap-3"
      >
        <TabsList className={adminTabsListClassName}>
          <TabsTrigger value="balances" className={adminTabsTriggerClassName}>
            库存余额
          </TabsTrigger>
          <TabsTrigger
            value="transactions"
            className={adminTabsTriggerClassName}
          >
            库存流水
          </TabsTrigger>
        </TabsList>
        <div className="flex flex-wrap gap-2">
          <Button asChild size="sm" variant="outline">
            <Link href="/warehouse-transfers">仓库调拨</Link>
          </Button>
          {canViewMaterials && <>
            <Button asChild size="sm" variant="outline">
              <Link href="/warehouse-issues">项目领料</Link>
            </Button>
            <Button asChild size="sm" variant="outline">
              <Link href="/warehouse-returns">项目退料</Link>
            </Button>
          </>}
        </div>
        <TabsContent
          value={state.tab}
          className="mt-0 flex min-h-0 flex-1 flex-col"
        >
          <Card className="flex min-h-0 flex-1 flex-col overflow-hidden shadow-none">
            <CardHeader className="max-h-[45dvh] shrink-0 overflow-y-auto border-b p-4">
              <div className="grid items-start gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(12rem,16rem)_auto]">
                {state.tab === 'balances' ? (
                  <form
                    className="min-w-0"
                    onSubmit={(event) => {
                      event.preventDefault();
                      dispatch({ type: 'keyword', keyword });
                    }}
                  >
                    <Field>
                      <FieldLabel htmlFor="inventory-keyword">
                        商品 / SKU
                      </FieldLabel>
                      <div className="flex gap-2">
                        <InputGroup className="h-9 min-w-0">
                          <InputGroupAddon>
                            <Search aria-hidden="true" />
                          </InputGroupAddon>
                          <InputGroupInput
                            id="inventory-keyword"
                            className="h-9"
                            placeholder="搜索商品名称或 SKU 编码"
                            maxLength={80}
                            value={keyword}
                            onChange={(event) => setKeyword(event.target.value)}
                          />
                        </InputGroup>
                        <Button type="submit" variant="outline">
                          搜索
                        </Button>
                      </div>
                    </Field>
                  </form>
                ) : (
                  <Field>
                    <FieldLabel htmlFor="inventory-transaction-type">
                      流水类型
                    </FieldLabel>
                    <FormSelect
                      id="inventory-transaction-type"
                      triggerClassName="h-9"
                      value={state.transactionType}
                      options={transactionOptions}
                      onChange={(value) => {
                        if (
                          value === 'all' ||
                          INVENTORY_TRANSACTION_TYPE_VALUES.some(
                            (type) => type === value,
                          )
                        )
                          dispatch({
                            type: 'transactionType',
                            transactionType:
                              value as typeof state.transactionType,
                          });
                      }}
                    />
                    {state.sku && (
                      <div className="flex flex-wrap items-center gap-2 text-sm">
                        <span className="break-words">
                          商品：{state.sku.name}
                        </span>
                        <Button
                          variant="link"
                          size="sm"
                          onClick={() => dispatch({ type: 'clearSku' })}
                        >
                          查看全部商品
                        </Button>
                      </div>
                    )}
                  </Field>
                )}
                <InventoryWarehouseFilter
                  canViewWarehouses={canViewWarehouses}
                  value={state.warehouse}
                  onChange={(warehouse) =>
                    dispatch({ type: 'warehouse', warehouse })
                  }
                />
                <div className="flex gap-2 lg:pt-6">
                  <Button variant="outline" onClick={reset}>
                    清除筛选
                  </Button>
                  <Button
                    variant="ghost"
                    disabled={busy}
                    onClick={() => setRetry((value) => value + 1)}
                  >
                    刷新
                  </Button>
                </div>
              </div>
            </CardHeader>
            <InventoryTable
              tab={state.tab}
              balances={
                current && result?.tab === 'balances' ? result.data.list : []
              }
              transactions={
                current && result?.tab === 'transactions'
                  ? result.data.list
                  : []
              }
              canViewPurchaseOrders={canViewPurchaseOrders}
              canViewMaterials={canViewMaterials}
              loading={busy}
              error={error}
              onRetry={() => setRetry((value) => value + 1)}
              onReset={reset}
              onWarehouse={(warehouse) =>
                dispatch({ type: 'warehouse', warehouse })
              }
              onDrill={(row) =>
                dispatch({
                  type: 'drill',
                  sku: { id: row.supplier_sku_id, name: row.sku_name },
                  warehouse: { id: row.warehouse_id, name: row.warehouse_name },
                })
              }
            />
            <CardFooter className="shrink-0 flex-wrap justify-between gap-3 border-t px-5 py-3">
              <span
                className="text-xs text-muted-foreground"
                aria-live="polite"
              >
                {busy
                  ? '正在加载库存…'
                  : error
                    ? '加载失败'
                    : `共 ${pagination?.total ?? 0} 条 · 第 ${state.page} / ${Math.max(1, pagination?.totalPages ?? 0)} 页`}
              </span>
              <div className="flex flex-wrap items-center gap-2">
                <Field orientation="horizontal">
                  <FieldLabel
                    htmlFor="inventory-page-size"
                    className="whitespace-nowrap text-xs"
                  >
                    每页条数
                  </FieldLabel>
                  <FormSelect
                    id="inventory-page-size"
                    value={String(state.pageSize)}
                    options={[20, 50, 100].map((value) => ({
                      value: String(value),
                      label: String(value),
                    }))}
                    triggerClassName="h-8 w-20"
                    onChange={(value) =>
                      dispatch({ type: 'pageSize', pageSize: Number(value) })
                    }
                  />
                </Field>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy || !!error || state.page <= 1}
                  onClick={() =>
                    dispatch({ type: 'page', page: state.page - 1 })
                  }
                >
                  上一页
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={
                    busy ||
                    !!error ||
                    state.page >= (pagination?.totalPages ?? 0)
                  }
                  onClick={() =>
                    dispatch({ type: 'page', page: state.page + 1 })
                  }
                >
                  下一页
                </Button>
              </div>
            </CardFooter>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
