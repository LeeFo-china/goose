"use client";

import { useEffect, useId, useRef } from "react";
import { Trash2 } from "lucide-react";

import { FormSelect } from "@/components/admin/form-select";
import type { FinanceCostCategoryRecord } from "@/components/finance/finance-cost-budget-requests";
import { procurementSummary } from "@/components/supplier-procurement-editor/procurement-editor-rules";
import type { PurchaseOrderCatalogItem } from "@/components/supplier-purchase-orders/purchase-order-types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

import {
  formatRequisitionDateTime,
  formatRequisitionMoney,
  isValidRequisitionQuantity,
  REQUISITION_QUANTITY_ERROR,
  shortBusinessId,
  type RequisitionDraftLine,
} from "./requisition-page-utils";
import type { RequisitionItem, RequisitionRecord } from "./requisition-types";

export function SelectedRequisitionLines({
  lines,
  facts,
  categories,
  error,
  disabled,
  recentlyAddedSkuId,
  onChange,
  onRemove,
}: {
  lines: RequisitionDraftLine[];
  facts: Record<string, PurchaseOrderCatalogItem>;
  categories: FinanceCostCategoryRecord[];
  error?: string;
  disabled: boolean;
  recentlyAddedSkuId?: string | null;
  onChange: (skuId: string, patch: Partial<RequisitionDraftLine>) => void;
  onRemove: (skuId: string) => void;
}) {
  const baseId = useId();
  const recentlyAddedRow = useRef<HTMLElement | null>(null);
  const categoryOptions = categories.map((category) => ({
    value: category.id,
    label: `${category.name} · ${category.code}`,
  }));

  useEffect(() => {
    if (!recentlyAddedSkuId || !recentlyAddedRow.current) return;
    const reduceMotion =
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    recentlyAddedRow.current.scrollIntoView({
      block: "nearest",
      behavior: reduceMotion ? "auto" : "smooth",
    });
  }, [recentlyAddedSkuId]);

  return (
    <div className="flex min-h-full flex-col bg-background">
      <div className="sticky top-0 z-10 flex items-center justify-between border-b bg-background px-4 py-3">
        <div>
          <h3 className="text-base font-semibold">已选商品</h3>
          <p className="text-xs text-muted-foreground">单一供应商采购申请</p>
        </div>
        <span className="text-sm font-medium tabular-nums">
          {lines.length} / 100
        </span>
      </div>
      {error ? (
        <p
          role="alert"
          className="border-b px-4 py-2 text-xs font-medium text-destructive"
        >
          {error}
        </p>
      ) : null}
      {lines.length ? (
        <div className="min-w-0 divide-y">
          {lines.map((line, index) => {
            const fact = facts[line.supplierSkuId];
            const productLabel = fact
              ? `${fact.product_name} · ${fact.sku_name}`
              : `已选商品 · SKU ${shortBusinessId(line.supplierSkuId)}`;
            const quantityInvalid = !isValidRequisitionQuantity(line.quantity);
            const quantityErrorId = `${baseId}-${index}-quantity-error`;
            const categoryId = `${baseId}-${index}-cost-category`;
            const recentlyAdded = line.supplierSkuId === recentlyAddedSkuId;
            const referenceAmount = procurementSummary([
              {
                quantity: line.quantity,
                unitPrice: fact?.unit_price,
                costCategoryId: line.costCategoryId,
              },
            ]).referenceAmount;
            return (
              <article
                key={line.supplierSkuId}
                ref={recentlyAdded ? recentlyAddedRow : undefined}
                className={cn(
                  "min-w-0 space-y-3 px-4 py-4 transition-colors duration-200 motion-reduce:transition-none",
                  recentlyAdded &&
                    "bg-primary/5 ring-1 ring-inset ring-primary/20",
                )}
              >
                <div className="flex min-w-0 items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                      <h4 className="break-words text-sm font-semibold leading-5">
                        {productLabel}
                      </h4>
                      {recentlyAdded ? (
                        <span
                          role="status"
                          aria-live="polite"
                          className="text-xs font-medium text-primary"
                        >
                          刚刚加入
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-1 break-words text-xs leading-5 text-muted-foreground">
                      {fact?.sku_code
                        ? `SKU ${fact.sku_code}`
                        : `SKU ${shortBusinessId(line.supplierSkuId)}`}
                    </p>
                  </div>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="size-11 shrink-0 text-muted-foreground hover:text-destructive md:size-8"
                    disabled={disabled}
                    aria-label={`移除${productLabel}`}
                    onClick={() => onRemove(line.supplierSkuId)}
                  >
                    <Trash2 className="size-4" aria-hidden="true" />
                  </Button>
                </div>
                <div className="grid min-w-0 grid-cols-[minmax(7rem,0.8fr)_minmax(0,1.2fr)] items-start gap-3">
                  <label className="min-w-0 space-y-1 text-xs font-medium">
                    <span>采购数量</span>
                    <div className="flex min-w-0 items-center gap-2">
                      <Input
                        className="min-w-0 tabular-nums"
                        aria-label={`${productLabel}采购数量`}
                        type="text"
                        inputMode="decimal"
                        pattern="\d+(?:\.\d{1,4})?"
                        value={line.quantity}
                        aria-invalid={quantityInvalid}
                        aria-describedby={
                          quantityInvalid ? quantityErrorId : undefined
                        }
                        disabled={disabled}
                        onChange={(event) =>
                          onChange(line.supplierSkuId, {
                            quantity: event.target.value,
                          })
                        }
                      />
                      <span className="shrink-0 font-normal text-muted-foreground">
                        {fact?.purchase_unit_symbol ?? "单位"}
                      </span>
                    </div>
                    {quantityInvalid ? (
                      <span
                        id={quantityErrorId}
                        className="font-normal text-destructive"
                      >
                        {REQUISITION_QUANTITY_ERROR}
                      </span>
                    ) : null}
                  </label>
                  <div className="min-w-0 space-y-1 text-xs font-medium">
                    <span aria-hidden="true">成本类目</span>
                    <label className="sr-only" htmlFor={categoryId}>
                      {productLabel}的成本类目
                    </label>
                    <FormSelect
                      id={categoryId}
                      value={line.costCategoryId}
                      options={categoryOptions}
                      placeholder="选择成本类目"
                      disabled={disabled}
                      invalid={!line.costCategoryId}
                      triggerClassName="min-h-11 w-full md:min-h-9"
                      onChange={(costCategoryId) =>
                        onChange(line.supplierSkuId, { costCategoryId })
                      }
                    />
                    {!line.costCategoryId ? (
                      <p className="font-normal text-warning-foreground">
                        尚未选择成本类目
                      </p>
                    ) : null}
                  </div>
                </div>
                <dl className="grid grid-cols-2 gap-3 text-xs">
                  <div className="min-w-0">
                    <dt className="text-muted-foreground">参考单价</dt>
                    <dd className="mt-1 truncate font-medium tabular-nums">
                      {fact?.unit_price
                        ? `${formatRequisitionMoney(fact.unit_price)} / ${fact.purchase_unit_symbol || "单位"}`
                        : "—"}
                    </dd>
                  </div>
                  <div className="min-w-0 text-right">
                    <dt className="text-muted-foreground">估算小计</dt>
                    <dd className="mt-1 truncate font-medium tabular-nums">
                      {fact?.unit_price &&
                      isValidRequisitionQuantity(line.quantity)
                        ? formatRequisitionMoney(referenceAmount)
                        : "—"}
                    </dd>
                  </div>
                </dl>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="flex min-h-40 flex-1 items-center justify-center px-5 py-10 text-center">
          <p className="text-sm text-muted-foreground">
            从左侧商品目录加入商品
          </p>
        </div>
      )}
    </div>
  );
}

export function RequisitionSavedFacts({
  requisition,
}: {
  requisition: RequisitionRecord;
}) {
  return (
    <dl className="grid grid-cols-2 gap-x-4 gap-y-2 border-t pt-3 text-xs sm:grid-cols-4">
      <Fact
        label="服务端计价"
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
        label="已保存申请金额"
        value={formatRequisitionMoney(requisition.total_amount)}
      />
    </dl>
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
    <div className="min-w-0">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="mt-1 truncate font-medium tabular-nums">{value}</dd>
    </div>
  );
}
