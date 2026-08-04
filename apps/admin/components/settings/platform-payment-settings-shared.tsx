"use client";

import {
  type ReactNode,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { FileUp } from "lucide-react";
import type {
  PlatformPaymentMerchantMode,
  PlatformPaymentProfileCode,
  PlatformWechatPayConfigView,
  PlatformWechatPayProfileView,
} from "@/components/settings/platform-payment-settings-types";
import {
  Field,
  FieldDescription,
  FieldLabel,
} from "@/components/ui/field";
import { Button } from "@/components/ui/button";
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

export type ProfileDefinition = {
  profile_code: PlatformPaymentProfileCode;
  label: string;
  description: string;
  merchant_mode: PlatformPaymentMerchantMode;
  enabled_channels: string[];
};

export const profileDefinitions: ProfileDefinition[] = [
  {
    profile_code: "platform_direct_recharge",
    label: "平台直连商户",
    description: "用于平台技术服务等平台自有收款。",
    merchant_mode: "direct_merchant",
    enabled_channels: ["tenant_recharge", "platform_service"],
  },
  {
    profile_code: "tenant_service_provider",
    label: "服务商商户",
    description: "用于租户特约商户进件和后续租户项目收款。",
    merchant_mode: "service_provider_sub_merchant",
    enabled_channels: ["project_payment", "applyment"],
  },
];

const statusOptions = [
  { value: "pending", label: "待配置" },
  { value: "active", label: "启用" },
  { value: "disabled", label: "停用" },
  { value: "suspended", label: "暂停" },
];

export function SectionTitle({
  icon,
  title,
  description,
}: {
  icon: ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div>
      <div className="flex items-center gap-2 text-sm font-medium">
        <span className="text-muted-foreground">{icon}</span>
        {title}
      </div>
      <p className="mt-1 text-xs leading-5 text-muted-foreground">
        {description}
      </p>
    </div>
  );
}

export function TextField({
  label,
  name,
  defaultValue,
  placeholder,
  description,
  type = "text",
  disabled,
  required,
  className,
}: {
  label: string;
  name: string;
  defaultValue?: string | null;
  placeholder?: string;
  description?: string;
  type?: string;
  disabled?: boolean;
  required?: boolean;
  className?: string;
}) {
  return (
    <Field className={className}>
      <FieldLabel htmlFor={`platform-payment-${name}`}>{label}</FieldLabel>
      <Input
        id={`platform-payment-${name}`}
        name={name}
        type={type}
        defaultValue={defaultValue || ""}
        placeholder={placeholder}
        disabled={disabled}
        required={required}
      />
      {description ? <FieldDescription>{description}</FieldDescription> : null}
    </Field>
  );
}

export function FileField({
  label,
  name,
  disabled,
  required,
}: {
  label: string;
  name: string;
  disabled?: boolean;
  required?: boolean;
}) {
  const fieldId = useId();
  const inputId = `platform-payment-${name}-${fieldId}`;
  const inputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState("");

  useEffect(() => {
    const form = inputRef.current?.form;
    if (!form) return;

    const clearFileName = () => setFileName("");
    form.addEventListener("reset", clearFileName);
    return () => form.removeEventListener("reset", clearFileName);
  }, []);

  return (
    <Field>
      <FieldLabel htmlFor={inputId}>{label}</FieldLabel>
      <Input
        ref={inputRef}
        id={inputId}
        name={name}
        type="file"
        accept=".pem,.txt"
        className="sr-only !h-px !w-px"
        disabled={disabled}
        required={required}
        onChange={(event) =>
          setFileName(event.currentTarget.files?.[0]?.name || "")
        }
      />
      <div className="flex min-w-0 items-center gap-3">
        <Button
          asChild
          variant="outline"
          className={disabled
            ? "pointer-events-none opacity-50"
            : "cursor-pointer"}
        >
          <label htmlFor={inputId} aria-disabled={disabled}>
            <FileUp data-icon="inline-start" />
            选择文件
          </label>
        </Button>
        <span
          className="min-w-0 truncate text-sm text-muted-foreground"
          title={fileName || "未选择文件"}
        >
          {fileName || "未选择文件"}
        </span>
      </div>
      <FieldDescription>
        支持 PEM 或 TXT 文件，保存后不会回显文件内容。
      </FieldDescription>
    </Field>
  );
}

export function ReadonlyField({
  label,
  value,
  className,
}: {
  label: string;
  value: string;
  className?: string;
}) {
  return (
    <Field className={className}>
      <FieldLabel>{label}</FieldLabel>
      <Textarea value={value} readOnly className="min-h-10 resize-none" />
    </Field>
  );
}

export function SelectField({
  label,
  value,
  onValueChange,
  disabled,
}: {
  label: string;
  value: PlatformWechatPayConfigView["status"];
  onValueChange: (value: PlatformWechatPayConfigView["status"]) => void;
  disabled?: boolean;
}) {
  return (
    <Field>
      <FieldLabel>{label}</FieldLabel>
      <Select
        value={value}
        onValueChange={(nextValue) =>
          onValueChange(nextValue as PlatformWechatPayConfigView["status"])
        }
        disabled={disabled}
      >
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            {statusOptions.map((option) => (
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

export function emptyProfile(
  definition: ProfileDefinition,
): PlatformWechatPayProfileView {
  return {
    profile_code: definition.profile_code,
    label: definition.label,
    description: definition.description,
    configured: false,
    config: null,
  };
}

export function definitionFor(profileCode: PlatformPaymentProfileCode) {
  return profileDefinitions.find((definition) =>
    definition.profile_code === profileCode
  ) || profileDefinitions[0];
}

export function textValue(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function fileValue(formData: FormData, key: string) {
  const value = formData.get(key);
  return value instanceof File && value.size > 0 ? value : null;
}

export function readFileAsText(file: File) {
  return file.text().then((value) => value.trim());
}

export function merchantModeLabel(mode: PlatformPaymentMerchantMode) {
  return mode === "service_provider_sub_merchant" ? "服务商模式" : "普通直连商户";
}

export function paymentChannelLabel(channel: string) {
  if (channel === "tenant_recharge") return "租户充值";
  if (channel === "platform_service") return "平台技术服务";
  if (channel === "project_payment") return "项目收款";
  if (channel === "applyment") return "商户进件";
  return channel;
}

export function statusLabel(
  status: PlatformWechatPayConfigView["status"] | undefined,
) {
  if (status === "active") return "启用";
  if (status === "disabled") return "停用";
  if (status === "suspended") return "暂停";
  return "待配置";
}

export function statusVariant(
  status: PlatformWechatPayConfigView["status"] | undefined,
): "success" | "warning" | "secondary" | "outline" {
  if (status === "active") return "success";
  if (status === "suspended") return "warning";
  if (status === "disabled") return "secondary";
  return "outline";
}

export function validationLabel(
  status: PlatformWechatPayConfigView["validation_status"] | undefined,
) {
  if (status === "valid") return "校验通过";
  if (status === "invalid") return "校验失败";
  return "待校验";
}

export function validationVariant(
  status: PlatformWechatPayConfigView["validation_status"] | undefined,
): "success" | "warning" | "danger" {
  if (status === "valid") return "success";
  if (status === "invalid") return "danger";
  return "warning";
}

export function formatDateTime(value: string) {
  return new Date(value).toLocaleString("zh-CN", {
    hour12: false,
  });
}
