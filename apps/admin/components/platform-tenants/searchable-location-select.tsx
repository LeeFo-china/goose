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
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export type SearchableLocationOption = {
  value: string;
  label?: string;
  keywords?: string[];
};

export function SearchableLocationSelect({
  id,
  value,
  options,
  placeholder,
  searchPlaceholder,
  emptyText = "没有匹配项",
  disabled,
  required,
  allowCustomValue = true,
  onChange,
}: {
  id: string;
  value: string;
  options: SearchableLocationOption[];
  placeholder: string;
  searchPlaceholder: string;
  emptyText?: string;
  disabled?: boolean;
  required?: boolean;
  allowCustomValue?: boolean;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [keyword, setKeyword] = useState("");
  const uniqueOptions = useMemo(() => {
    const map = new Map<string, SearchableLocationOption>();
    for (const option of options) {
      const optionValue = option.value.trim();
      if (!optionValue || map.has(optionValue)) continue;
      map.set(optionValue, { ...option, value: optionValue });
    }
    if (value.trim() && !map.has(value.trim())) {
      map.set(value.trim(), { value: value.trim(), label: "当前值" });
    }
    return [...map.values()];
  }, [options, value]);
  const selected = uniqueOptions.find((option) => option.value === value);
  const customValue = keyword.trim();
  const canUseCustomValue =
    allowCustomValue &&
    customValue &&
    !uniqueOptions.some((option) => option.value === customValue);

  function selectValue(nextValue: string) {
    onChange(nextValue);
    setKeyword("");
    setOpen(false);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-required={required}
          disabled={disabled}
          className="w-full justify-between font-normal"
        >
          <span className={cn("truncate", !value ? "text-muted-foreground" : "")}>
            {selected?.value || value || placeholder}
          </span>
          <ChevronsUpDown data-icon="inline-end" className="opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
        <Command>
          <CommandInput
            value={keyword}
            onValueChange={setKeyword}
            placeholder={searchPlaceholder}
          />
          <CommandList>
            <CommandEmpty>{emptyText}</CommandEmpty>
            <CommandGroup>
              {!required ? (
                <CommandItem value="__empty__" onSelect={() => selectValue("")}>
                  <Check className={cn("opacity-0", !value && "opacity-100")} />
                  不选择
                </CommandItem>
              ) : null}
              {uniqueOptions.map((option) => (
                <CommandItem
                  key={`${id}-${option.value}`}
                  value={option.value}
                  keywords={option.keywords}
                  onSelect={() => selectValue(option.value)}
                >
                  <Check className={cn("opacity-0", value === option.value && "opacity-100")} />
                  <div className="min-w-0">
                    <div className="truncate">{option.value}</div>
                    {option.label ? (
                      <div className="truncate text-xs text-muted-foreground">{option.label}</div>
                    ) : null}
                  </div>
                </CommandItem>
              ))}
              {canUseCustomValue ? (
                <CommandItem value={customValue} onSelect={() => selectValue(customValue)}>
                  <Check className="opacity-0" />
                  使用「{customValue}」
                </CommandItem>
              ) : null}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
