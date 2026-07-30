"use client";

import { PackageSearch } from "lucide-react";

import { FormSelect } from "@/components/admin/form-select";
import type {
  FinanceCostCategoryRecord,
} from "@/components/finance/finance-cost-budget-requests";
import type {
  PurchaseOrderCatalogItem,
} from "@/components/supplier-purchase-orders/purchase-order-types";
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

import {
  formatRequisitionDateTime,
  formatRequisitionMoney,
  isValidRequisitionQuantity,
  REQUISITION_QUANTITY_ERROR,
  shortBusinessId,
  type RequisitionDraftLine,
} from "./requisition-page-utils";
import type {
  RequisitionItem,
  RequisitionRecord,
} from "./requisition-types";

export function SelectedRequisitionLines({
  lines,
  facts,
  categories,
  error,
  disabled,
  onChange,
  onRemove,
}: {
  lines: RequisitionDraftLine[];
  facts: Record<string, PurchaseOrderCatalogItem>;
  categories: FinanceCostCategoryRecord[];
  error?: string;
  disabled: boolean;
  onChange: (skuId: string, patch: Partial<RequisitionDraftLine>) => void;
  onRemove: (skuId: string) => void;
}) {
  const categoryOptions = categories.map((category) => ({
    value: category.id,
    label: `${category.name} · ${category.code}`,
  }));
  return (
    <Field data-invalid={Boolean(error)}>
      <FieldLabel>采购明细（{lines.length}/100）</FieldLabel>
      <div className="rounded-md border">
        <Table containerClassName="max-w-full overflow-x-auto">
          <TableHeader>
            <TableRow>
              <TableHead>商品 / SKU</TableHead>
              <TableHead className="min-w-48">成本分类</TableHead>
              <TableHead className="w-36">采购数量</TableHead>
              <TableHead>采购单位</TableHead>
              <TableHead className="text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {lines.map((line) => {
              const fact = facts[line.supplierSkuId];
              const quantityInvalid =
                !isValidRequisitionQuantity(line.quantity);
              const quantityErrorId =
                `requisition-quantity-error-${line.supplierSkuId}`;
              return (
                <TableRow key={line.supplierSkuId}>
                  <TableCell>
                    <div className="font-medium">
                      {fact?.product_name ?? "已选商品"}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {fact?.sku_name ??
                        `SKU ${shortBusinessId(line.supplierSkuId)}`}
                    </div>
                  </TableCell>
                  <TableCell>
                    <FormSelect
                      id={`requisition-category-${line.supplierSkuId}`}
                      value={line.costCategoryId}
                      options={categoryOptions}
                      placeholder="选择成本分类"
                      disabled={disabled}
                      invalid={!line.costCategoryId}
                      onChange={(costCategoryId) =>
                        onChange(line.supplierSkuId, { costCategoryId })}
                    />
                  </TableCell>
                  <TableCell>
                    <Input
                      aria-label={`采购数量 ${
                        fact?.sku_name ?? line.supplierSkuId
                      }`}
                      type="text"
                      inputMode="decimal"
                      pattern="\d+(?:\.\d{1,4})?"
                      value={line.quantity}
                      aria-invalid={quantityInvalid}
                      aria-describedby={quantityInvalid
                        ? quantityErrorId
                        : undefined}
                      disabled={disabled}
                      onChange={(event) =>
                        onChange(line.supplierSkuId, {
                          quantity: event.target.value,
                        })}
                    />
                    {quantityInvalid ? (
                      <span id={quantityErrorId} className="sr-only">
                        {REQUISITION_QUANTITY_ERROR}
                      </span>
                    ) : null}
                  </TableCell>
                  <TableCell>
                    {fact?.purchase_unit_symbol ?? "-"}
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

export function RequisitionCatalogTable({
  items,
  selectedSkuIds,
  loading,
  disabled,
  onAdd,
}: {
  items: PurchaseOrderCatalogItem[];
  selectedSkuIds: Set<string>;
  loading: boolean;
  disabled: boolean;
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
            调整搜索词，或确认供应商已有当前有效的已发布价格。
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }
  return (
    <Table containerClassName="max-w-full overflow-x-auto">
      <TableHeader>
        <TableRow>
          <TableHead>可采购商品</TableHead>
          <TableHead>单位</TableHead>
          <TableHead className="text-right">目录参考价</TableHead>
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
              <TableCell className="text-right font-mono tabular-nums">
                {formatRequisitionMoney(item.unit_price)}
              </TableCell>
              <TableCell className="text-right">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={disabled || selected}
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

export function RequisitionSavedFacts({
  requisition,
}: {
  requisition: RequisitionRecord;
}) {
  return (
    <section className="rounded-md border bg-muted/20 p-3">
      <h3 className="text-sm font-medium">最近一次服务端计价</h3>
      <div className="mt-3 grid gap-3 sm:grid-cols-4">
        <Fact
          label="计价时间"
          value={formatRequisitionDateTime(requisition.priced_at)}
        />
        <Fact
          label="未税金额"
          value={formatRequisitionMoney(requisition.subtotal_amount)}
        />
        <Fact
          label="税额"
          value={formatRequisitionMoney(requisition.tax_amount)}
        />
        <Fact
          label="申请金额"
          value={formatRequisitionMoney(requisition.total_amount)}
        />
      </div>
    </section>
  );
}

export function catalogFactFromRequisitionItem(
  item: RequisitionItem,
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
