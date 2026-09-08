"use client";

import { useEffect, useId, useRef } from "react";
import { Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

import { BatchCostCategoryPicker } from "./batch-cost-category-picker";
import { batchMoney } from "./batch-page-parts";
import {
  batchLineReferenceMoney,
  batchSelectionValidation,
} from "./batch-rules";
import type { BatchLine } from "./batch-types";

export function BatchLines(
  { lines, disabled, recentlyAddedSkuId, onChange }: {
    lines: BatchLine[];
    disabled: boolean;
    recentlyAddedSkuId?: string | null;
    onChange: (lines: BatchLine[]) => void;
  },
) {
  const validationId = useId();
  const recentlyAddedRow = useRef<HTMLElement | null>(null);
  const validation = batchSelectionValidation(lines);

  useEffect(() => {
    if (!recentlyAddedSkuId || !recentlyAddedRow.current) return;
    const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)")
      .matches ?? false;
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
          <p className="text-xs text-muted-foreground">
            成本类目用于采购归类
          </p>
        </div>
        <span className="text-sm font-medium tabular-nums">
          {lines.length} / 100
        </span>
      </div>
      {validation.list.length
        ? (
          <ul
            role="alert"
            className="space-y-1 border-b px-4 py-2 text-xs font-medium text-destructive"
          >
            {validation.list.map((message) => <li key={message}>{message}</li>)}
          </ul>
        )
        : null}
      {lines.length
        ? (
          <div className="min-w-0 divide-y">
            {lines.map((line, index) => {
              const lineValidation = validation.lines[index] ?? {};
              const money = batchLineReferenceMoney(line);
              const quantityErrorId = `${validationId}-${index}-quantity`;
              const duplicateErrorId = `${validationId}-${index}-duplicate`;
              const recentlyAdded = line.supplier_sku_id ===
                recentlyAddedSkuId;
              return (
                <article
                  key={`${line.supplier_sku_id}:${index}`}
                  ref={recentlyAdded ? recentlyAddedRow : undefined}
                  aria-describedby={lineValidation.duplicateSku
                    ? duplicateErrorId
                    : undefined}
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
                          {line.name}
                        </h4>
                        {recentlyAdded
                          ? (
                            <span
                              role="status"
                              aria-live="polite"
                              className="text-xs font-medium text-primary"
                            >
                              刚刚加入
                            </span>
                          )
                          : null}
                      </div>
                      <p className="mt-1 break-words text-xs leading-5 text-muted-foreground">
                        {line.supplier_name || "供应商已冻结"}
                        {line.sku_code ? ` · SKU ${line.sku_code}` : ""}
                      </p>
                      {lineValidation.duplicateSku
                        ? (
                          <p
                            id={duplicateErrorId}
                            className="mt-1 text-xs font-medium text-destructive"
                          >
                            {lineValidation.duplicateSku}
                          </p>
                        )
                        : null}
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      disabled={disabled}
                      aria-label={`移除${line.name}`}
                      className="size-11 shrink-0 text-muted-foreground hover:text-destructive md:size-8"
                      onClick={() =>
                        onChange(lines.filter((item) => item !== line))}
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
                          aria-label={`${line.name}采购数量`}
                          aria-invalid={Boolean(lineValidation.quantity)}
                          aria-describedby={lineValidation.quantity
                            ? quantityErrorId
                            : undefined}
                          inputMode="decimal"
                          value={line.quantity}
                          disabled={disabled}
                          onChange={(event) =>
                            onChange(lines.map((item) =>
                              item === line
                                ? { ...item, quantity: event.target.value }
                                : item
                            ))}
                        />
                        <span className="shrink-0 font-normal text-muted-foreground">
                          {line.purchase_unit_name || "单位"}
                        </span>
                      </div>
                      {lineValidation.quantity
                        ? (
                          <p
                            id={quantityErrorId}
                            className="font-normal text-destructive"
                          >
                            {lineValidation.quantity}
                          </p>
                        )
                        : null}
                    </label>
                    <div className="min-w-0 space-y-1 text-xs font-medium">
                      <span>成本类目</span>
                      <BatchCostCategoryPicker
                        line={line}
                        label={`${line.name}${
                          line.sku_code ? ` · SKU ${line.sku_code}` : ""
                        }`}
                        disabled={disabled}
                        onChange={(category) =>
                          onChange(lines.map((item) =>
                            item === line
                              ? {
                                ...item,
                                cost_category_id: category.id,
                                category_name: category.name,
                              }
                              : item
                          ))}
                      />
                    </div>
                  </div>
                  <dl className="grid grid-cols-2 gap-3 text-xs">
                    <div className="min-w-0">
                      <dt className="text-muted-foreground">参考单价</dt>
                      <dd className="mt-1 truncate font-medium tabular-nums">
                        {money.unitPrice
                          ? `${batchMoney(money.unitPrice)} / ${
                            line.purchase_unit_name || "单位"
                          }`
                          : "—"}
                      </dd>
                    </div>
                    <div className="min-w-0 text-right">
                      <dt className="text-muted-foreground">估算小计</dt>
                      <dd className="mt-1 truncate font-medium tabular-nums">
                        {money.subtotal ? batchMoney(money.subtotal) : "—"}
                      </dd>
                    </div>
                  </dl>
                </article>
              );
            })}
          </div>
        )
        : (
          <div className="flex min-h-40 flex-1 items-center justify-center px-5 py-10 text-center">
            <p className="text-sm text-muted-foreground">
              从左侧商品目录加入商品
            </p>
          </div>
        )}
    </div>
  );
}
