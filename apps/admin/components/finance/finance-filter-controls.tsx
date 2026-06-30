"use client";

import { useState } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldLabel } from "@/components/ui/field";
import { cn } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  filterSelectSubmitValue,
  normalizeFilterSelectValue,
} from "./finance-filter-control-utils";

export type FinanceFilterOption = {
  value: string;
  label: string;
};

export function FinanceFilterSelectField({
  id,
  name,
  label,
  value,
  options,
  compact = false,
  className,
}: {
  id: string;
  name: string;
  label: string;
  value?: string;
  options: readonly FinanceFilterOption[];
  compact?: boolean;
  className?: string;
}) {
  const [selectedValue, setSelectedValue] = useState(
    normalizeFilterSelectValue(value),
  );

  return (
    <Field className={cn(compact ? "gap-0" : "gap-1.5", className)}>
      <FieldLabel
        className={compact ? "sr-only" : "text-xs font-medium text-muted-foreground"}
        htmlFor={id}
      >
        {label}
      </FieldLabel>
      <input
        type="hidden"
        name={name}
        value={filterSelectSubmitValue(selectedValue)}
      />
      <Select value={selectedValue} onValueChange={setSelectedValue}>
        <SelectTrigger id={id} className="h-11 md:h-9">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            {options.map((option) => {
              const optionValue = normalizeFilterSelectValue(option.value);
              return (
                <SelectItem key={optionValue} value={optionValue}>
                  {option.label}
                </SelectItem>
              );
            })}
          </SelectGroup>
        </SelectContent>
      </Select>
    </Field>
  );
}

export function FinanceCheckboxField({
  id,
  name,
  value,
  checked,
  label,
  className,
}: {
  id: string;
  name: string;
  value: string;
  checked: boolean;
  label: string;
  className?: string;
}) {
  return (
    <Field
      className={cn(
        "h-9 flex-row items-center gap-2 rounded-md border px-3",
        className,
      )}
    >
      <Checkbox
        id={id}
        name={name}
        value={value}
        defaultChecked={checked}
      />
      <FieldLabel
        className="text-sm font-normal text-muted-foreground"
        htmlFor={id}
      >
        {label}
      </FieldLabel>
    </Field>
  );
}
