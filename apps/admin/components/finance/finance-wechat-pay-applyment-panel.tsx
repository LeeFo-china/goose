"use client";

import { type FormEvent, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Save, SendHorizontal } from "lucide-react";
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
import { Textarea } from "@/components/ui/textarea";
import { requestBackendJson } from "@/lib/backend-client";
import {
  formatWechatPayApplymentTime,
  getWechatPayApplymentStatusMeta,
  type WechatPayApplymentDetailData,
  type WechatPayApplymentDetailResult,
} from "./finance-wechat-pay-applyment-shared";

export function FinanceWechatPayApplymentPanel({
  data,
}: {
  data: WechatPayApplymentDetailResult;
}) {
  const router = useRouter();
  const [error, setError] = useState(data.error || "");
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();
  const applyment = data.applyment;
  const statusMeta = getWechatPayApplymentStatusMeta(applyment?.status);
  const editable = !applyment || ["draft", "rejected"].includes(applyment.status);

  function submitSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editable) return;

    const form = new FormData(event.currentTarget);
    const payload = buildApplymentPayload(form, {
      hasMaskedPhone: Boolean(applyment?.super_admin_phone_masked),
    });
    const path = applyment
      ? `/finance/wechat-pay/applyments/${applyment.id}`
      : "/finance/wechat-pay/applyments";
    const method = applyment ? "PUT" : "POST";

    setError("");
    setSaved(false);
    startTransition(async () => {
      try {
        await requestBackendJson<WechatPayApplymentDetailData>(path, {
          method,
          body: JSON.stringify(payload),
          fallbackMessage: "微信支付开通申请保存失败",
        });
        setSaved(true);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "微信支付开通申请保存失败");
      }
    });
  }

  function submitApplyment() {
    if (!applyment || !data.can_submit) return;
    setError("");
    setSaved(false);
    startTransition(async () => {
      try {
        await requestBackendJson<WechatPayApplymentDetailData>(
          `/finance/wechat-pay/applyments/${applyment.id}/submit`,
          {
            method: "POST",
            body: JSON.stringify({ remark: applyment.remark || null }),
            fallbackMessage: "微信支付开通申请提交失败",
          },
        );
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "微信支付开通申请提交失败");
      }
    });
  }

  return (
    <div className="grid min-h-0 gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <form className="flex min-w-0 flex-col gap-4" onSubmit={submitSave}>
        {error ? <StatusAlert>{error}</StatusAlert> : null}
        {saved ? <StatusAlert tone="success">开通申请已保存。</StatusAlert> : null}
        {!editable ? (
          <StatusAlert tone="warning">当前申请已提交或进入平台处理阶段，租户侧只读。</StatusAlert>
        ) : null}
        {applyment?.rejected_reason ? (
          <StatusAlert tone="warning" title="驳回原因">
            {applyment.rejected_reason}
          </StatusAlert>
        ) : null}

        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={statusMeta.variant}>{statusMeta.label}</Badge>
          {applyment?.application_no ? (
            <Badge variant="outline">{applyment.application_no}</Badge>
          ) : null}
          {applyment?.sub_mchid ? (
            <Badge variant="outline">子商户 {applyment.sub_mchid}</Badge>
          ) : null}
          {applyment?.appid_binding_state ? (
            <Badge variant="outline">AppID {applyment.appid_binding_state}</Badge>
          ) : null}
        </div>

        <FieldGroup className="grid gap-4 md:grid-cols-2">
          <TextField
            label="商户简称"
            name="merchant_short_name"
            defaultValue={applyment?.merchant_short_name || ""}
            disabled={pending || !editable}
          />
          <TextField
            label="营业执照主体名称"
            name="license_name"
            defaultValue={applyment?.license_name || ""}
            disabled={pending || !editable}
          />
          <TextField
            label="统一社会信用代码"
            name="license_code"
            defaultValue={applyment?.license_code || ""}
            disabled={pending || !editable}
          />
          <TextField
            label="法人姓名"
            name="legal_representative_name"
            defaultValue={applyment?.legal_representative_name || ""}
            disabled={pending || !editable}
          />
          <TextField
            label="超级管理员姓名"
            name="super_admin_name"
            defaultValue={applyment?.super_admin_name || ""}
            disabled={pending || !editable}
          />
          <TextField
            label="超级管理员手机号"
            name="super_admin_phone"
            defaultValue=""
            placeholder={applyment?.super_admin_phone_masked || "用于平台审核后脱敏保存"}
            disabled={pending || !editable}
            description="保存后只记录脱敏手机号。"
          />
          <TextField
            label="超级管理员邮箱"
            name="super_admin_email"
            type="email"
            defaultValue={applyment?.super_admin_email || ""}
            disabled={pending || !editable}
          />
          <TextField
            label="结算账户开户名"
            name="settlement_account_name"
            defaultValue={applyment?.settlement_account_name || ""}
            disabled={pending || !editable}
          />
          <TextField
            label="开户银行"
            name="settlement_bank_name"
            defaultValue={applyment?.settlement_bank_name || ""}
            disabled={pending || !editable}
          />
          <TextField
            label="结算账户摘要"
            name="settlement_account_summary"
            defaultValue={applyment?.settlement_account_summary || ""}
            disabled={pending || !editable}
          />
          <TextareaField
            label="经营场景说明"
            name="business_scene_description"
            defaultValue={applyment?.business_scene_description || ""}
            disabled={pending || !editable}
          />
          <TextareaField
            label="联系地址"
            name="contact_address"
            defaultValue={applyment?.contact_address || ""}
            disabled={pending || !editable}
          />
          <TextareaField
            label="备注"
            name="remark"
            defaultValue={applyment?.remark || ""}
            disabled={pending || !editable}
          />
        </FieldGroup>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
          <div className="text-xs text-muted-foreground">
            最近更新：{formatWechatPayApplymentTime(applyment?.updated_at)}
          </div>
          <div className="flex gap-2">
            <Button type="submit" disabled={pending || !editable}>
              {pending ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <Save data-icon="inline-start" />}
              保存草稿
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={pending || !applyment || !data.can_submit}
              onClick={submitApplyment}
            >
              <SendHorizontal data-icon="inline-start" />
              提交申请
            </Button>
          </div>
        </div>
      </form>

      <aside className="min-w-0 rounded-md border bg-card p-4">
        <h2 className="text-sm font-semibold">处理记录</h2>
        <div className="mt-3 flex flex-col gap-3">
          {data.events.length > 0 ? data.events.map((event) => (
            <div key={event.id} className="rounded-md border p-3">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline">{event.event_type}</Badge>
                <span className="text-xs text-muted-foreground">
                  {formatWechatPayApplymentTime(event.created_at)}
                </span>
              </div>
              <p className="mt-2 text-sm">{event.message || "-"}</p>
            </div>
          )) : (
            <div className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
              暂无处理记录
            </div>
          )}
        </div>
      </aside>
    </div>
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
}: {
  label: string;
  name: string;
  defaultValue?: string;
  placeholder?: string;
  description?: string;
  type?: string;
  disabled?: boolean;
}) {
  return (
    <Field>
      <FieldLabel htmlFor={`wechat-pay-applyment-${name}`}>{label}</FieldLabel>
      <Input
        id={`wechat-pay-applyment-${name}`}
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

function TextareaField({
  label,
  name,
  defaultValue,
  disabled,
}: {
  label: string;
  name: string;
  defaultValue?: string;
  disabled?: boolean;
}) {
  return (
    <Field className="md:col-span-2">
      <FieldLabel htmlFor={`wechat-pay-applyment-${name}`}>{label}</FieldLabel>
      <Textarea
        id={`wechat-pay-applyment-${name}`}
        name={name}
        defaultValue={defaultValue}
        disabled={disabled}
        rows={3}
      />
    </Field>
  );
}

function buildApplymentPayload(
  form: FormData,
  options: { hasMaskedPhone: boolean },
) {
  const payload: Record<string, unknown> = {
    merchant_short_name: requiredText(form, "merchant_short_name"),
    license_name: requiredText(form, "license_name"),
    license_code: requiredText(form, "license_code"),
    legal_representative_name: requiredText(form, "legal_representative_name"),
    super_admin_name: requiredText(form, "super_admin_name"),
    super_admin_email: optionalText(form, "super_admin_email"),
    settlement_account_name: requiredText(form, "settlement_account_name"),
    settlement_bank_name: requiredText(form, "settlement_bank_name"),
    settlement_account_summary: requiredText(form, "settlement_account_summary"),
    business_scene_description: requiredText(form, "business_scene_description"),
    contact_address: requiredText(form, "contact_address"),
    remark: optionalText(form, "remark"),
  };
  const phone = requiredText(form, "super_admin_phone");
  if (phone || !options.hasMaskedPhone) {
    payload.super_admin_phone = phone;
  }
  return payload;
}

function requiredText(form: FormData, key: string) {
  return String(form.get(key) || "").trim();
}

function optionalText(form: FormData, key: string) {
  const value = requiredText(form, key);
  return value || null;
}
