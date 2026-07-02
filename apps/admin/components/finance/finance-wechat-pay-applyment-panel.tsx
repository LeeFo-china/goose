"use client";

import { type FormEvent, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Save, SendHorizontal } from "lucide-react";
import { StatusAlert } from "@/components/admin/status-alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FieldGroup } from "@/components/ui/field";
import { requestBackendJson } from "@/lib/backend-client";
import {
  formatWechatPayApplymentTime,
  getWechatPayApplymentStatusMeta,
  type WechatPayApplymentAttachment,
  type WechatPayApplymentDetailData,
  type WechatPayApplymentDetailResult,
} from "./finance-wechat-pay-applyment-shared";
import { WechatPayApplymentAttachmentsField } from "./finance-wechat-pay-applyment-attachments";
import {
  SelectField,
  TextareaField,
  TextField,
} from "./finance-wechat-pay-applyment-form-fields";

const SETTLEMENT_ACCOUNT_TYPE_OPTIONS = [
  { value: "BANK_ACCOUNT_TYPE_CORPORATE", label: "对公银行账户" },
  { value: "BANK_ACCOUNT_TYPE_PERSONAL", label: "经营者个人银行卡" },
];

export function FinanceWechatPayApplymentPanel({
  data,
}: {
  data: WechatPayApplymentDetailResult;
}) {
  const router = useRouter();
  const applyment = data.applyment;
  const formRef = useRef<HTMLFormElement>(null);
  const [error, setError] = useState(data.error || "");
  const [saved, setSaved] = useState(false);
  const [attachments, setAttachments] = useState<WechatPayApplymentAttachment[]>(
    applyment?.attachments || [],
  );
  const [pending, startTransition] = useTransition();
  const statusMeta = getWechatPayApplymentStatusMeta(applyment?.status);
  const editable = !applyment || ["draft", "rejected"].includes(applyment.status);

  useEffect(() => {
    setAttachments(applyment?.attachments || []);
  }, [applyment?.id, applyment?.updated_at]);

  function submitSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editable) return;

    const payload = buildCurrentApplymentPayload(event.currentTarget);

    setError("");
    setSaved(false);
    startTransition(async () => {
      try {
        await saveApplymentDraft(payload);
        setSaved(true);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "微信支付开通申请保存失败");
      }
    });
  }

  function submitApplyment() {
    if (!applyment || !data.can_submit) return;
    const formElement = formRef.current;
    if (!formElement) return;
    const payload = buildCurrentApplymentPayload(formElement);
    setError("");
    setSaved(false);
    startTransition(async () => {
      try {
        const savedDetail = await saveApplymentDraft(payload);
        const targetApplyment = savedDetail.applyment || applyment;
        await requestBackendJson<WechatPayApplymentDetailData>(
          `/finance/wechat-pay/applyments/${targetApplyment.id}/submit`,
          {
            method: "POST",
            body: JSON.stringify({ remark: payload.remark || targetApplyment.remark || null }),
            fallbackMessage: "微信支付开通申请提交失败",
          },
        );
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "微信支付开通申请提交失败");
      }
    });
  }

  function buildCurrentApplymentPayload(formElement: HTMLFormElement) {
    return buildApplymentPayload(new FormData(formElement), {
      hasMaskedPhone: Boolean(applyment?.super_admin_phone_masked),
      hasMaskedBankAccount: Boolean(applyment?.settlement_account_number_masked),
      attachments,
    });
  }

  function saveApplymentDraft(payload: Record<string, unknown>) {
    const path = applyment
      ? `/finance/wechat-pay/applyments/${applyment.id}`
      : "/finance/wechat-pay/applyments";
    return requestBackendJson<WechatPayApplymentDetailData>(path, {
      method: applyment ? "PUT" : "POST",
      body: JSON.stringify(payload),
      fallbackMessage: "微信支付开通申请保存失败",
    });
  }

  return (
    <div className="grid min-h-0 gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <form ref={formRef} className="flex min-w-0 flex-col gap-4" onSubmit={submitSave}>
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

        <p className="text-xs leading-5 text-muted-foreground">
          标记为必填的字段会影响保存和提交；营业执照、法人身份证正反面在提交时必传。
        </p>

        <FieldGroup className="grid gap-4 md:grid-cols-2">
          <TextField
            label="商户简称"
            name="merchant_short_name"
            defaultValue={applyment?.merchant_short_name || ""}
            requirement="required"
            required
            disabled={pending || !editable}
            description="对外展示的商户简称，建议使用门店或公司简称。"
          />
          <TextField
            label="营业执照主体名称"
            name="license_name"
            defaultValue={applyment?.license_name || ""}
            requirement="required"
            required
            disabled={pending || !editable}
            description="按营业执照完整填写。"
          />
          <TextField
            label="统一社会信用代码"
            name="license_code"
            defaultValue={applyment?.license_code || ""}
            requirement="required"
            required
            disabled={pending || !editable}
          />
          <TextField
            label="法人姓名"
            name="legal_representative_name"
            defaultValue={applyment?.legal_representative_name || ""}
            requirement="required"
            required
            disabled={pending || !editable}
          />
          <TextField
            label="超级管理员姓名"
            name="super_admin_name"
            defaultValue={applyment?.super_admin_name || ""}
            requirement="required"
            required
            disabled={pending || !editable}
          />
          <TextField
            label="超级管理员手机号"
            name="super_admin_phone"
            defaultValue=""
            placeholder={applyment?.super_admin_phone_masked || "用于平台审核后脱敏保存"}
            requirement="required"
            required={!applyment?.super_admin_phone_masked}
            disabled={pending || !editable}
            description="用于微信支付开户联系；已有脱敏手机号时可留空。"
          />
          <TextField
            label="超级管理员邮箱"
            name="super_admin_email"
            type="email"
            defaultValue={applyment?.super_admin_email || ""}
            requirement="optional"
            disabled={pending || !editable}
          />
          <SelectField
            label="结算账户类型"
            name="settlement_account_type"
            defaultValue={applyment?.settlement_account_type || "BANK_ACCOUNT_TYPE_CORPORATE"}
            options={SETTLEMENT_ACCOUNT_TYPE_OPTIONS}
            requirement="required"
            disabled={pending || !editable}
            description="对公账户填公司账户；对私账户填经营者本人银行卡。"
          />
          <TextField
            label="结算账户开户名"
            name="settlement_account_name"
            defaultValue={applyment?.settlement_account_name || ""}
            requirement="required"
            required
            disabled={pending || !editable}
            description="对公账户填公司全称；对私账户填银行卡开户人姓名。"
          />
          <TextField
            label="开户银行"
            name="settlement_bank_name"
            defaultValue={applyment?.settlement_bank_name || ""}
            requirement="required"
            required
            disabled={pending || !editable}
            description="填写银行基础名称，如中国银行、招商银行。"
          />
          <TextField
            label="银行账号"
            name="settlement_account_number"
            defaultValue=""
            placeholder={applyment?.settlement_account_number_masked || "请输入银行账号"}
            requirement="required"
            required={!applyment?.settlement_account_number_masked}
            disabled={pending || !editable}
            description="保存后只记录掩码；真实进件时使用微信支付公钥加密。"
          />
          <TextField
            label="开户银行全称（含支行）"
            name="settlement_bank_full_name"
            defaultValue={applyment?.settlement_bank_full_name || ""}
            requirement="optional"
            disabled={pending || !editable}
            description="有支行信息时填写完整支行名称。"
          />
          <TextField
            label="开户银行联行号"
            name="settlement_bank_branch_id"
            defaultValue={applyment?.settlement_bank_branch_id || ""}
            requirement="optional"
            disabled={pending || !editable}
            description="已知银行联行号时填写，便于平台线下进件核对。"
          />
          <TextareaField
            label="经营场景说明"
            name="business_scene_description"
            defaultValue={applyment?.business_scene_description || ""}
            requirement="required"
            required
            disabled={pending || !editable}
            description="说明租户通过小程序或线下服务收款的业务场景。"
          />
          <TextareaField
            label="联系地址"
            name="contact_address"
            defaultValue={applyment?.contact_address || ""}
            requirement="required"
            required
            disabled={pending || !editable}
            description="填写经营或办公联系地址。"
          />
          <TextareaField
            label="备注"
            name="remark"
            defaultValue={applyment?.remark || ""}
            requirement="optional"
            disabled={pending || !editable}
          />
        </FieldGroup>

        <WechatPayApplymentAttachmentsField
          attachments={attachments}
          editable={editable}
          disabled={pending}
          onChange={setAttachments}
        />

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

function buildApplymentPayload(
  form: FormData,
  options: {
    hasMaskedPhone: boolean;
    hasMaskedBankAccount: boolean;
    attachments: WechatPayApplymentAttachment[];
  },
) {
  const payload: Record<string, unknown> = {
    merchant_short_name: requiredText(form, "merchant_short_name"),
    license_name: requiredText(form, "license_name"),
    license_code: requiredText(form, "license_code"),
    legal_representative_name: requiredText(form, "legal_representative_name"),
    super_admin_name: requiredText(form, "super_admin_name"),
    super_admin_email: optionalText(form, "super_admin_email"),
    settlement_account_type: requiredText(form, "settlement_account_type"),
    settlement_account_name: requiredText(form, "settlement_account_name"),
    settlement_bank_name: requiredText(form, "settlement_bank_name"),
    settlement_bank_full_name: optionalText(form, "settlement_bank_full_name"),
    settlement_bank_branch_id: optionalText(form, "settlement_bank_branch_id"),
    business_scene_description: requiredText(form, "business_scene_description"),
    contact_address: requiredText(form, "contact_address"),
    attachments: options.attachments,
    remark: optionalText(form, "remark"),
  };
  const phone = requiredText(form, "super_admin_phone");
  if (phone || !options.hasMaskedPhone) {
    payload.super_admin_phone = phone;
  }
  const accountNumber = requiredText(form, "settlement_account_number");
  if (accountNumber || !options.hasMaskedBankAccount) {
    payload.settlement_account_number = accountNumber;
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
