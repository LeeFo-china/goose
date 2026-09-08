"use client";

import { useEffect, useState } from "react";
import { ChevronDown } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Field, FieldLabel } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

export function ProcurementRemarkField({
  value,
  disabled,
  onChange,
}: {
  value: string;
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(Boolean(value.trim()));

  useEffect(() => {
    if (value.trim()) setOpen(true);
  }, [value]);

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={disabled}
          className="w-full justify-start px-0 hover:bg-transparent"
        >
          补充信息
          <span className="font-normal text-muted-foreground">
            {value.trim() ? "已填写备注" : "选填"}
          </span>
          <ChevronDown
            className={cn("ml-auto size-4", open && "rotate-180")}
            aria-hidden="true"
          />
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent className="pt-2">
        <Field>
          <FieldLabel htmlFor="procurement-remark">备注</FieldLabel>
          <Textarea
            id="procurement-remark"
            value={value}
            maxLength={500}
            disabled={disabled}
            placeholder="补充到货、搬运或现场要求"
            onChange={(event) => onChange(event.target.value)}
          />
        </Field>
      </CollapsibleContent>
    </Collapsible>
  );
}
