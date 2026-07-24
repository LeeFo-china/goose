"use client";

import { ChevronRight, CircleAlert } from "lucide-react";

import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";

import {
  focusApplymentReadinessTarget,
  type WechatPayApplymentReadinessItem,
} from "./finance-wechat-pay-applyment-readiness";
import {
  type WechatPayApplymentAttachment,
} from "./finance-wechat-pay-applyment-shared";

const BASE_REQUIRED_ATTACHMENTS = [
  "license_copy",
  "legal_representative_id_card_front",
  "legal_representative_id_card_back",
];

export type ReviewProps = {
  attachments: WechatPayApplymentAttachment[];
  contactType: string;
  confirmed: boolean;
  disabled: boolean;
  readinessBlockers: readonly WechatPayApplymentReadinessItem[];
  onConfirmedChange: (checked: boolean) => void;
};

export function FinanceWechatPayApplymentReview({
  attachments,
  contactType,
  confirmed,
  disabled,
  readinessBlockers,
  onConfirmedChange,
}: ReviewProps) {
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

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        <Badge variant={attachmentsReady ? "success" : "warning"}>
          必传附件 {readyAttachmentCount}/{requiredCategories.length}
        </Badge>
      </div>

      {readinessBlockers.length > 0
        ? (
          <Alert className="border-warning/50 bg-warning/5">
            <CircleAlert />
            <AlertTitle>
              还有 {readinessBlockers.length} 项需要处理
            </AlertTitle>
            <AlertDescription className="flex flex-col gap-1">
              {readinessBlockers.map((blocker) => (
                <ReadinessBlocker key={blocker.key} blocker={blocker} />
              ))}
            </AlertDescription>
          </Alert>
        )
        : null}

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
    </div>
  );
}

function ReadinessBlocker({
  blocker,
}: {
  blocker: WechatPayApplymentReadinessItem;
}) {
  if (!blocker.targetId) {
    return (
      <p
        className="px-2 py-2 text-foreground"
        data-readiness-blocker=""
      >
        {blocker.label}
      </p>
    );
  }
  const targetId = blocker.targetId;
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className="h-auto w-full justify-between whitespace-normal px-2 py-2 text-left font-normal"
      data-readiness-blocker=""
      onClick={() => focusApplymentReadinessTarget(targetId)}
    >
      <span className="min-w-0 break-words">{blocker.label}</span>
      <ChevronRight aria-hidden="true" />
    </Button>
  );
}
