"use client";

import {
  CheckCircle2,
  Link2,
  Loader2,
  Plus,
  ReceiptText,
  RefreshCw,
  WalletCards,
} from "lucide-react";
import { type FormEvent, type ReactNode, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { StatusAlert } from "@/components/admin/status-alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Field,
  FieldDescription,
  FieldError,
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
import { Textarea } from "@/components/ui/textarea";
import type {
  PartnerSettlementBatchRecord,
  PlatformPartnerLevel,
  PlatformPartnerRecord,
} from "@/components/platform-partners/platform-partner-types";
import { requestBackendJson } from "@/lib/backend-client";
import { refreshAfterDialogClose } from "@/lib/deferred-refresh";

type Option = { value: string; label: string };
export type FieldConfig = {
  name: string;
  label: string;
  type?: "text" | "number" | "date" | "datetime-local" | "textarea" | "select";
  placeholder?: string;
  description?: string;
  required?: boolean;
  defaultValue?: string;
  options?: Option[];
};

type MutationDialogButtonProps = {
  title: string;
  description: string;
  trigger: ReactNode;
  submitLabel: string;
  fields?: FieldConfig[];
  fallbackMessage: string;
  endpoint: string | ((formData: FormData) => string);
  method?: "POST" | "PATCH";
  buildPayload?: (formData: FormData) => Record<string, unknown>;
};

export function CreatePartnerButton({
  levels,
}: {
  levels: PlatformPartnerLevel[];
}) {
  return (
    <MutationDialogButton
      title="新建城市合伙人"
      description="创建后默认进入待审核状态，启用后才能绑定装企和生成邀请码。"
      trigger={<Button><Plus data-icon="inline-start" />新建合伙人</Button>}
      submitLabel="创建"
      fallbackMessage="创建城市合伙人失败"
      endpoint="/platform/partners"
      fields={[
        { name: "name", label: "合伙人名称", required: true },
        {
          name: "subject_type",
          label: "主体类型",
          type: "select",
          required: true,
          options: [
            { value: "personal", label: "个人" },
            { value: "individual_business", label: "个体工商户" },
            { value: "company", label: "企业" },
          ],
        },
        { name: "contact_name", label: "联系人", required: true },
        { name: "phone", label: "联系电话", required: true },
        {
          name: "level_id",
          label: "合伙人等级",
          type: "select",
          required: true,
          options: levels.map((level) => ({ value: level.id, label: level.name })),
        },
        { name: "region_codes", label: "区域编码", placeholder: "多个区域用逗号分隔" },
        { name: "remark", label: "备注", type: "textarea" },
      ]}
      buildPayload={(formData) => ({
        name: stringField(formData, "name"),
        subject_type: stringField(formData, "subject_type"),
        contact_name: stringField(formData, "contact_name"),
        phone: stringField(formData, "phone"),
        level_id: stringField(formData, "level_id"),
        region_codes: splitCsv(stringField(formData, "region_codes")),
        remark: optionalString(formData, "remark"),
      })}
    />
  );
}

export function CreateInviteCodeButton({
  partner,
}: {
  partner: PlatformPartnerRecord;
}) {
  return (
    <MutationDialogButton
      title="生成专属邀请码"
      description={`为「${partner.name}」生成装企入驻绑定入口。`}
      trigger={<Button type="button" size="sm" variant="outline"><Link2 data-icon="inline-start" />邀请码</Button>}
      submitLabel="生成"
      fallbackMessage="生成合伙人邀请码失败"
      endpoint={`/platform/partners/${partner.id}/invite-codes`}
      fields={[
        { name: "region_code", label: "区域编码", placeholder: partner.region_codes[0] ?? "可不填" },
        { name: "campaign_code", label: "活动编码" },
        { name: "expires_at", label: "过期时间", type: "datetime-local" },
      ]}
      buildPayload={(formData) => ({
        region_code: optionalString(formData, "region_code"),
        campaign_code: optionalString(formData, "campaign_code"),
        expires_at: optionalDateTime(formData, "expires_at"),
      })}
    />
  );
}

export function CreateBindingButton({
  partners,
}: {
  partners: PlatformPartnerRecord[];
}) {
  return (
    <MutationDialogButton
      title="新增装企绑定"
      description="用于补录或纠正装企与合伙人的归属关系。"
      trigger={<Button variant="outline"><Link2 data-icon="inline-start" />新增绑定</Button>}
      submitLabel="绑定"
      fallbackMessage="创建装企合伙人绑定失败"
      endpoint="/platform/partner-bindings"
      fields={[
        { name: "tenant_id", label: "租户 ID", required: true },
        {
          name: "partner_id",
          label: "合伙人",
          type: "select",
          required: true,
          options: partners.map((partner) => ({ value: partner.id, label: partner.name })),
        },
        {
          name: "source_type",
          label: "来源类型",
          type: "select",
          required: true,
          options: [
            { value: "manual", label: "手工绑定" },
            { value: "invite_code", label: "邀请码" },
            { value: "lead_source", label: "线索来源" },
          ],
        },
        { name: "invite_code_id", label: "邀请码 ID" },
        { name: "change_reason", label: "绑定原因", type: "textarea", required: true },
      ]}
      buildPayload={(formData) => ({
        tenant_id: stringField(formData, "tenant_id"),
        partner_id: stringField(formData, "partner_id"),
        source_type: stringField(formData, "source_type"),
        invite_code_id: optionalString(formData, "invite_code_id"),
        change_reason: stringField(formData, "change_reason"),
      })}
    />
  );
}

export function CreateLeadServiceFeeButton() {
  return (
    <MutationDialogButton
      title="录入线索服务费"
      description="仅记录平台从线索成交中取得的服务费，装修公司项目收支不进入平台分成。"
      trigger={<Button variant="outline"><ReceiptText data-icon="inline-start" />录入线索服务费</Button>}
      submitLabel="录入"
      fallbackMessage="录入线索服务费失败"
      endpoint="/platform/partner-revenue/lead-service-fees"
      fields={[
        { name: "tenant_id", label: "租户 ID", required: true },
        { name: "platform_lead_id", label: "平台线索 ID", required: true },
        { name: "contract_amount_yuan", label: "成交金额(元)", type: "number", required: true },
        { name: "paid_amount_yuan", label: "平台服务费实收(元)", type: "number", required: true },
        { name: "service_fee_rate_percent", label: "线索服务费率(%)", type: "number", defaultValue: "2.5" },
        { name: "paid_at", label: "支付时间", type: "datetime-local" },
        { name: "remark", label: "备注", type: "textarea" },
      ]}
      buildPayload={(formData) => ({
        tenant_id: stringField(formData, "tenant_id"),
        platform_lead_id: stringField(formData, "platform_lead_id"),
        contract_amount_fen: yuanToFen(formData, "contract_amount_yuan"),
        paid_amount_fen: yuanToFen(formData, "paid_amount_yuan"),
        service_fee_rate_bps: percentToBps(formData, "service_fee_rate_percent"),
        paid_at: optionalDateTime(formData, "paid_at"),
        remark: optionalString(formData, "remark"),
      })}
    />
  );
}

export function SyncRechargeRevenueButton() {
  return (
    <MutationDialogButton
      title="同步充值收入"
      description="扫描已支付且未生成平台收入事件的微信积分充值订单。"
      trigger={<Button variant="outline"><RefreshCw data-icon="inline-start" />同步充值收入</Button>}
      submitLabel="同步"
      fallbackMessage="同步充值收入失败"
      endpoint="/platform/partner-revenue/recharge-events/sync"
      fields={[{ name: "pageSize", label: "单次扫描数量", type: "number", defaultValue: "100" }]}
      buildPayload={(formData) => ({ pageSize: Number(stringField(formData, "pageSize") || 100) })}
    />
  );
}

export function CreateSettlementBatchButton({
  partners,
}: {
  partners: PlatformPartnerRecord[];
}) {
  return (
    <MutationDialogButton
      title="创建月结批次"
      description="第一期为人工月结，批次创建后台账进入结算中。"
      trigger={<Button variant="outline"><WalletCards data-icon="inline-start" />创建月结</Button>}
      submitLabel="创建批次"
      fallbackMessage="创建月结批次失败"
      endpoint="/platform/partner-settlements/monthly-batches"
      fields={[
        {
          name: "partner_id",
          label: "合伙人",
          type: "select",
          required: true,
          options: partners.map((partner) => ({ value: partner.id, label: partner.name })),
        },
        { name: "period_start", label: "周期开始", type: "date", required: true },
        { name: "period_end", label: "周期结束", type: "date", required: true },
        { name: "ledger_ids", label: "分佣台账 ID", type: "textarea", required: true, description: "多个 ID 用逗号或换行分隔。" },
        { name: "remark", label: "备注", type: "textarea" },
      ]}
      buildPayload={(formData) => ({
        partner_id: stringField(formData, "partner_id"),
        period_start: stringField(formData, "period_start"),
        period_end: stringField(formData, "period_end"),
        ledger_ids: splitLoose(stringField(formData, "ledger_ids")),
        remark: optionalString(formData, "remark"),
      })}
    />
  );
}

export function MarkSettlementPaidButton({
  batch,
}: {
  batch: PartnerSettlementBatchRecord;
}) {
  return (
    <MutationDialogButton
      title="标记已打款"
      description={`确认批次 ${batch.batch_no} 已完成线下人工打款。`}
      trigger={<Button type="button" size="sm" variant="outline" disabled={batch.status === "paid"}><CheckCircle2 data-icon="inline-start" />打款</Button>}
      submitLabel="确认打款"
      fallbackMessage="标记结算批次已打款失败"
      endpoint={`/platform/partner-settlements/${batch.id}/mark-paid`}
      fields={[
        { name: "payment_reference", label: "付款流水号", required: true },
        { name: "paid_at", label: "打款时间", type: "datetime-local", required: true },
        { name: "payment_proof_url", label: "付款凭证链接" },
        { name: "remark", label: "备注", type: "textarea" },
      ]}
      buildPayload={(formData) => ({
        payment_reference: stringField(formData, "payment_reference"),
        paid_at: optionalDateTime(formData, "paid_at"),
        payment_proof_url: optionalString(formData, "payment_proof_url"),
        remark: optionalString(formData, "remark"),
      })}
    />
  );
}

export function MutationDialogButton({
  title,
  description,
  trigger,
  submitLabel,
  fields = [],
  fallbackMessage,
  endpoint,
  method = "POST",
  buildPayload = () => ({}),
}: MutationDialogButtonProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const formData = new FormData(event.currentTarget);
    startTransition(async () => {
      try {
        await requestBackendJson(
          typeof endpoint === "function" ? endpoint(formData) : endpoint,
          {
            method,
            body: JSON.stringify(cleanPayload(buildPayload(formData))),
            fallbackMessage,
          },
        );
        setOpen(false);
        refreshAfterDialogClose(router);
      } catch (submitError) {
        setError(submitError instanceof Error ? submitError.message : fallbackMessage);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !pending && setOpen(nextOpen)}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-w-[560px]">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <form className="flex flex-col gap-4" onSubmit={onSubmit}>
          <FieldGroup className="grid gap-4 md:grid-cols-2">
            {fields.map((field) => (
              <DialogField key={field.name} field={field} />
            ))}
          </FieldGroup>
          {error ? <StatusAlert>{error}</StatusAlert> : null}
          <FieldError />
          <DialogFooter>
            <Button type="button" variant="outline" disabled={pending} onClick={() => setOpen(false)}>
              取消
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? <Loader2 className="animate-spin" data-icon="inline-start" /> : null}
              {submitLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function DialogField({ field }: { field: FieldConfig }) {
  const id = `partner-action-${field.name}`;
  if (field.type === "select") {
    return (
      <DialogSelectField
        id={id}
        name={field.name}
        label={field.label}
        defaultValue={field.defaultValue}
        options={field.options ?? []}
      />
    );
  }

  return (
    <Field className={field.type === "textarea" ? "md:col-span-2" : undefined}>
      <FieldLabel htmlFor={id}>{field.label}</FieldLabel>
      {field.type === "textarea" ? (
        <Textarea id={id} name={field.name} placeholder={field.placeholder} required={field.required} defaultValue={field.defaultValue} />
      ) : (
        <Input id={id} name={field.name} type={field.type ?? "text"} placeholder={field.placeholder} required={field.required} defaultValue={field.defaultValue} step={field.type === "number" ? "0.01" : undefined} />
      )}
      {field.description ? <FieldDescription>{field.description}</FieldDescription> : null}
    </Field>
  );
}

function DialogSelectField({
  id,
  name,
  label,
  defaultValue,
  options,
}: {
  id: string;
  name: string;
  label: string;
  defaultValue?: string;
  options: Option[];
}) {
  const [value, setValue] = useState(
    options.some((option) => option.value === defaultValue)
      ? defaultValue ?? ""
      : options[0]?.value ?? "",
  );
  return (
    <Field>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <input type="hidden" name={name} value={value} />
      <Select value={value} onValueChange={setValue}>
        <SelectTrigger id={id}>
          <SelectValue placeholder="请选择" />
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

export function stringField(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function optionalString(formData: FormData, key: string) {
  const value = stringField(formData, key);
  return value || undefined;
}

function optionalDateTime(formData: FormData, key: string) {
  const value = stringField(formData, key);
  return value ? new Date(value).toISOString() : undefined;
}

function splitCsv(value: string) {
  return value.split(",").map((item) => item.trim()).filter(Boolean);
}

function splitLoose(value: string) {
  return value.split(/[\n,]/).map((item) => item.trim()).filter(Boolean);
}

function yuanToFen(formData: FormData, key: string) {
  return Math.round(Number(stringField(formData, key) || 0) * 100);
}

function percentToBps(formData: FormData, key: string) {
  const value = stringField(formData, key);
  return value ? Math.round(Number(value) * 100) : undefined;
}

function cleanPayload(payload: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(payload).filter(([, value]) => value !== undefined),
  );
}
