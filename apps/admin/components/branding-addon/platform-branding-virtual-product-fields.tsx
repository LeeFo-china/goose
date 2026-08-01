"use client";

import { Badge } from "@/components/ui/badge";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

export function MappingFact({
  label,
  value,
  badgeVariant,
}: {
  label: string;
  value: string;
  badgeVariant?: "outline" | "success" | "warning" | "danger";
}) {
  return (
    <div className="min-w-0 space-y-1">
      <div className="text-xs text-muted-foreground">{label}</div>
      {badgeVariant
        ? <Badge variant={badgeVariant}>{value}</Badge>
        : <div className="truncate text-sm font-medium">{value}</div>}
    </div>
  );
}

export function MappingInput({
  id,
  label,
  value,
  onChange,
  disabled,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled: boolean;
}) {
  return (
    <Field>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Input
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
        maxLength={128}
      />
    </Field>
  );
}
