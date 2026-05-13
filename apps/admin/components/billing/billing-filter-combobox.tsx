"use client";

import { useMemo, useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Field, FieldLabel } from "@/components/ui/field";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export type BillingFilterComboboxOption = {
  value: string;
  label?: string;
  keywords?: string[];
};

export function BillingFilterCombobox({
  label,
  name,
  defaultValue,
  placeholder,
  searchPlaceholder = "搜索选项",
  emptyText = "没有匹配项",
  options,
}: {
  label: string;
  name: string;
  defaultValue?: string;
  placeholder: string;
  searchPlaceholder?: string;
  emptyText?: string;
  options: BillingFilterComboboxOption[];
}) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(defaultValue || "");
  const selected = useMemo(
    () => options.find((option) => option.value === value),
    [options, value],
  );

  return (
    <Field>
      <FieldLabel htmlFor={`${name}-combobox`}>{label}</FieldLabel>
      <input type="hidden" name={name} value={value} />
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            id={`${name}-combobox`}
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="w-full justify-between font-normal"
          >
            <span className={cn("truncate", !selected && !value ? "text-muted-foreground" : "")}>
              {selected?.value || value || placeholder}
            </span>
            <ChevronsUpDown data-icon="inline-end" className="opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
          <Command>
            <CommandInput placeholder={searchPlaceholder} />
            <CommandList>
              <CommandEmpty>{emptyText}</CommandEmpty>
              <CommandGroup>
                <CommandItem
                  value="__all__"
                  onSelect={() => {
                    setValue("");
                    setOpen(false);
                  }}
                >
                  <Check className={cn("opacity-0", !value && "opacity-100")} />
                  全部
                </CommandItem>
                {options.map((option) => (
                  <CommandItem
                    key={`${option.value}-${option.label || ""}`}
                    value={option.value}
                    keywords={option.keywords}
                    onSelect={() => {
                      setValue(option.value);
                      setOpen(false);
                    }}
                  >
                    <Check className={cn("opacity-0", value === option.value && "opacity-100")} />
                    <div className="min-w-0">
                      <div className="truncate">{option.value}</div>
                      {option.label ? <div className="truncate text-xs text-muted-foreground">{option.label}</div> : null}
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </Field>
  );
}
