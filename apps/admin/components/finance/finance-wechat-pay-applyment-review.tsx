"use client";

import { ChevronRight, CircleAlert, PencilLine } from "lucide-react";

import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Separator } from "@/components/ui/separator";

import type { ApplymentStageKey } from "./finance-wechat-pay-applyment-flow-model";
import type {
  WechatPayApplymentReadinessItem,
} from "./finance-wechat-pay-applyment-readiness";
import {
  type WechatPayApplymentAttachment,
} from "./finance-wechat-pay-applyment-shared";
import {
  getWechatPayApplymentReviewTargets,
  type WechatPayApplymentReviewSnapshot,
  type WechatPayApplymentReviewTarget,
} from "./finance-wechat-pay-applyment-review-model";

const BASE_REQUIRED_ATTACHMENTS = [
  "license_copy",
  "legal_representative_id_card_front",
  "legal_representative_id_card_back",
];

const REVIEW_SECTIONS = [
  { key: "subject", label: "主体和营业执照" },
  { key: "contact", label: "法人和超级管理员" },
  { key: "settlement", label: "经营及结算" },
  { key: "attachments", label: "申请附件" },
] as const;

export function FinanceWechatPayApplymentReview({
  review,
  attachments,
  contactType,
  confirmed,
  disabled,
  navigationDisabled,
  readinessBlockers,
  onConfirmedChange,
  onNavigate,
  onStageChange,
}: {
  review: WechatPayApplymentReviewSnapshot;
  attachments: WechatPayApplymentAttachment[];
  contactType: string;
  confirmed: boolean;
  disabled: boolean;
  navigationDisabled: boolean;
  readinessBlockers: readonly WechatPayApplymentReadinessItem[];
  onConfirmedChange: (checked: boolean) => void;
  onNavigate: (target: WechatPayApplymentReviewTarget) => void;
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
  const targets = getWechatPayApplymentReviewTargets(contactType);

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

      {readinessBlockers.length > 0
        ? (
          <Alert className="border-warning/50 bg-warning/5">
            <CircleAlert />
            <AlertTitle>
              还有 {readinessBlockers.length} 项需要处理
            </AlertTitle>
            <AlertDescription className="grid gap-1">
              {readinessBlockers.map((blocker) => (
                <Button
                  key={blocker.key}
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-auto w-full justify-between whitespace-normal px-2 py-2 text-left font-normal"
                  disabled={navigationDisabled}
                  data-readiness-blocker=""
                  onClick={() => onStageChange(blocker.targetStage)}
                >
                  <span className="min-w-0 break-words">{blocker.label}</span>
                  <ChevronRight aria-hidden="true" />
                </Button>
              ))}
            </AlertDescription>
          </Alert>
        )
        : null}

      <div className="divide-y rounded-md border">
        {REVIEW_SECTIONS.map((section) => (
          <section
            key={section.key}
            className="flex flex-wrap items-start justify-between gap-3 p-3"
          >
            <div className="min-w-0">
              <h3 className="text-sm font-medium">{section.label}</h3>
              <p className="mt-1 break-words text-xs text-muted-foreground">
                {review[section.key]}
              </p>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={navigationDisabled}
              onClick={() => onNavigate(targets[section.key])}
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
