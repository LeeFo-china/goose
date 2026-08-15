"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { RefreshCw } from "lucide-react";
import { toast } from "sonner";

import { DataTable } from "@/components/admin/data-table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";

import {
  loadSupplierSkus,
  mutateSupplierResource,
} from "./supplier-product-api";
import {
  resolveSupplierCommandAttempt,
  type SupplierCommandAttempt,
} from "./supplier-command-attempt";
import {
  nextProductAction,
  nextSkuAction,
} from "./supplier-product-rules";
import { SupplierSkuDialog } from "./supplier-sku-dialog";
import type {
  SupplierProduct,
  SupplierProductPage,
  SupplierSku,
} from "./supplier-product-types";
import { supplierProductSourceLabel } from "./supplier-product-types";

type MutationTarget = ({
  id: string;
  name: string;
  action: "activate" | "deactivate";
  version: number;
} & (
  | { kind: "product" }
  | { kind: "sku"; supplierProductId: string }
)) | null;

export function SupplierProductList({
  tenantSupplierId,
  products,
  loading,
  canManage,
  onRefresh,
  onAvailableSkusChange,
}: {
  tenantSupplierId: string;
  products: SupplierProductPage;
  loading: boolean;
  canManage: boolean;
  onRefresh: () => void | Promise<void>;
  onAvailableSkusChange: (skus: SupplierSku[]) => void;
}) {
  const [selected, setSelected] = useState<SupplierProduct | null>(null);
  const [skus, setSkus] = useState<SupplierSku[]>([]);
  const [skuLoading, setSkuLoading] = useState(false);
  const [mutation, setMutation] = useState<MutationTarget>(null);

  const loadSkus = useCallback(async (product: SupplierProduct) => {
    setSkuLoading(true);
    try {
      const page = await loadSupplierSkus(tenantSupplierId, product.id);
      setSkus(page.list);
      onAvailableSkusChange(page.list);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "SKU 加载失败");
    } finally {
      setSkuLoading(false);
    }
  }, [onAvailableSkusChange, tenantSupplierId]);

  useEffect(() => {
    if (!selected) {
      setSkus([]);
      onAvailableSkusChange([]);
      return;
    }
    const latest = products.list.find(({ id }) => id === selected.id);
    if (!latest) {
      setSelected(null);
      return;
    }
    if (latest !== selected) setSelected(latest);
  }, [onAvailableSkusChange, products.list, selected]);

  const columns = useMemo<ColumnDef<SupplierProduct>[]>(() => [
    {
      accessorKey: "name",
      header: "商品",
      cell: ({ row }) => (
        <div className="flex flex-col gap-1">
          <span className="font-medium">{row.original.name}</span>
          <span className="text-xs text-muted-foreground">
            {row.original.product_code}
          </span>
        </div>
      ),
    },
    {
      id: "catalog",
      header: "标准目录",
      cell: ({ row }) => (
        <div className="flex flex-col gap-1">
          <span>{row.original.category.name}</span>
          <span className="text-xs text-muted-foreground">
            {row.original.brand.name}
          </span>
        </div>
      ),
    },
    {
      id: "source",
      header: "来源",
      cell: ({ row }) => {
        const source = row.original.ownership_scope === "platform"
          ? "platform"
          : "tenant";
        return (
          <Badge variant={source === "platform" ? "secondary" : "success"}>
            {supplierProductSourceLabel(source)}
          </Badge>
        );
      },
    },
    {
      accessorKey: "status",
      header: "状态",
      cell: ({ row }) => <StatusBadge value={row.original.status} />,
    },
    {
      accessorKey: "version",
      header: "版本",
      cell: ({ row }) => `v${row.original.version}`,
    },
    {
      id: "actions",
      header: "操作",
      cell: ({ row }) => (
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => {
              setSelected(row.original);
              void loadSkus(row.original);
            }}
          >
            查看 SKU
          </Button>
          {canManage ? (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => setMutation({
                kind: "product",
                id: row.original.id,
                name: row.original.name,
                action: nextProductAction(row.original),
                version: row.original.version,
              })}
            >
              {row.original.status === "active" ? "停用商品" : "启用商品"}
            </Button>
          ) : null}
        </div>
      ),
    },
  ], [canManage, loadSkus]);

  if (loading && products.list.length === 0) {
    return (
      <div className="flex flex-col gap-2 p-4">
        <Skeleton className="h-14 w-full" />
        <Skeleton className="h-14 w-full" />
        <Skeleton className="h-14 w-full" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <DataTable
        data={products.list}
        columns={columns}
        emptyText="当前供应商还没有商品"
        minWidth="min-w-[760px]"
      />
      {selected ? (
        <div className="flex flex-col gap-3 border-t px-5 py-4">
          <div className="flex flex-col justify-between gap-3 md:flex-row md:items-center">
            <div>
              <h2 className="text-base font-semibold">{selected.name} · SKU</h2>
              <p className="text-sm text-muted-foreground">
                SKU 可以在商品草稿期启用；价格发布要求商品与 SKU 均已启用。
              </p>
            </div>
            <div className="flex gap-2">
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={skuLoading}
                onClick={() => void loadSkus(selected)}
              >
                <RefreshCw data-icon="inline-start" />
                刷新
              </Button>
              {canManage ? (
                <SupplierSkuDialog
                  tenantSupplierId={tenantSupplierId}
                  productId={selected.id}
                  disabled={skuLoading || selected.status === "inactive"}
                  onCreated={() => loadSkus(selected)}
                />
              ) : null}
            </div>
          </div>
          <SkuTable
            skus={skus}
            loading={skuLoading}
            canManage={canManage}
            onMutate={setMutation}
          />
        </div>
      ) : null}
      <StatusMutationDialog
        target={mutation}
        tenantSupplierId={tenantSupplierId}
        onOpenChange={(open) => {
          if (!open) setMutation(null);
        }}
        onChanged={async () => {
          await onRefresh();
          if (selected) await loadSkus(selected);
        }}
      />
    </div>
  );
}

