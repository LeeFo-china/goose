"use client";

import { type FormEvent, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Save } from "lucide-react";
import { StatusAlert } from "@/components/admin/status-alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { requestBackendJson } from "@/lib/backend-client";
import type {
  WechatPayConfigData,
  WechatPayConfigResult,
} from "./finance-wechat-pay-requests";

const MERCHANT_MODE_OPTIONS = [
  { value: "direct_merchant", label: "普通商户" },
  { value: "service_provider_sub_merchant", label: "服务商子商户" },
];

const STATUS_OPTIONS = [
  { value: "disabled", label: "停用" },
  { value: "pending", label: "待启用" },
  { value: "active", label: "启用" },
  { value: "suspended", label: "暂停" },
];

export function FinanceWechatPayConfigForm({
  data,
}: {
  data: WechatPayConfigResult;
}) {
  const router = useRouter();
  const config = data.config;
  const readonly = !data.can_manage;
  const [error, setError] = useState(data.error || "");
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (readonly) return;

    setError("");
    setSaved(false);
    const form = new FormData(event.currentTarget);
    const serialNo = optionalText(form, "serial_no");
    const payload: Record<string, unknown> = {
      merchant_mode: requiredText(form, "merchant_mode") || "direct_merchant",
      merchant_name: optionalText(form, "merchant_name"),
      merchant_id: optionalText(form, "merchant_id"),
      sub_merchant_id: optionalText(form, "sub_merchant_id"),
      app_id: optionalText(form, "app_id"),
      sub_app_id: optionalText(form, "sub_app_id"),
      status: requiredText(form, "status") || "pending",
      enabled_channels: ["project_payment"],
      settlement_account_summary: optionalText(form, "settlement_account_summary"),
      encrypted_config_ref: optionalText(form, "encrypted_config_ref"),
      notify_url: optionalText(form, "notify_url"),
    };
    if (serialNo) {
      payload.serial_no = serialNo;
    }

    startTransition(async () => {
      try {
        await requestBackendJson<WechatPayConfigData>(
          "/finance/wechat-pay/config",
          {
            method: "PUT",
            body: JSON.stringify(payload),
            fallbackMessage: "微信支付配置保存失败",
          },
        );
        setSaved(true);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "微信支付配置保存失败");
      }
    });
  }

  return (
    <form className="flex flex-col gap-4" onSubmit={submit}>
      {error ? <StatusAlert>{error}</StatusAlert> : null}
      {saved ? (
        <StatusAlert tone="success">微信支付配置已保存，校验状态已重置为待校验。</StatusAlert>
      ) : null}
      {readonly ? (
        <StatusAlert tone="warning">当前账号只有查看权限，不能修改微信支付配置。</StatusAlert>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={data.configured ? "success" : "warning"}>
          {data.configured ? "已配置" : "未配置"}
        </Badge>
        <Badge variant={configStatusVariant(config?.status)}>
          {configStatusLabel(config?.status)}
        </Badge>
        <Badge variant={validationStatusVariant(config?.validation_status)}>
          {validationStatusLabel(config?.validation_status)}
        </Badge>
        {config?.last_validated_at ? (
          <Badge variant="outline">
            最近校验 {formatDateTime(config.last_validated_at)}
          </Badge>
        ) : null}
      </div>

      <FieldGroup className="grid gap-4 md:grid-cols-2">
        <SelectField
          label="商户模式"
          name="merchant_mode"
          defaultValue={config?.merchant_mode || "direct_merchant"}
          options={MERCHANT_MODE_OPTIONS}
          disabled={pending || readonly}
        />
        <SelectField
          label="配置状态"
          name="status"
          defaultValue={config?.status || "pending"}
          options={STATUS_OPTIONS}
          disabled={pending || readonly}
        />
        <TextField
          label="商户名称"
          name="merchant_name"
          defaultValue={config?.merchant_name || ""}
          disabled={pending || readonly}
        />
        <TextField
          label="商户号"
          name="merchant_id"
          defaultValue={config?.merchant_id || ""}
          disabled={pending || readonly}
        />
        <TextField
          label="子商户号"
          name="sub_merchant_id"
          defaultValue={config?.sub_merchant_id || ""}
          disabled={pending || readonly}
        />
        <TextField
          label="AppID"
          name="app_id"
          defaultValue={config?.app_id || ""}
          disabled={pending || readonly}
        />
        <TextField
          label="子商户 AppID"
          name="sub_app_id"
          defaultValue={config?.sub_app_id || ""}
          disabled={pending || readonly}
        />
        <TextField
          label="证书序列号"
          name="serial_no"
          placeholder={config?.serial_no_masked ? `当前 ${config.serial_no_masked}` : "保存时写入"}
          disabled={pending || readonly}
          description="留空表示保留当前证书序列号；新输入会重置配置校验状态。"
        />
        <TextField
          label="回调地址"
          name="notify_url"
          type="url"
          defaultValue={config?.notify_url || ""}
          disabled={pending || readonly}
          className="md:col-span-2"
        />
        <TextField
          label="密钥引用"
          name="encrypted_config_ref"
          defaultValue={config?.encrypted_config_ref || ""}
          disabled={pending || readonly}
          description={config?.has_encrypted_config_ref ? "已绑定密钥引用" : "保存密钥管理系统中的引用地址"}
          className="md:col-span-2"
        />
        <TextField
          label="结算账户摘要"
          name="settlement_account_summary"
          defaultValue={config?.settlement_account_summary || ""}
          disabled={pending || readonly}
          className="md:col-span-2"
        />
      </FieldGroup>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
        <div className="text-xs text-muted-foreground">
          支付渠道：项目收款；更新时间：{config?.updated_at ? formatDateTime(config.updated_at) : "-"}
        </div>
        <Button type="submit" disabled={pending || readonly}>
          {pending ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <Save data-icon="inline-start" />}
          保存配置
        </Button>
      </div>
    </form>
  );
}

function TextField({
  label,
  name,
  defaultValue,
  placeholder,
  description,
  type = "text",
  disabled,
  className,
}: {
  label: string;
  name: string;
  defaultValue?: string;
  placeholder?: string;
  description?: string;
  type?: string;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <Field className={className}>
      <FieldLabel htmlFor={`wechat-pay-${name}`}>{label}</FieldLabel>
      <Input
        id={`wechat-pay-${name}`}
        name={name}
        type={type}
        defaultValue={defaultValue}
        placeholder={placeholder}
        disabled={disabled}
      />
      {description ? <FieldDescription>{description}</FieldDescription> : null}
    </Field>
  );
}

function SelectField({
  label,
  name,
  defaultValue,
  options,
  disabled,
}: {
  label: string;
  name: string;
  defaultValue: string;
  options: Array<{ value: string; label: string }>;
  disabled?: boolean;
}) {
  return (
    <Field>
      <FieldLabel htmlFor={`wechat-pay-${name}`}>{label}</FieldLabel>
      <select
        id={`wechat-pay-${name}`}
        name={name}
        defaultValue={defaultValue}
        disabled={disabled}
        className="h-10 rounded-md border bg-background px-3 text-sm disabled:cursor-not-allowed disabled:opacity-50"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
      </select>
    </Field>
  );
}

function requiredText(form: FormData, key: string) {
  return String(form.get(key) || "").trim();
}

function optionalText(form: FormData, key: string) {
  const value = requiredText(form, key);
  return value || null;
}

function configStatusLabel(status: string | null | undefined) {
  if (status === "active") return "启用";
  if (status === "disabled") return "停用";
  if (status === "suspended") return "暂停";
  return "待启用";
}

function configStatusVariant(status: string | null | undefined) {
  if (status === "active") return "success";
  if (status === "suspended") return "warning";
  if (status === "disabled") return "secondary";
  return "outline";
}

function validationStatusLabel(status: string | null | undefined) {
  if (status === "valid") return "校验通过";
  if (status === "invalid") return "校验失败";
  return "待校验";
}

function validationStatusVariant(status: string | null | undefined) {
  if (status === "valid") return "success";
  if (status === "invalid") return "danger";
  return "warning";
}

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}
