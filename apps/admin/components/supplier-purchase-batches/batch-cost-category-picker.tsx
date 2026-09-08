"use client";

import { useId, useState } from "react";
import { AlertTriangle, ChevronDown } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

import { loadBatchCategories } from "./batch-api";
import { BatchOptionPicker } from "./batch-option-picker";
import type { BatchLine, NamedOption } from "./batch-types";

export function BatchCostCategoryPicker({
  line,
  label,
  disabled,
  onChange,
}: {
  line: BatchLine;
  label: string;
  disabled: boolean;
  onChange: (category: NamedOption) => void;
}) {
  const [open, setOpen] = useState(false);
  const baseId = useId();
  const pickerId = `${baseId}-cost-category`;
  const warningId = `${pickerId}-warning`;
  const dialogId = `${pickerId}-dialog`;
  const missingCategory = !line.cost_category_id;
  const currentLabel = line.category_name || "选择成本类目";

  return (
    <div className="min-w-0 space-y-1">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={disabled}
            aria-label={`${label}的成本类目：${currentLabel}`}
            aria-describedby={missingCategory ? warningId : undefined}
            className={missingCategory
              ? "min-h-11 w-full min-w-0 justify-between text-warning-foreground md:min-h-8"
              : "min-h-11 w-full min-w-0 justify-between md:min-h-8"}
          >
            <span className="truncate">{currentLabel}</span>
            <ChevronDown className="size-4 shrink-0" aria-hidden="true" />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          id={dialogId}
          role="dialog"
          aria-label={`${label}的成本类目选择`}
          aria-describedby={missingCategory ? warningId : undefined}
          align="end"
          collisionPadding={12}
          className="w-[min(24rem,calc(100vw-2rem))] p-4"
        >
          <BatchOptionPicker
            id={pickerId}
            label="成本类目"
            value={line.cost_category_id
              ? {
                id: line.cost_category_id,
                name: line.category_name || "已选类目",
              }
              : null}
            load={loadBatchCategories}
            disabled={disabled}
            onChange={(category) => {
              onChange(category);
              setOpen(false);
            }}
          />
        </PopoverContent>
      </Popover>
      {missingCategory
        ? (
          <p
            id={warningId}
            className="flex items-center gap-1 text-xs text-warning-foreground"
          >
            <AlertTriangle className="size-3.5 shrink-0" aria-hidden="true" />
            尚未选择成本类目
          </p>
        )
        : null}
    </div>
  );
}
