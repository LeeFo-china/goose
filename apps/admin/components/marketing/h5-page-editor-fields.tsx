"use client";

import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { getActionString, getActionType } from "@/components/marketing/h5-page-editor-block-utils";

export function TextField({
  label,
  value,
  description,
  onChange,
}: {
  label: string;
  value: string;
  description?: string;
  onChange: (value: string) => void;
}) {
  return (
    <Field>
      <FieldLabel>{label}</FieldLabel>
      <Input value={value} onChange={(event) => onChange(event.target.value)} />
      {description ? <FieldDescription>{description}</FieldDescription> : null}
    </Field>
  );
}

export function TextareaField({
  label,
  value,
  description,
  onChange,
}: {
  label: string;
  value: string;
  description?: string;
  onChange: (value: string) => void;
}) {
  return (
    <Field>
      <FieldLabel>{label}</FieldLabel>
      <Textarea value={value} onChange={(event) => onChange(event.target.value)} />
      {description ? <FieldDescription>{description}</FieldDescription> : null}
    </Field>
  );
}

export function SelectField({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange: (value: string) => void;
}) {
  return (
    <Field>
      <FieldLabel>{label}</FieldLabel>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger>
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
    </Field>
  );
}

export function ActionField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <SelectField
      label={label}
      value={value}
      options={[
        { value: "scroll_to_form", label: "滚动到表单" },
        { value: "phone", label: "拨打电话" },
        { value: "link", label: "跳转链接" },
      ]}
      onChange={onChange}
    />
  );
}

export function ActionDetailFields({
  type,
  url,
  phone,
  onUrlChange,
  onPhoneChange,
}: {
  type: string;
  url: string;
  phone: string;
  onUrlChange: (value: string) => void;
  onPhoneChange: (value: string) => void;
}) {
  if (type === "link") {
    return (
      <TextField
        label="跳转 URL"
        value={url}
        description="建议使用 https 地址。"
        onChange={onUrlChange}
      />
    );
  }

  if (type === "phone") {
    return (
      <TextField
        label="电话号码"
        value={phone}
        description="点击按钮后会唤起手机拨号。"
        onChange={onPhoneChange}
      />
    );
  }

  return null;
}
