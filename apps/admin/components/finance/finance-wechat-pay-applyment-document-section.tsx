"use client";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";

import {
  type ApplymentAttachmentController,
} from "./finance-wechat-pay-applyment-attachment-controller";
import {
  type ApplymentAttachmentSlotDefinition,
  WechatPayApplymentAttachmentSlot,
} from "./finance-wechat-pay-applyment-attachments";
import {
  type ApplymentOcrController,
  FinanceWechatPayApplymentInlineOcrReview,
} from "./finance-wechat-pay-applyment-ocr-review";
import type {
  WechatPayApplymentAttachmentCategory,
} from "./finance-wechat-pay-applyment-shared";

export type ApplymentDocumentSectionDefinition = {
  title: string;
  description: string;
  slots: readonly ApplymentAttachmentSlotDefinition[];
  reviewCategories: readonly WechatPayApplymentAttachmentCategory[];
};

export type FinanceWechatPayApplymentDocumentSectionProps =
  ApplymentDocumentSectionDefinition & {
    id?: string;
    attachmentController: ApplymentAttachmentController;
    ocrController: ApplymentOcrController;
  };

export const LEGAL_REPRESENTATIVE_ID_CARD_DOCUMENT_SECTION_CONFIG = {
  title: "法人身份证",
  description: "请分别上传法人身份证人像面和国徽面，并核对完整身份信息。",
  slots: [
    {
      category: "legal_representative_id_card_front",
      required: true,
      description: "法人身份证人像面。",
    },
    {
      category: "legal_representative_id_card_back",
      required: true,
      description: "法人身份证国徽面。",
    },
  ],
  reviewCategories: [
    "legal_representative_id_card_front",
    "legal_representative_id_card_back",
  ],
} as const satisfies ApplymentDocumentSectionDefinition;

export function FinanceWechatPayApplymentDocumentSection({
  id,
  title,
  description,
  slots,
  reviewCategories,
  attachmentController,
  ocrController,
}: FinanceWechatPayApplymentDocumentSectionProps) {
  const hasSectionError = Boolean(
    attachmentController.error &&
    attachmentController.errorCategory &&
    slots.some(
      (slot) => slot.category === attachmentController.errorCategory,
    ),
  );
  const slotGridClassName = slots.length === 2
    ? "grid gap-3 md:grid-cols-2"
    : "grid gap-3";

  return (
    <section id={id} className="flex min-w-0 flex-col gap-4">
      <header>
        <h2 className="text-sm font-semibold">{title}</h2>
        <p className="mt-1 text-xs text-muted-foreground">{description}</p>
      </header>

      {hasSectionError ? (
        <Alert variant="destructive">
          <AlertDescription>{attachmentController.error}</AlertDescription>
        </Alert>
      ) : null}

      <div className={slotGridClassName}>
        {slots.map((slot) => (
          <WechatPayApplymentAttachmentSlot
            key={slot.category}
            {...slot}
            controller={attachmentController}
          />
        ))}
      </div>

      <Separator />

      <div className="flex min-w-0 flex-col gap-5">
        {reviewCategories.map((category) => (
          <FinanceWechatPayApplymentInlineOcrReview
            key={category}
            category={category}
            {...ocrController}
            showPreview={false}
            showManualEntryAction={false}
          />
        ))}
      </div>
    </section>
  );
}
