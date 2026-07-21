"use client";

import { type FormEvent, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  CheckCircle2,
  Copy,
  ExternalLink,
  Loader2,
  SendHorizontal,
  ShieldCheck,
  Wrench,
} from "lucide-react";
import { StatusAlert } from "@/components/admin/status-alert";
import type {
  WechatPayApplymentAvailableAction,
  WechatPayApplymentRecord,
} from "@/components/finance/finance-wechat-pay-applyment-shared";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
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
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { requestBackendJson } from "@/lib/backend-client";
import type { PlatformWechatPayApplymentDetailResult } from "./platform-wechat-pay-applyment-requests";
import { PlatformWechatPayApplymentSubmitDialog } from "./platform-wechat-pay-applyment-submit-dialog";
import { PlatformWechatPayApplymentSync } from "./platform-wechat-pay-applyment-sync";

const REPAIR_STATE_OPTIONS = [
  { value: "reviewing", label: "微信审核中" },
  { value: "account_verifying", label: "账户验证" },
  { value: "signing", label: "待签约" },
  { value: "opened", label: "已开通" },
  { value: "rejected", label: "微信驳回" },
  { value: "suspended", label: "暂停" },
  { value: "closed", label: "关闭" },
];

export function PlatformWechatPayApplymentActions({
  applyment,
  availableActions,
}: {
  applyment: WechatPayApplymentRecord;
  availableActions: WechatPayApplymentAvailableAction[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [syncPending, setSyncPending] = useState(false);
  const signAction = availableActions.find((action) => action.key === "open_sign_url");
  const hasAction = (key: string) =>
    availableActions.some((action) => action.key === key);

  function submitJson(
    path: string,
    method: "POST",
    payload: Record<string, unknown>,
    fallbackMessage: string,
  ) {
    if (pending || syncPending) return;
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
      } catch (submitError) {
        setError(
          submitError instanceof Error ? submitError.message : fallbackMessage,
        );
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

  function handleRepair(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const targetState = requiredText(form, "applyment_state");
    if (!targetState) {
      setSuccess("");
      setError("请选择修复后的目标状态");
      return;
    }
    submitJson(
      `/platform/finance/wechat-pay/applyments/${applyment.id}/repair-wechat-state`,
      "POST",
      {
        reason: requiredText(form, "reason"),
        applyment_state: targetState,
        applyment_id: optionalText(form, "applyment_id"),
        sub_mchid: optionalText(form, "sub_mchid"),
      },
      "修复微信进件状态失败",
    );
  }

  async function copySignUrl() {
    const url = signAction?.url;
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setError("");
      setSuccess("签约链接已复制");
    } catch {
      setSuccess("");
      setError("签约链接复制失败，请打开后从浏览器地址栏复制");
    }
  }

  const hasAnyAction = availableActions.length > 0;
  const busy = pending || syncPending;

  return (
    <div className="flex flex-col gap-5">
      {error ? <StatusAlert>{error}</StatusAlert> : null}
      {success ? <StatusAlert tone="success">{success}</StatusAlert> : null}

      {hasAction("approve") || hasAction("reject") ? (
        <section className="flex flex-col gap-4">
          <div>
            <h2 className="text-sm font-semibold">平台资料审核</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              审核租户主体、联系人、结算账户与附件是否一致。
            </p>
          </div>
          {hasAction("approve") ? (
            <form className="flex flex-col gap-3" onSubmit={handleApprove}>
              <TextareaField name="message" label="审核说明" />
              <Button type="submit" className="w-full" disabled={busy}>
                {busy ? (
                  <Loader2 className="animate-spin" data-icon="inline-start" />
                ) : <CheckCircle2 data-icon="inline-start" />}
                审核通过
              </Button>
            </form>
          ) : null}
          {hasAction("reject") ? (
            <form className="flex flex-col gap-3 border-t pt-4" onSubmit={handleReject}>
              <TextareaField name="reason" label="驳回原因" required />
              <Button type="submit" variant="destructive" disabled={busy}>
                驳回租户修改
              </Button>
            </form>
          ) : null}
        </section>
      ) : null}

      {hasAction("submit_to_wechat") ? (
        <section className="border-t pt-5">
          <PlatformWechatPayApplymentSubmitDialog
            triggerLabel="提交微信审核"
            title="确认提交微信正式进件？"
            description="系统将使用已审核资料、加密敏感信息和中央服务商配置调用微信支付正式进件。提交成功后只能按微信返回状态继续处理。"
            confirmLabel="确认提交"
            pending={busy}
            icon={<SendHorizontal data-icon="inline-start" />}
            onConfirm={() => submitJson(
              `/platform/finance/wechat-pay/applyments/${applyment.id}/submit-to-wechat`,
              "POST",
              {},
              "提交微信正式进件失败",
            )}
          />
        </section>
      ) : null}

      {hasAction("activate_payment_config") ? (
        <section className="flex flex-col gap-3 border-t pt-5">
          <div>
            <h2 className="text-sm font-semibold">激活租户收款</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              商户号、AppID、证书、回调地址和密钥引用来自已验证的中央服务商配置。
            </p>
          </div>
          <PlatformWechatPayApplymentSubmitDialog
            triggerLabel="激活租户收款"
            title="确认激活租户微信收款？"
            description="激活后该租户将使用当前子商户号和平台统一小程序 AppID 发起真实支付。请先确认微信进件已经完成。"
            confirmLabel="确认激活"
            pending={busy}
            icon={<ShieldCheck data-icon="inline-start" />}
            onConfirm={() => submitJson(
              `/platform/finance/wechat-pay/applyments/${applyment.id}/activate-config`,
              "POST",
              {},
              "激活微信支付配置失败",
            )}
          />
        </section>
      ) : null}

      {hasAction("sync_wechat_status") || signAction ? (
        <section className="flex flex-col gap-3 border-t pt-5">
          <PlatformWechatPayApplymentSync
            applymentId={applyment.id}
            status={applyment.status}
            enabled={hasAction("sync_wechat_status")}
            disabled={pending}
            onPendingChange={setSyncPending}
          />
          {signAction?.url ? (
            <TooltipProvider delayDuration={200}>
              <div className="flex gap-2">
                <Button asChild variant="outline" className="min-w-0 flex-1">
                  <a href={signAction.url} target="_blank" rel="noreferrer">
                    <ExternalLink data-icon="inline-start" />
                    打开签约链接
                  </a>
                </Button>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      aria-label="复制签约链接"
                      onClick={() => void copySignUrl()}
                    >
                      <Copy aria-hidden="true" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>复制签约链接</TooltipContent>
                </Tooltip>
              </div>
            </TooltipProvider>
          ) : null}
        </section>
      ) : null}

      {hasAction("repair_wechat_state") ? (
        <section className="border-t pt-5">
          <form className="flex flex-col gap-3" onSubmit={handleRepair}>
            <div>
              <h2 className="flex items-center gap-2 text-sm font-semibold">
                <Wrench aria-hidden="true" className="size-4" />
                受控状态修复
              </h2>
              <p className="mt-1 text-xs text-muted-foreground">
                仅在微信运营工单确认后使用，日常状态必须通过官方同步获得。
              </p>
            </div>
            <SelectField
              name="applyment_state"
              label="修复后的状态"
              defaultValue=""
              placeholder="请选择目标状态"
              options={REPAIR_STATE_OPTIONS}
            />
            <TextField
              name="applyment_id"
              label="微信申请单号"
              defaultValue={applyment.applyment_id || ""}
            />
            <TextField
              name="sub_mchid"
              label="子商户号"
              defaultValue={applyment.sub_mchid || ""}
            />
            <TextareaField name="reason" label="修复原因" required />
            <Button type="submit" variant="outline" disabled={busy}>
              提交受控修复
            </Button>
          </form>
        </section>
      ) : null}

      {!hasAnyAction ? (
        <div className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
          当前状态没有可执行操作，仅可查看申请和官方进件证据。
        </div>
      ) : null}
    </div>
  );
}

function TextField({
  name,
  label,
  defaultValue,
}: {
  name: string;
  label: string;
  defaultValue?: string;
}) {
  return (
    <Field>
      <FieldLabel htmlFor={`platform-wechat-pay-${name}`}>{label}</FieldLabel>
      <Input id={`platform-wechat-pay-${name}`} name={name} defaultValue={defaultValue} />
    </Field>
  );
}

function TextareaField({
  name,
  label,
  required,
}: {
  name: string;
  label: string;
  required?: boolean;
}) {
  return (
    <Field>
      <FieldLabel htmlFor={`platform-wechat-pay-${name}`}>{label}</FieldLabel>
      <Textarea
        id={`platform-wechat-pay-${name}`}
        name={name}
        required={required}
        rows={3}
      />
      {required ? (
        <FieldDescription>此操作会写入审计记录，必须填写原因。</FieldDescription>
      ) : null}
    </Field>
  );
}

function SelectField({
  name,
  label,
  defaultValue,
  placeholder,
  options,
}: {
  name: string;
  label: string;
  defaultValue: string;
  placeholder?: string;
  options: Array<{ value: string; label: string }>;
}) {
  const [value, setValue] = useState(defaultValue);
  const fieldId = `platform-wechat-pay-${name}`;

  useEffect(() => setValue(defaultValue), [defaultValue]);

  return (
    <Field>
      <FieldLabel htmlFor={fieldId}>{label}</FieldLabel>
      <input type="hidden" name={name} value={value} />
      <Select value={value} onValueChange={setValue}>
        <SelectTrigger id={fieldId} aria-required="true">
          <SelectValue placeholder={placeholder} />
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
