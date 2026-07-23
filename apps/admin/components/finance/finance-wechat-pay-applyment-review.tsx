"use client";

import { PencilLine } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Separator } from "@/components/ui/separator";

import type { ApplymentStageKey } from "./finance-wechat-pay-applyment-flow-model";
import {
  formatWechatPayApplymentTime,
  getWechatPayApplymentAttachmentCategoryLabel,
  type WechatPayApplymentAttachment,
  type WechatPayApplymentEvent,
  type WechatPayApplymentRecord,
} from "./finance-wechat-pay-applyment-shared";

const BASE_REQUIRED_ATTACHMENTS = [
  "license_copy",
  "legal_representative_id_card_front",
  "legal_representative_id_card_back",
];

const REVIEW_SECTIONS = [
  { key: "subject", label: "主体和营业执照", target: "recognition" },
  { key: "contact", label: "法人和超级管理员", target: "recognition" },
  { key: "settlement", label: "经营及结算", target: "supplement" },
  { key: "attachments", label: "申请附件", target: "materials" },
] as const satisfies readonly {
  key: string;
  label: string;
  target: ApplymentStageKey;
}[];

export function FinanceWechatPayApplymentReview({
  applyment,
  attachments,
  subjectType,
  contactType,
  confirmed,
  disabled,
  navigationDisabled,
  onConfirmedChange,
  onStageChange,
}: {
  applyment: WechatPayApplymentRecord | null;
  attachments: WechatPayApplymentAttachment[];
  subjectType: string;
  contactType: string;
  confirmed: boolean;
  disabled: boolean;
  navigationDisabled: boolean;
  onConfirmedChange: (checked: boolean) => void;
  onStageChange: (stage: ApplymentStageKey) => void;
}) {
  const requiredCategories = contactType === "SUPER"
    ? [
        ...BASE_REQUIRED_ATTACHMENTS,
        "contact_id_card_front",
        "contact_id_card_back",
      ]
    : BASE_REQUIRED_ATTACHMENTS;
  const uploadedCategories = new Set(
    attachments.map((attachment) => attachment.category).filter(Boolean),
  );
  const readyAttachmentCount = requiredCategories.filter((category) =>
    uploadedCategories.has(category)
  ).length;
  const attachmentsReady = readyAttachmentCount === requiredCategories.length;
  const summaries = buildReviewSummaries({
    applyment,
    attachments,
    subjectType,
    contactType,
  });

  return (
    <section className="flex flex-col gap-4">
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

      <div className="divide-y rounded-md border">
        {REVIEW_SECTIONS.map((section) => (
          <section
            key={section.key}
            className="flex flex-wrap items-start justify-between gap-3 p-3"
          >
            <div className="min-w-0">
              <h3 className="text-sm font-medium">{section.label}</h3>
              <p className="mt-1 break-words text-xs text-muted-foreground">
                {summaries[section.key]}
              </p>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={navigationDisabled}
              onClick={() => onStageChange(section.target)}
            >
              <PencilLine data-icon="inline-start" />
              返回修改
            </Button>
          </section>
        ))}
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

export function FinanceWechatPayApplymentEvents({
  events,
}: {
  events: WechatPayApplymentEvent[];
}) {
  return (
    <aside className="h-fit min-w-0">
      <h2 className="text-sm font-semibold">处理记录</h2>
      <div className="mt-3 flex flex-col gap-3">
        {events.length > 0
          ? events.map((event) => (
              <div key={event.id} className="rounded-md border p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline">{event.event_type}</Badge>
                  <span className="text-xs text-muted-foreground">
                    {formatWechatPayApplymentTime(event.created_at)}
                  </span>
                </div>
                <p className="mt-2 text-sm">{event.message || "-"}</p>
              </div>
            ))
          : (
              <div className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
                暂无处理记录
              </div>
            )}
      </div>
    </aside>
  );
}

function buildReviewSummaries(input: {
  applyment: WechatPayApplymentRecord | null;
  attachments: WechatPayApplymentAttachment[];
  subjectType: string;
  contactType: string;
}): Record<(typeof REVIEW_SECTIONS)[number]["key"], string> {
  const attachmentLabels = input.attachments.map((attachment) =>
    getWechatPayApplymentAttachmentCategoryLabel(attachment.category)
  );
  return {
    subject: [
      input.subjectType === "SUBJECT_TYPE_ENTERPRISE" ? "企业" : "个体工商户",
      input.applyment?.license_name || "营业执照信息待保存",
      input.applyment?.license_code || "信用代码待保存",
    ].join(" · "),
    contact: [
      input.applyment?.legal_representative_name || "法人信息待保存",
      input.contactType === "LEGAL" ? "法人本人" : "经办人",
      input.applyment?.super_admin_name || "管理员信息待保存",
    ].join(" · "),
    settlement: [
      input.applyment?.merchant_short_name || "商户简称待保存",
      input.applyment?.settlement_account_name || "结算账户待保存",
      input.applyment?.settlement_bank_name || "开户银行待保存",
    ].join(" · "),
    attachments: attachmentLabels.length > 0
      ? attachmentLabels.join("、")
      : "暂未上传申请附件",
  };
}
