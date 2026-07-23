"use client";

import { useEffect, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
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
export type ApplymentFieldSource = "ocr" | "manual" | "tenant" | "stored";

type FieldSourceProps = {
  source?: ApplymentFieldSource;
  onValueChange?: (value: string) => void;
};

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
  pattern,
  maxLength,
  inputMode,
  autoComplete,
  stored,
  appliedValue,
  source,
  registerInForm = true,
  idPrefix = "wechat-pay-applyment",
  onValueChange,
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
  pattern?: string;
  maxLength?: number;
  inputMode?: "text" | "numeric" | "tel" | "email";
  autoComplete?: string;
  stored?: boolean;
  appliedValue?: string;
  registerInForm?: boolean;
  idPrefix?: string;
} & FieldSourceProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (appliedValue !== undefined && inputRef.current) {
      inputRef.current.value = appliedValue;
    }
  }, [appliedValue]);

  return (
    <Field data-disabled={disabled || undefined}>
      <FieldLabelWithRequirement
        htmlFor={`${idPrefix}-${name}`}
        label={label}
        requirement={requirement}
        stored={stored}
        source={source}
      />
      <Input
        ref={inputRef}
        id={`${idPrefix}-${name}`}
        name={registerInForm ? name : undefined}
        type={type}
        defaultValue={defaultValue}
        placeholder={placeholder}
        required={required}
        disabled={disabled}
        pattern={pattern}
        maxLength={maxLength}
        inputMode={inputMode}
        autoComplete={autoComplete}
        aria-required={required || undefined}
        onChange={(event) => onValueChange?.(event.currentTarget.value)}
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
  onValueChange,
  source,
  registerInForm = true,
  idPrefix = "wechat-pay-applyment",
}: {
  label: string;
  name: string;
  defaultValue: string;
  options: Array<{ value: string; label: string }>;
  requirement?: FieldRequirement;
  description?: string;
  disabled?: boolean;
  registerInForm?: boolean;
  idPrefix?: string;
} & FieldSourceProps) {
  const [value, setValue] = useState(defaultValue);
  const fieldId = `${idPrefix}-${name}`;

  useEffect(() => {
    setValue(defaultValue);
  }, [defaultValue]);

  return (
    <Field data-disabled={disabled || undefined}>
      <FieldLabelWithRequirement
        htmlFor={fieldId}
        label={label}
        requirement={requirement}
        source={source}
      />
      <input
        type="hidden"
        name={registerInForm ? name : undefined}
        value={value}
      />
      <Select
        value={value}
        onValueChange={(nextValue) => {
          setValue(nextValue);
          onValueChange?.(nextValue);
        }}
        disabled={disabled}
      >
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

export function PeriodEndField({
  label,
  name,
  defaultValue,
  requirement = "required",
  disabled,
  appliedValue,
  source,
  registerInForm = true,
  idPrefix = "wechat-pay-applyment",
  onValueChange,
}: {
  label: string;
  name: string;
  defaultValue?: string | null;
  requirement?: FieldRequirement;
  disabled?: boolean;
  appliedValue?: string;
  registerInForm?: boolean;
  idPrefix?: string;
} & FieldSourceProps) {
  const [longTerm, setLongTerm] = useState(defaultValue === "长期");
  const [dateValue, setDateValue] = useState(
    defaultValue && defaultValue !== "长期" ? defaultValue : "",
  );
  const fieldId = `${idPrefix}-${name}`;

  useEffect(() => {
    setLongTerm(defaultValue === "长期");
    setDateValue(defaultValue && defaultValue !== "长期" ? defaultValue : "");
  }, [defaultValue]);

  useEffect(() => {
    if (appliedValue === undefined) return;
    setLongTerm(appliedValue === "长期");
    setDateValue(appliedValue === "长期" ? "" : appliedValue);
  }, [appliedValue]);

  return (
    <Field data-disabled={disabled || undefined}>
      <FieldLabelWithRequirement
        htmlFor={fieldId}
        label={label}
        requirement={requirement}
        source={source}
      />
      <input
        type="hidden"
        name={registerInForm ? name : undefined}
        value={longTerm ? "长期" : dateValue}
      />
      <Input
        id={fieldId}
        type="date"
        value={dateValue}
        onChange={(event) => {
          setDateValue(event.target.value);
          onValueChange?.(event.currentTarget.value);
        }}
        required={requirement === "required" && !longTerm}
        disabled={disabled || longTerm}
      />
      <div className="flex items-center gap-2">
        <Checkbox
          id={`${fieldId}-long-term`}
          checked={longTerm}
          disabled={disabled}
          onCheckedChange={(checked) => {
            const nextLongTerm = checked === true;
            setLongTerm(nextLongTerm);
            onValueChange?.(nextLongTerm ? "长期" : dateValue);
          }}
        />
        <FieldLabel htmlFor={`${fieldId}-long-term`} className="font-normal">
          长期有效
        </FieldLabel>
      </div>
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
  appliedValue,
  source,
  registerInForm = true,
  idPrefix = "wechat-pay-applyment",
  onValueChange,
}: {
  label: string;
  name: string;
  defaultValue?: string;
  description?: string;
  requirement?: FieldRequirement;
  required?: boolean;
  disabled?: boolean;
  appliedValue?: string;
  registerInForm?: boolean;
  idPrefix?: string;
} & FieldSourceProps) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (appliedValue !== undefined && textareaRef.current) {
      textareaRef.current.value = appliedValue;
    }
  }, [appliedValue]);

  return (
    <Field className="md:col-span-2" data-disabled={disabled || undefined}>
      <FieldLabelWithRequirement
        htmlFor={`${idPrefix}-${name}`}
        label={label}
        requirement={requirement}
        source={source}
      />
      <Textarea
        ref={textareaRef}
        id={`${idPrefix}-${name}`}
        name={registerInForm ? name : undefined}
        defaultValue={defaultValue}
        required={required}
        disabled={disabled}
        rows={3}
        onChange={(event) => onValueChange?.(event.currentTarget.value)}
      />
      {description ? <FieldDescription>{description}</FieldDescription> : null}
    </Field>
  );
}

function FieldLabelWithRequirement({
  htmlFor,
  label,
  requirement,
  stored,
  source,
}: {
  htmlFor: string;
  label: string;
  requirement: FieldRequirement;
  stored?: boolean;
  source?: ApplymentFieldSource;
}) {
  const displayedSource = source ?? (stored ? "stored" : undefined);
  return (
    <FieldLabel htmlFor={htmlFor} className="flex items-center gap-2">
      <span>{label}</span>
      <RequirementBadge requirement={requirement} />
      {displayedSource ? (
        <Badge variant="outline">
          {displayedSource === "ocr"
            ? "证照识别"
            : displayedSource === "manual"
              ? "已修改"
              : displayedSource === "tenant"
                ? "租户资料"
                : "已安全保存"}
        </Badge>
      ) : null}
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
