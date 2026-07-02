"use client";

import { type FormEvent, useEffect, useState, useTransition } from "react";
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
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { requestBackendJson } from "@/lib/backend-client";
import type {
  WechatPayConfigData,
  WechatPayConfigResult,
} from "./finance-wechat-pay-requests";

const MERCHANT_MODE_OPTIONS = [
  { value: "direct_merchant", label: "普通商户" },
  { value: "service_provider_sub_merchant", label: "服务商子商户" },
];

const PRINCIPAL_TYPE_OPTIONS = [
  { value: "tenant", label: "租户收款" },
  { value: "platform", label: "平台收款" },
];

const STATUS_OPTIONS = [
  { value: "disabled", label: "停用" },
  { value: "pending", label: "待启用" },
  { value: "active", label: "启用" },
  { value: "suspended", label: "暂停" },
];

const APPLYMENT_STATE_OPTIONS = [
  { value: "not_started", label: "未开始" },
  { value: "draft", label: "草稿" },
  { value: "submitted", label: "已提交" },
  { value: "reviewing", label: "审核中" },
  { value: "rejected", label: "已驳回" },
  { value: "account_verifying", label: "账户验证" },
  { value: "signing", label: "待签约" },
  { value: "opened", label: "已开通" },
  { value: "suspended", label: "已暂停" },
  { value: "closed", label: "已关闭" },
];

const APPID_BINDING_STATE_OPTIONS = [
  { value: "not_required", label: "无需绑定" },
  { value: "not_bound", label: "未绑定" },
  { value: "pending_confirm", label: "待确认" },
  { value: "bound", label: "已绑定" },
  { value: "rejected", label: "已拒绝" },
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
      principal_type: requiredText(form, "principal_type") || "tenant",
      merchant_mode: requiredText(form, "merchant_mode") || "direct_merchant",
      merchant_name: optionalText(form, "merchant_name"),
      merchant_id: optionalText(form, "merchant_id"),
      sub_merchant_id: optionalText(form, "sub_merchant_id"),
      app_id: optionalText(form, "app_id"),
      sub_app_id: optionalText(form, "sub_app_id"),
      applyment_business_code: optionalText(form, "applyment_business_code"),
      applyment_id: optionalText(form, "applyment_id"),
      applyment_state: requiredText(form, "applyment_state") || "not_started",
      applyment_state_message: optionalText(form, "applyment_state_message"),
      appid_binding_state: requiredText(form, "appid_binding_state") ||
        "not_required",
      appid_binding_message: optionalText(form, "appid_binding_message"),
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
        <Badge variant={applymentStatusVariant(config?.applyment_state)}>
          进件 {applymentStatusLabel(config?.applyment_state)}
        </Badge>
        <Badge variant={appidBindingStatusVariant(config?.appid_binding_state)}>
          AppID {appidBindingStatusLabel(config?.appid_binding_state)}
        </Badge>
      </div>

      <FieldGroup className="grid gap-4 md:grid-cols-2">
        <SelectField
          label="收款主体"
          name="principal_type"
          defaultValue={config?.principal_type || "tenant"}
          options={PRINCIPAL_TYPE_OPTIONS}
          disabled={pending || readonly}
        />
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
          label="进件业务编号"
          name="applyment_business_code"
          defaultValue={config?.applyment_business_code || ""}
          disabled={pending || readonly}
        />
        <TextField
          label="微信申请单号"
          name="applyment_id"
          defaultValue={config?.applyment_id || ""}
          disabled={pending || readonly}
        />
        <SelectField
          label="进件状态"
          name="applyment_state"
          defaultValue={config?.applyment_state || "not_started"}
          options={APPLYMENT_STATE_OPTIONS}
          disabled={pending || readonly}
        />
        <SelectField
          label="AppID 绑定状态"
          name="appid_binding_state"
          defaultValue={config?.appid_binding_state || "not_required"}
          options={APPID_BINDING_STATE_OPTIONS}
          disabled={pending || readonly}
        />
        <TextField
          label="进件状态说明"
          name="applyment_state_message"
          defaultValue={config?.applyment_state_message || ""}
          disabled={pending || readonly}
          className="md:col-span-2"
        />
        <TextField
          label="AppID 绑定说明"
          name="appid_binding_message"
          defaultValue={config?.appid_binding_message || ""}
          disabled={pending || readonly}
          className="md:col-span-2"
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

      <Separator />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-xs text-muted-foreground">
          支付渠道：项目收款；更新时间：{config?.updated_at ? formatDateTime(config.updated_at) : "-"}
          {config?.opened_at ? `；开通时间：${formatDateTime(config.opened_at)}` : ""}
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
  const [value, setValue] = useState(defaultValue);
  const fieldId = `wechat-pay-${name}`;

  useEffect(() => {
    setValue(defaultValue);
  }, [defaultValue]);

  return (
    <Field>
      <FieldLabel htmlFor={fieldId}>{label}</FieldLabel>
      <input type="hidden" name={name} value={value} />
      <Select value={value} onValueChange={setValue} disabled={disabled}>
        <SelectTrigger id={fieldId}>
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

function applymentStatusLabel(status: string | null | undefined) {
  return optionLabel(APPLYMENT_STATE_OPTIONS, status, "未开始");
}

function applymentStatusVariant(status: string | null | undefined) {
  if (status === "opened") return "success";
  if (status === "rejected" || status === "closed") return "danger";
  if (
    status === "reviewing" ||
    status === "submitted" ||
    status === "account_verifying" ||
    status === "signing"
  ) {
    return "warning";
  }
  if (status === "suspended") return "secondary";
  return "outline";
}

function appidBindingStatusLabel(status: string | null | undefined) {
  return optionLabel(APPID_BINDING_STATE_OPTIONS, status, "无需绑定");
}

function appidBindingStatusVariant(status: string | null | undefined) {
  if (status === "bound") return "success";
  if (status === "rejected") return "danger";
  if (status === "pending_confirm") return "warning";
  if (status === "not_bound") return "secondary";
  return "outline";
}

function optionLabel(
  options: Array<{ value: string; label: string }>,
  value: string | null | undefined,
  fallback: string,
) {
  return options.find((option) => option.value === value)?.label || fallback;
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
