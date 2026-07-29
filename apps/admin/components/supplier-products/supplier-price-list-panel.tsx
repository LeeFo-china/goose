"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { RefreshCw } from "lucide-react";
import { toast } from "sonner";

import { DataTable } from "@/components/admin/data-table";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

import {
  loadSupplierPriceItems,
  loadSupplierPriceLists,
} from "./supplier-product-api";
import { canEditPriceList } from "./supplier-product-rules";
import {
  CreatePriceListDialog,
  PriceItemDialog,
  PublishPriceDialog,
} from "./supplier-price-list-dialogs";
import type {
  SupplierPriceList,
  SupplierPriceListItem,
  SupplierPriceListPage,
  SupplierSku,
} from "./supplier-product-types";

const emptyPage: SupplierPriceListPage = {
  list: [],
  pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 },
};

export function SupplierPriceListPanel({
  tenantSupplierId,
  canManage,
  availableSkus,
}: {
  tenantSupplierId: string;
  canManage: boolean;
  availableSkus: SupplierSku[];
}) {
  const [page, setPage] = useState(1);
  const [priceLists, setPriceLists] = useState(emptyPage);
  const [selected, setSelected] = useState<SupplierPriceList | null>(null);
  const [items, setItems] = useState<SupplierPriceListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [itemsLoading, setItemsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadPriceLists = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await loadSupplierPriceLists(tenantSupplierId, page);
      setPriceLists(data);
      setSelected((current) =>
        current
          ? data.list.find(({ id }) => id === current.id) ?? null
          : null
      );
      return data;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "基础供货价加载失败");
      return null;
    } finally {
      setLoading(false);
    }
  }, [page, tenantSupplierId]);

  const loadItems = useCallback(async (priceList: SupplierPriceList) => {
    setItemsLoading(true);
    try {
      const data = await loadSupplierPriceItems(
        tenantSupplierId,
        priceList.id,
      );
      setItems(data.list);
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : "价格条目加载失败");
    } finally {
      setItemsLoading(false);
    }
  }, [tenantSupplierId]);

  const reloadSelected = useCallback(async () => {
    const data = await loadPriceLists();
    if (!selected || !data) return;
    const latest = data.list.find(({ id }) => id === selected.id);
    if (latest) await loadItems(latest);
  }, [loadItems, loadPriceLists, selected]);

  useEffect(() => {
    void loadPriceLists();
  }, [loadPriceLists]);

  const columns = useMemo<ColumnDef<SupplierPriceList>[]>(() => [
    {
      accessorKey: "name",
      header: "价格版本",
      cell: ({ row }) => (
        <div className="flex flex-col gap-1">
          <span className="font-medium">{row.original.name}</span>
          <span className="text-xs text-muted-foreground">
            {row.original.price_list_code} · V{row.original.version_number}
          </span>
        </div>
      ),
    },
    {
      id: "period",
      header: "生效区间",
      cell: ({ row }) => (
        <div className="flex flex-col gap-1 text-sm">
          <span>{formatDate(row.original.effective_from)}</span>
          <span className="text-xs text-muted-foreground">
            至 {row.original.effective_until
              ? formatDate(row.original.effective_until)
              : "长期"}
          </span>
        </div>
      ),
    },
    {
      accessorKey: "lifecycle_status",
      header: "状态",
      cell: ({ row }) => <PriceStatusBadge value={row.original.lifecycle_status} />,
    },
    {
      accessorKey: "row_version",
      header: "修订",
      cell: ({ row }) => `v${row.original.row_version}`,
    },
    {
      id: "actions",
      header: "操作",
      cell: ({ row }) => (
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => {
            setSelected(row.original);
            void loadItems(row.original);
          }}
        >
          查看条目
        </Button>
      ),
    },
  ], [loadItems]);

  const totalPages = Math.max(1, priceLists.pagination.totalPages || 1);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col justify-between gap-3 md:flex-row md:items-center">
        <div>
          <h2 className="text-base font-semibold">默认基础供货价</h2>
          <p className="text-sm text-muted-foreground">
            本页只展示成本价权限域；商品列表不会返回单价字段。
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={loading}
            onClick={() => void loadPriceLists()}
          >
            <RefreshCw data-icon="inline-start" />
            刷新
          </Button>
          {canManage ? (
            <CreatePriceListDialog
              tenantSupplierId={tenantSupplierId}
              onCreated={async () => {
                await loadPriceLists();
              }}
            />
          ) : null}
        </div>
      </div>
      {error ? (
        <Alert variant="destructive">
          <AlertTitle>基础供货价未加载</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : loading && priceLists.list.length === 0 ? (
        <Skeleton className="h-40 w-full" />
      ) : (
        <DataTable
          data={priceLists.list}
          columns={columns}
          emptyText="当前供应商还没有基础供货价版本"
          minWidth="min-w-[760px]"
        />
      )}
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm text-muted-foreground">
          第 {priceLists.pagination.page} / {totalPages} 页，共{" "}
          {priceLists.pagination.total} 个版本
        </span>
        <div className="flex gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={page <= 1 || loading}
            onClick={() => setPage((current) => Math.max(1, current - 1))}
          >
            上一页
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={page >= totalPages || loading}
            onClick={() => setPage((current) => current + 1)}
          >
            下一页
          </Button>
        </div>
      </div>
      {selected ? (
        <PriceItems
          tenantSupplierId={tenantSupplierId}
          priceList={selected}
          items={items}
          loading={itemsLoading}
          canManage={canManage}
          availableSkus={availableSkus}
          onChanged={reloadSelected}
        />
      ) : null}
    </div>
  );
}

