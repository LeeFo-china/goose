"use client";

import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PackageSearch } from "lucide-react";

import { formatPurchaseMoney } from "./purchase-order-rules";
import type {
  PurchaseOrder,
  PurchaseOrderCatalogItem,
  PurchaseOrderDraftLine,
  PurchaseOrderItem,
} from "./purchase-order-types";

export function SelectedPurchaseOrderLines({
  lines,
  facts,
  error,
  disabled,
  onQuantityChange,
  onRemove,
}: {
  lines: PurchaseOrderDraftLine[];
  facts: Record<string, PurchaseOrderCatalogItem>;
  error?: string;
  disabled: boolean;
  onQuantityChange: (skuId: string, quantity: number) => void;
  onRemove: (skuId: string) => void;
}) {
  return (
    <Field data-invalid={Boolean(error)}>
      <FieldLabel>采购明细（{lines.length}/100）</FieldLabel>
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>商品 / SKU</TableHead>
              <TableHead>采购单位</TableHead>
              <TableHead className="text-right">当前单价</TableHead>
              <TableHead className="w-36">数量</TableHead>
              <TableHead className="w-20 text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {lines.map((line) => {
              const fact = facts[line.supplierSkuId];
              return (
                <TableRow key={line.supplierSkuId}>
                  <TableCell>
                    <div className="font-medium">
                      {fact?.product_name ?? "已选商品"}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {fact?.sku_name ?? line.supplierSkuId}
                    </div>
                  </TableCell>
                  <TableCell>{fact?.purchase_unit_symbol ?? "-"}</TableCell>
                  <TableCell className="text-right font-mono tabular-nums">
                    {fact ? formatPurchaseMoney(fact.unit_price) : "-"}
                  </TableCell>
                  <TableCell>
                    <Input
                      aria-label={`采购数量 ${
                        fact?.sku_name ?? line.supplierSkuId
                      }`}
                      type="number"
                      min="0.0001"
                      step="0.0001"
                      value={line.quantity}
                      disabled={disabled}
                      onChange={(event) =>
                        onQuantityChange(
                          line.supplierSkuId,
                          Number(event.target.value),
                        )}
                    />
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      disabled={disabled}
                      onClick={() => onRemove(line.supplierSkuId)}
                    >
                      删除
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
      <FieldError>{error}</FieldError>
    </Field>
  );
}

export function PurchaseOrderCatalogTable({
  items,
  selectedSkuIds,
  loading,
  onAdd,
}: {
  items: PurchaseOrderCatalogItem[];
  selectedSkuIds: Set<string>;
  loading: boolean;
  onAdd: (item: PurchaseOrderCatalogItem) => void;
}) {
  if (loading) {
    return (
      <div className="flex flex-col gap-2 py-2">
        {Array.from({ length: 4 }, (_, index) => (
          <Skeleton key={index} className="h-11 w-full" />
        ))}
      </div>
    );
  }
  if (items.length === 0) {
    return (
      <Empty className="min-h-48">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <PackageSearch />
          </EmptyMedia>
          <EmptyTitle>没有可采购商品</EmptyTitle>
          <EmptyDescription>
            请调整搜索词，或确认供应商已有当前有效的已发布基础供货价。
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>可采购商品</TableHead>
          <TableHead>单位</TableHead>
          <TableHead className="text-right">含税标识</TableHead>
          <TableHead className="text-right">单价</TableHead>
          <TableHead className="text-right">操作</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {items.map((item) => {
          const selected = selectedSkuIds.has(item.supplier_sku_id);
          return (
            <TableRow key={item.supplier_sku_id}>
              <TableCell>
                <div className="font-medium">{item.product_name}</div>
                <div className="text-xs text-muted-foreground">
                  {item.sku_name} · {item.sku_code}
                </div>
              </TableCell>
              <TableCell>{item.purchase_unit_symbol}</TableCell>
              <TableCell className="text-right">
                {item.tax_inclusive ? "含税" : "未税"}
              </TableCell>
              <TableCell className="text-right font-mono tabular-nums">
                {formatPurchaseMoney(item.unit_price)}
              </TableCell>
              <TableCell className="text-right">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={loading || selected}
                  onClick={() => onAdd(item)}
                >
                  {selected ? "已添加" : "添加"}
                </Button>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

export function PurchaseOrderSavedFacts({
  facts,
}: {
  facts: Partial<PurchaseOrder>;
}) {
  return (
    <div className="grid gap-3 rounded-md border bg-muted/20 p-3 sm:grid-cols-4">
      <Fact label="计价时间" value={formatDateTime(facts.priced_at)} />
      <Fact
        label="未税金额"
        value={formatPurchaseMoney(facts.subtotal_amount ?? "0")}
      />
      <Fact label="税额" value={formatPurchaseMoney(facts.tax_amount ?? "0")} />
      <Fact
        label="含税总额"
        value={formatPurchaseMoney(facts.total_amount ?? "0")}
      />
    </div>
  );
}

export function catalogFactFromSnapshot(
  item: PurchaseOrderItem,
): PurchaseOrderCatalogItem {
  return {
    supplier_product_id: item.supplier_product_id,
    product_code: item.product_code_snapshot,
    product_name: item.product_name_snapshot,
    supplier_sku_id: item.supplier_sku_id,
    sku_code: item.sku_code_snapshot,
    sku_name: item.sku_name_snapshot,
    specification: item.specification_snapshot,
    model: item.model_snapshot,
    supplier_price_list_id: item.supplier_price_list_id,
    price_list_code: item.price_list_code_snapshot,
    price_list_version: item.price_list_version_snapshot,
    effective_from: item.price_effective_from_snapshot,
    effective_until: item.price_effective_until_snapshot,
    supplier_price_list_item_id: item.supplier_price_list_item_id,
    purchase_unit_id: item.purchase_unit_id,
    purchase_unit_code: item.purchase_unit_code_snapshot,
    purchase_unit_name: item.purchase_unit_name_snapshot,
    purchase_unit_symbol: item.purchase_unit_symbol_snapshot,
    base_unit_id: item.base_unit_id,
    base_unit_code: item.base_unit_code_snapshot,
    base_unit_name: item.base_unit_name_snapshot,
    base_unit_symbol: item.base_unit_symbol_snapshot,
    base_unit_conversion: item.base_unit_conversion,
    unit_price: item.unit_price,
    tax_rate: item.tax_rate,
    tax_inclusive: item.tax_inclusive,
  };
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 font-mono text-sm tabular-nums">{value}</div>
    </div>
  );
}

function formatDateTime(value?: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "-" : date.toLocaleString("zh-CN");
}
