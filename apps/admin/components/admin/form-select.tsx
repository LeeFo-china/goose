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
  triggerClassName,
  "aria-describedby": ariaDescribedBy,
  "aria-required": ariaRequired,
  onChange,
}: {
  id: string;
  value: string;
  options: readonly SelectOption[];
  placeholder?: string;
  disabled?: boolean;
  invalid?: boolean;
  triggerClassName?: string;
  "aria-describedby"?: string;
  "aria-required"?: boolean | "true" | "false";
  onChange: (value: string) => void;
}) {
  return (
    <Select value={value} disabled={disabled} onValueChange={onChange}>
      <SelectTrigger
        id={id}
        aria-describedby={ariaDescribedBy}
        aria-required={ariaRequired}
        aria-invalid={invalid}
        className={triggerClassName}
      >
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
