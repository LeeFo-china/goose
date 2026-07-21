"use client";

import { CheckCircle2, CircleAlert, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Separator } from "@/components/ui/separator";
import type {
  WechatPayApplymentAttachment,
  WechatPayApplymentRecord,
} from "./finance-wechat-pay-applyment-shared";

const BASE_REQUIRED_ATTACHMENTS = [
  "license_copy",
  "legal_representative_id_card_front",
  "legal_representative_id_card_back",
];

export function FinanceWechatPayApplymentReview({
  applyment,
  attachments,
  contactType,
  confirmed,
  disabled,
  onConfirmedChange,
}: {
  applyment: WechatPayApplymentRecord | null;
  attachments: WechatPayApplymentAttachment[];
  contactType: string;
  confirmed: boolean;
  disabled: boolean;
  onConfirmedChange: (checked: boolean) => void;
}) {
  const requiredCategories = contactType === "SUPER"
    ? [...BASE_REQUIRED_ATTACHMENTS, "contact_id_card_front", "contact_id_card_back"]
    : BASE_REQUIRED_ATTACHMENTS;
  const uploadedCategories = new Set(
    attachments.map((attachment) => attachment.category).filter(Boolean),
  );
  const readyAttachmentCount = requiredCategories.filter((category) =>
    uploadedCategories.has(category)
  ).length;
  const attachmentsReady = readyAttachmentCount === requiredCategories.length;

  return (
    <section className="flex flex-col gap-4 rounded-md border p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold">提交复核</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            提交后由平台审核，再发送至微信支付。
          </p>
        </div>
        <Badge variant={attachmentsReady ? "success" : "warning"}>
          必传附件 {readyAttachmentCount}/{requiredCategories.length}
        </Badge>
      </div>

      <Separator />

      <div className="grid gap-3 sm:grid-cols-2">
        <ReviewItem
          ready={Boolean(applyment?.has_sensitive_payload)}
          label="敏感资料"
          value={applyment?.has_sensitive_payload ? "已加密保存" : "保存后生成加密载荷"}
        />
        <ReviewItem
          ready={attachmentsReady}
          label="必传附件"
          value={attachmentsReady ? "已齐全" : "仍有附件未上传"}
        />
        <ReviewItem
          ready={contactType === "LEGAL" || uploadedCategories.has("contact_id_card_front")}
          label="超级管理员"
          value={contactType === "LEGAL" ? "法人本人" : "经办人"}
        />
        <ReviewItem
          ready={Boolean(applyment?.settlement_account_number_masked)}
          label="结算账户"
          value={applyment?.settlement_account_number_masked || "保存后显示掩码"}
        />
      </div>

      <Field data-disabled={disabled || undefined}>
        <div className="flex items-start gap-3 rounded-md bg-muted/50 p-3">
          <Checkbox
            id="wechat-pay-applyment-confirmed"
            checked={confirmed}
            disabled={disabled}
            onCheckedChange={(checked) => onConfirmedChange(checked === true)}
          />
          <div className="min-w-0">
            <FieldLabel
              htmlFor="wechat-pay-applyment-confirmed"
              className="font-medium"
            >
              确认资料真实有效
            </FieldLabel>
            <FieldDescription>
              已核对主体、联系人、结算账户和附件，确认可提交平台审核。
            </FieldDescription>
          </div>
        </div>
      </Field>
    </section>
  );
}

function ReviewItem({
  ready,
  label,
  value,
}: {
  ready: boolean;
  label: string;
  value: string;
}) {
  const Icon = ready ? CheckCircle2 : CircleAlert;
  return (
    <div className="flex min-w-0 gap-3 rounded-md border p-3">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
        <Icon aria-hidden="true" className="size-4" />
      </span>
      <div className="min-w-0">
        <div className="flex items-center gap-2 text-sm font-medium">
          {label}
          {label === "敏感资料" ? <ShieldCheck aria-hidden="true" className="size-4" /> : null}
        </div>
        <p className="mt-1 break-words text-xs text-muted-foreground">{value}</p>
      </div>
    </div>
  );
}