function SkuTable({
  skus,
  loading,
  canManage,
  onMutate,
}: {
  skus: SupplierSku[];
  loading: boolean;
  canManage: boolean;
  onMutate: (target: MutationTarget) => void;
}) {
  const columns = useMemo<ColumnDef<SupplierSku>[]>(() => [
    {
      accessorKey: "name",
      header: "SKU",
      cell: ({ row }) => (
        <div className="flex flex-col gap-1">
          <span className="font-medium">{row.original.name}</span>
          <span className="text-xs text-muted-foreground">
            {row.original.sku_code}
          </span>
        </div>
      ),
    },
    {
      id: "spec",
      header: "规格 / 型号",
      cell: ({ row }) =>
        [row.original.specification, row.original.model].filter(Boolean)
          .join(" / ") || "-",
    },
    {
      id: "unit",
      header: "采购单位",
      cell: ({ row }) =>
        `${row.original.purchase_unit.name}（${row.original.purchase_unit.symbol}）`,
    },
    {
      accessorKey: "status",
      header: "状态",
      cell: ({ row }) => <StatusBadge value={row.original.status} />,
    },
    {
      id: "actions",
      header: "操作",
      cell: ({ row }) => canManage ? (
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={() => onMutate({
            kind: "sku",
            id: row.original.id,
            supplierProductId: row.original.supplier_product_id,
            name: row.original.name,
            action: nextSkuAction(row.original),
            version: row.original.version,
          })}
        >
          {row.original.status === "active" ? "停用 SKU" : "启用 SKU"}
        </Button>
      ) : "-",
    },
  ], [canManage, onMutate]);

  return loading ? (
    <Skeleton className="h-32 w-full" />
  ) : (
    <DataTable
      data={skus}
      columns={columns}
      emptyText="该商品还没有 SKU"
      minWidth="min-w-[720px]"
    />
  );
}

function StatusMutationDialog({
  target,
  tenantSupplierId,
  onOpenChange,
  onChanged,
}: {
  target: MutationTarget;
  tenantSupplierId: string;
  onOpenChange: (open: boolean) => void;
  onChanged: () => void | Promise<void>;
}) {
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const attemptRef = useRef<SupplierCommandAttempt | null>(null);
  if (!target) return null;

  async function submit() {
    if (!target || reason.trim().length < 2) return;
    setSaving(true);
    const base = target.kind === "product"
      ? `/supplier-products/${target.id}`
      : `/supplier-products/${target.supplierProductId}/skus/${target.id}`;
    try {
      const path = `${base}/${target.action}`;
      const payload = {
        expected_version: target.version,
        proxy_reason: reason.trim(),
      };
      const attempt = resolveSupplierCommandAttempt(attemptRef.current, {
        scope: `supplier-${target.kind}-${target.action}`,
        resourcePath: path,
        payload,
      });
      attemptRef.current = attempt;
      await mutateSupplierResource(
        path,
        tenantSupplierId,
        payload,
        attempt.idempotencyKey,
      );
      attemptRef.current = null;
      toast.success(target.action === "activate" ? "已启用" : "已停用");
      onOpenChange(false);
      setReason("");
      await onChanged();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "状态变更失败");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {target.action === "activate" ? "启用" : "停用"} {target.name}
          </DialogTitle>
          <DialogDescription>
            此操作使用当前版本 v{target.version}，版本冲突时请刷新后重试。
          </DialogDescription>
        </DialogHeader>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="supplier-status-proxy-reason">
              代录原因
            </FieldLabel>
            <Textarea
              id="supplier-status-proxy-reason"
              value={reason}
              maxLength={500}
              onChange={(event) => setReason(event.target.value)}
            />
            <FieldDescription>说明供应商授权或资料来源。</FieldDescription>
          </Field>
        </FieldGroup>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            取消
          </Button>
          <Button
            type="button"
            disabled={saving || reason.trim().length < 2}
            onClick={() => void submit()}
          >
            确认{target.action === "activate" ? "启用" : "停用"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function StatusBadge({ value }: { value: string }) {
  const label = value === "active"
    ? "已启用"
    : value === "draft"
      ? "草稿"
      : "已停用";
  return (
    <Badge variant={value === "active" ? "success" : "secondary"}>
      {label}
    </Badge>
  );
}
