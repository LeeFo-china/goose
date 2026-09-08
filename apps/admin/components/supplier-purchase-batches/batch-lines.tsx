"use client";

import { Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import { BatchCostCategoryPicker } from "./batch-cost-category-picker";
import type { BatchLine } from "./batch-types";

export function BatchLines(
  { lines, disabled, onChange }: {
    lines: BatchLine[];
    disabled: boolean;
    onChange: (lines: BatchLine[]) => void;
  },
) {
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
      {lines.length
        ? (
          <div className="min-w-0 divide-y">
            {lines.map((line) => (
              <article
                key={line.supplier_sku_id}
                className="min-w-0 space-y-3 px-4 py-4"
              >
                <div className="flex min-w-0 items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <h4 className="break-words text-sm font-semibold leading-5">
                      {line.name}
                    </h4>
                    <p className="mt-1 break-words text-xs leading-5 text-muted-foreground">
                      {line.supplier_name || "供应商已冻结"}
                      {line.sku_code ? ` · SKU ${line.sku_code}` : ""}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    disabled={disabled}
                    aria-label={`移除${line.name}`}
                    className="size-8 shrink-0 text-muted-foreground hover:text-destructive"
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
                  </label>
                  <div className="min-w-0 space-y-1 text-xs font-medium">
                    <span>成本类目</span>
                    <BatchCostCategoryPicker
                      line={line}
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
              </article>
            ))}
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
