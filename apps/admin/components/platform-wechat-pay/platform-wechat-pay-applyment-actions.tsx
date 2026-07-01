"use client";

import { type FormEvent, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Save } from "lucide-react";
import { StatusAlert } from "@/components/admin/status-alert";
import { Button } from "@/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { requestBackendJson } from "@/lib/backend-client";
import type {
  PlatformWechatPayApplymentDetailResult,
  WechatPayApplymentRecord,
} from "./platform-wechat-pay-applyment-requests";

const APPLYMENT_STATE_OPTIONS = [
  { value: "reviewing", label: "微信审核中" },
  { value: "account_verifying", label: "账户验证" },
  { value: "signing", label: "待签约" },
  { value: "opened", label: "已开通" },
  { value: "rejected", label: "微信驳回" },
  { value: "suspended", label: "暂停" },
  { value: "closed", label: "关闭" },
];

const APPID_BINDING_OPTIONS = [
  { value: "not_bound", label: "未绑定" },
  { value: "pending_confirm", label: "待确认" },
  { value: "bound", label: "已绑定" },
  { value: "rejected", label: "已拒绝" },
];

export function PlatformWechatPayApplymentActions({
  applyment,
}: {
  applyment: WechatPayApplymentRecord;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  function submitJson(
    path: string,
    method: "POST" | "PUT",
    payload: Record<string, unknown>,
    fallbackMessage: string,
  ) {
    setError("");
    setSuccess("");
    startTransition(async () => {
      try {
        await requestBackendJson<PlatformWechatPayApplymentDetailResult>(path, {
          method,
          body: JSON.stringify(payload),
          fallbackMessage,
        });
        setSuccess("操作已提交");
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : fallbackMessage);
      }
    });
  }

  function handleApprove(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    submitJson(
      `/platform/finance/wechat-pay/applyments/${applyment.id}/approve`,
      "POST",
      { message: optionalText(form, "message") },
      "审核通过失败",
    );
  }

  function handleReject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    submitJson(
      `/platform/finance/wechat-pay/applyments/${applyment.id}/reject`,
      "POST",
      { reason: requiredText(form, "reason") },
      "驳回申请失败",
    );
  }

  function handleMarkApplying(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    submitJson(
      `/platform/finance/wechat-pay/applyments/${applyment.id}/mark-applying`,
      "POST",
      {
        applyment_business_code: optionalText(form, "applyment_business_code"),
        message: optionalText(form, "message"),
      },
      "标记人工进件失败",
    );
  }

  function handleWechatStatus(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    submitJson(
      `/platform/finance/wechat-pay/applyments/${applyment.id}/wechat-status`,
      "PUT",
      {
        applyment_business_code: optionalText(form, "applyment_business_code"),
        applyment_id: optionalText(form, "applyment_id"),
        applyment_state: optionalText(form, "applyment_state"),
        applyment_state_message: optionalText(form, "applyment_state_message"),
        sub_mchid: optionalText(form, "sub_mchid"),
        sub_appid: optionalText(form, "sub_appid"),
        appid_binding_state: optionalText(form, "appid_binding_state"),
        appid_binding_message: optionalText(form, "appid_binding_message"),
      },
      "回填微信进件状态失败",
    );
  }

  function handleActivate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    submitJson(
      `/platform/finance/wechat-pay/applyments/${applyment.id}/activate-config`,
      "POST",
      {
        merchant_id: requiredText(form, "merchant_id"),
        app_id: requiredText(form, "app_id"),
        merchant_name: optionalText(form, "merchant_name"),
        encrypted_config_ref: requiredText(form, "encrypted_config_ref"),
        notify_url: requiredText(form, "notify_url"),
        serial_no: requiredText(form, "serial_no"),
        settlement_account_summary: optionalText(form, "settlement_account_summary"),
      },
      "激活微信支付配置失败",
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {error ? <StatusAlert>{error}</StatusAlert> : null}
      {success ? <StatusAlert tone="success">{success}</StatusAlert> : null}

      <ActionSection title="资料审核" onSubmit={handleApprove}>
        <TextareaField name="message" label="审核说明" />
        <Button type="submit" disabled={pending || applyment.status !== "submitted"}>
          {pending ? <Loader2 className="animate-spin" data-icon="inline-start" /> : null}
          审核通过
        </Button>
      </ActionSection>

      <ActionSection title="驳回申请" onSubmit={handleReject}>
        <TextareaField name="reason" label="驳回原因" required />
        <Button type="submit" variant="destructive" disabled={pending}>
          驳回
        </Button>
      </ActionSection>

      <ActionSection title="人工进件" onSubmit={handleMarkApplying}>
        <TextField
          name="applyment_business_code"
          label="进件业务编号"
          defaultValue={applyment.applyment_business_code || ""}
        />
        <TextareaField name="message" label="处理说明" />
        <Button type="submit" variant="outline" disabled={pending || applyment.status !== "approved"}>
          标记进件中
        </Button>
      </ActionSection>

      <ActionSection title="微信状态回填" onSubmit={handleWechatStatus}>
        <FieldGroup className="grid gap-3 md:grid-cols-2">
          <TextField
            name="applyment_business_code"
            label="进件业务编号"
            defaultValue={applyment.applyment_business_code || ""}
          />
          <TextField
            name="applyment_id"
            label="微信申请单号"
            defaultValue={applyment.applyment_id || ""}
          />
          <SelectField
            name="applyment_state"
            label="进件状态"
            defaultValue={applyment.applyment_state || "reviewing"}
            options={APPLYMENT_STATE_OPTIONS}
          />
          <SelectField
            name="appid_binding_state"
            label="AppID 绑定状态"
            defaultValue={applyment.appid_binding_state || "not_bound"}
            options={APPID_BINDING_OPTIONS}
          />
          <TextField
            name="sub_mchid"
            label="子商户号"
            defaultValue={applyment.sub_mchid || ""}
          />
          <TextField
            name="sub_appid"
            label="子商户 AppID"
            defaultValue={applyment.sub_appid || ""}
          />
          <TextareaField
            name="applyment_state_message"
            label="进件状态说明"
            defaultValue={applyment.applyment_state_message || ""}
          />
          <TextareaField
            name="appid_binding_message"
            label="AppID 绑定说明"
            defaultValue={applyment.appid_binding_message || ""}
          />
        </FieldGroup>
        <Button type="submit" disabled={pending}>
          <Save data-icon="inline-start" />
          保存微信状态
        </Button>
      </ActionSection>

      <ActionSection title="激活配置" onSubmit={handleActivate}>
        <FieldGroup className="grid gap-3 md:grid-cols-2">
          <TextField name="merchant_id" label="服务商商户号" />
          <TextField name="app_id" label="平台小程序 AppID" />
          <TextField
            name="merchant_name"
            label="商户名称"
            defaultValue={applyment.merchant_short_name}
          />
          <TextField
            name="settlement_account_summary"
            label="结算账户摘要"
            defaultValue={applyment.settlement_account_summary || ""}
          />
          <TextField name="encrypted_config_ref" label="密钥引用" />
          <TextField name="serial_no" label="证书序列号" />
          <TextField name="notify_url" label="回调地址" className="md:col-span-2" />
        </FieldGroup>
        <Button type="submit" disabled={pending}>
          激活支付配置
        </Button>
      </ActionSection>
    </div>
  );
}

