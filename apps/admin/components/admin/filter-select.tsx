"use client";

import { useState } from "react";

import { Field, FieldLabel } from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const ALL_VALUE = "__all__";

export function FilterSelect({
  label,
  name,
  defaultValue,
  options,
}: {
  label: string;
  name: string;
  defaultValue?: string;
  options: Array<{ label: string; value: string }>;
}) {
  const [value, setValue] = useState(defaultValue || "");

  return (
    <Field className="min-w-fit flex-row items-center gap-2">
      <FieldLabel
        htmlFor={name}
        className="shrink-0 text-sm font-medium text-foreground"
      >
        {label}
      </FieldLabel>
      <input type="hidden" name={name} value={value} />
      <Select
        value={value || ALL_VALUE}
        onValueChange={(nextValue) =>
          setValue(nextValue === ALL_VALUE ? "" : nextValue)
        }
      >
        <SelectTrigger id={name} className="w-36 md:w-40">
          <SelectValue placeholder="全部" />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            <SelectItem value={ALL_VALUE}>全部</SelectItem>
            {options.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
    </Field>
  );
}
