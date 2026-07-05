"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import {
  Field,
  FieldDescription,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

type FieldRequirement = "required" | "optional";

export function TextField({
  label,
  name,
  defaultValue,
  placeholder,
  description,
  requirement = "optional",
  required,
  type = "text",
  disabled,
}: {
  label: string;
  name: string;
  defaultValue?: string;
  placeholder?: string;
  description?: string;
  requirement?: FieldRequirement;
  required?: boolean;
  type?: string;
  disabled?: boolean;
}) {
  return (
    <Field data-disabled={disabled || undefined}>
      <FieldLabelWithRequirement
        htmlFor={`wechat-pay-applyment-${name}`}
        label={label}
        requirement={requirement}
      />
      <Input
        id={`wechat-pay-applyment-${name}`}
        name={name}
        type={type}
        defaultValue={defaultValue}
        placeholder={placeholder}
        required={required}
        disabled={disabled}
      />
      {description ? <FieldDescription>{description}</FieldDescription> : null}
    </Field>
  );
}

export function SelectField({
  label,
  name,
  defaultValue,
  options,
  requirement = "optional",
  description,
  disabled,
}: {
  label: string;
  name: string;
  defaultValue: string;
  options: Array<{ value: string; label: string }>;
  requirement?: FieldRequirement;
  description?: string;
  disabled?: boolean;
}) {
  const [value, setValue] = useState(defaultValue);
  const fieldId = `wechat-pay-applyment-${name}`;

  useEffect(() => {
    setValue(defaultValue);
  }, [defaultValue]);

  return (
    <Field data-disabled={disabled || undefined}>
      <FieldLabelWithRequirement
        htmlFor={fieldId}
        label={label}
        requirement={requirement}
      />
      <input type="hidden" name={name} value={value} />
      <Select value={value} onValueChange={setValue} disabled={disabled}>
        <SelectTrigger id={fieldId} aria-required={requirement === "required"}>
          <SelectValue />
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
      {description ? <FieldDescription>{description}</FieldDescription> : null}
    </Field>
  );
}

export function TextareaField({
  label,
  name,
  defaultValue,
  description,
  requirement = "optional",
  required,
  disabled,
}: {
  label: string;
  name: string;
  defaultValue?: string;
  description?: string;
  requirement?: FieldRequirement;
  required?: boolean;
  disabled?: boolean;
}) {
  return (
    <Field className="md:col-span-2" data-disabled={disabled || undefined}>
      <FieldLabelWithRequirement
        htmlFor={`wechat-pay-applyment-${name}`}
        label={label}
        requirement={requirement}
      />
      <Textarea
        id={`wechat-pay-applyment-${name}`}
        name={name}
        defaultValue={defaultValue}
        required={required}
        disabled={disabled}
        rows={3}
      />
      {description ? <FieldDescription>{description}</FieldDescription> : null}
    </Field>
  );
}

function FieldLabelWithRequirement({
  htmlFor,
  label,
  requirement,
}: {
  htmlFor: string;
  label: string;
  requirement: FieldRequirement;
}) {
  return (
    <FieldLabel htmlFor={htmlFor} className="flex items-center gap-2">
      <span>{label}</span>
      <RequirementBadge requirement={requirement} />
    </FieldLabel>
  );
}

function RequirementBadge({ requirement }: { requirement: FieldRequirement }) {
  return (
    <Badge variant={requirement === "required" ? "secondary" : "outline"}>
      {requirement === "required" ? "必填" : "选填"}
    </Badge>
  );
}
