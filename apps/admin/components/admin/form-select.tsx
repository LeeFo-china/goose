"use client";

import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export type SelectOption = {
  value: string;
  label: string;
};

export function FormSelect({
  id,
  value,
  options,
  placeholder = "请选择",
  disabled,
  invalid,
  onChange,
}: {
  id: string;
  value: string;
  options: readonly SelectOption[];
  placeholder?: string;
  disabled?: boolean;
  invalid?: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <Select value={value} disabled={disabled} onValueChange={onChange}>
      <SelectTrigger id={id} aria-invalid={invalid}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  );
}