function PriceItems({
  tenantSupplierId,
  priceList,
  items,
  loading,
  canManage,
  availableSkus,
  onChanged,
}: {
  tenantSupplierId: string;
  priceList: SupplierPriceList;
  items: SupplierPriceListItem[];
  loading: boolean;
  canManage: boolean;
  availableSkus: SupplierSku[];
  onChanged: () => void | Promise<void>;
}) {
  const columns = useMemo<ColumnDef<SupplierPriceListItem>[]>(() => [
    {
      id: "sku",
      header: "SKU",
      cell: ({ row }) => (
        <div className="flex flex-col gap-1">
          <span className="font-medium">{row.original.sku.name}</span>
          <span className="text-xs text-muted-foreground">
            {row.original.sku.sku_code}
          </span>
        </div>
      ),
    },
    {
      accessorKey: "unit_price",
      header: "基础单价",
      cell: ({ row }) => `${priceList.currency} ${row.original.unit_price}`,
    },
    {
      accessorKey: "tax_rate",
      header: "税率",
      cell: ({ row }) =>
        `${(Number(row.original.tax_rate) * 100).toFixed(2)}%`,
    },
    {
      id: "tax",
      header: "口径",
      cell: ({ row }) => row.original.tax_inclusive ? "含税" : "未税",
    },
    {
      id: "unit",
      header: "采购单位",
      cell: ({ row }) =>
        `${row.original.purchase_unit.name}（${row.original.purchase_unit.symbol}）`,
    },
  ], [priceList.currency]);

  return (
    <div className="flex flex-col gap-3 border-t pt-4">
      <div className="flex flex-col justify-between gap-3 md:flex-row md:items-center">
        <div>
          <h3 className="text-sm font-semibold">
            {priceList.name} · V{priceList.version_number}
          </h3>
          <p className="text-sm text-muted-foreground">
            {priceList.lifecycle_status === "draft"
              ? "草稿条目可修改，每次增删都会原子递增价格簿修订号。"
              : "发布后不可修改；需要调整时创建新版本。"}
          </p>
        </div>
        {canManage && canEditPriceList(priceList) ? (
          <div className="flex gap-2">
            <PriceItemDialog
              tenantSupplierId={tenantSupplierId}
              priceList={priceList}
              availableSkus={availableSkus}
              onChanged={onChanged}
            />
            <PublishPriceDialog
              tenantSupplierId={tenantSupplierId}
              priceList={priceList}
              itemCount={items.length}
              onChanged={onChanged}
            />
          </div>
        ) : null}
      </div>
      {loading ? (
        <Skeleton className="h-32 w-full" />
      ) : (
        <DataTable
          data={items}
          columns={columns}
          emptyText="草稿还没有价格条目"
          minWidth="min-w-[680px]"
        />
      )}
    </div>
  );
}

function PriceStatusBadge({ value }: { value: string }) {
  const meta = value === "published"
    ? { label: "已发布", variant: "success" as const }
    : value === "retired"
      ? { label: "已退役", variant: "secondary" as const }
      : { label: "草稿", variant: "warning" as const };
  return <Badge variant={meta.variant}>{meta.label}</Badge>;
}

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "-" : date.toLocaleString("zh-CN");
}
