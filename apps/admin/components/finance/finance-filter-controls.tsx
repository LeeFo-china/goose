"use client";

import { useState } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldLabel } from "@/components/ui/field";
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
}: {
  id: string;
  name: string;
  label: string;
  value?: string;
  options: readonly FinanceFilterOption[];
}) {
  const [selectedValue, setSelectedValue] = useState(
    normalizeFilterSelectValue(value),
  );

  return (
    <Field className="gap-1.5">
      <FieldLabel
        className="text-xs font-medium text-muted-foreground"
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
        <SelectTrigger id={id}>
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
}: {
  id: string;
  name: string;
  value: string;
  checked: boolean;
  label: string;
}) {
  return (
    <Field className="h-9 flex-row items-center gap-2 rounded-md border px-3">
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