function ActionSection({
  title,
  onSubmit,
  children,
}: {
  title: string;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  children: React.ReactNode;
}) {
  return (
    <form className="rounded-md border p-4" onSubmit={onSubmit}>
      <h2 className="text-sm font-semibold">{title}</h2>
      <div className="mt-3 flex flex-col gap-3">{children}</div>
    </form>
  );
}

function TextField({
  name,
  label,
  defaultValue,
  className,
}: {
  name: string;
  label: string;
  defaultValue?: string;
  className?: string;
}) {
  return (
    <Field className={className}>
      <FieldLabel htmlFor={`platform-wechat-pay-${name}`}>{label}</FieldLabel>
      <Input id={`platform-wechat-pay-${name}`} name={name} defaultValue={defaultValue} />
    </Field>
  );
}

function TextareaField({
  name,
  label,
  defaultValue,
  required,
}: {
  name: string;
  label: string;
  defaultValue?: string;
  required?: boolean;
}) {
  return (
    <Field>
      <FieldLabel htmlFor={`platform-wechat-pay-${name}`}>{label}</FieldLabel>
      <Textarea
        id={`platform-wechat-pay-${name}`}
        name={name}
        defaultValue={defaultValue}
        required={required}
        rows={3}
      />
    </Field>
  );
}

function SelectField({
  name,
  label,
  defaultValue,
  options,
}: {
  name: string;
  label: string;
  defaultValue: string;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <Field>
      <FieldLabel htmlFor={`platform-wechat-pay-${name}`}>{label}</FieldLabel>
      <select
        id={`platform-wechat-pay-${name}`}
        name={name}
        defaultValue={defaultValue}
        className="h-10 rounded-md border bg-background px-3 text-sm"
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
