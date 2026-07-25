"use client";

import { Alert, AlertDescription } from "@/components/ui/alert";

import {
  type ApplymentAttachmentController,
} from "./finance-wechat-pay-applyment-attachment-controller";
import type {
  ApplymentFieldSource,
} from "./finance-wechat-pay-applyment-form-fields";
import {
  type ApplymentAttachmentSlotDefinition,
  WechatPayApplymentAttachmentSlot,
} from "./finance-wechat-pay-applyment-attachments";
import type {
  ApplymentTargetId,
} from "./finance-wechat-pay-applyment-readiness";
import {
  FinanceWechatPayApplymentRecognizedFields,
} from "./finance-wechat-pay-applyment-recognized-fields";
import type {
  WechatPayApplymentAttachmentCategory,
} from "./finance-wechat-pay-applyment-shared";

export type ApplymentDocumentSectionDefinition = {
  title: string;
  slots: readonly ApplymentAttachmentSlotDefinition[];
  fieldCategories: readonly WechatPayApplymentAttachmentCategory[];
};

export type ApplymentRecognizedFieldController = {
  contactType: string;
  subjectType: string;
  values: Readonly<Record<string, string>>;
  fieldSources: Readonly<Record<string, ApplymentFieldSource>>;
  disabled?: boolean;
  onManualChange: (key: string, value: string) => void;
};

export type FinanceWechatPayApplymentDocumentSectionProps =
  ApplymentDocumentSectionDefinition & {
    id?: ApplymentTargetId;
    headingLevel?: "h2" | "h3";
    attachmentController: ApplymentAttachmentController;
    fieldController: ApplymentRecognizedFieldController;
  };

export const LEGAL_REPRESENTATIVE_ID_CARD_DOCUMENT_SECTION_CONFIG = {
  title: "法人身份证",
  slots: [
    {
      category: "legal_representative_id_card_front",
      required: true,
    },
    {
      category: "legal_representative_id_card_back",
      required: true,
    },
  ],
  fieldCategories: [
    "legal_representative_id_card_front",
    "legal_representative_id_card_back",
  ],
} as const satisfies ApplymentDocumentSectionDefinition;

export function FinanceWechatPayApplymentDocumentSection({
  id,
  headingLevel = "h2",
  title,
  slots,
  fieldCategories,
  attachmentController,
  fieldController,
}: FinanceWechatPayApplymentDocumentSectionProps) {
  const Heading = headingLevel;
  const headingId = id ? `${id}-heading` : `wechat-pay-applyment-${title}`;
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
    <section
      id={id}
      tabIndex={-1}
      aria-labelledby={headingId}
      className="flex min-w-0 flex-col gap-4"
    >
      <header className="flex items-center justify-between gap-3">
        <Heading id={headingId} className="text-sm font-semibold">
          {title}
        </Heading>
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

      <div className="flex min-w-0 flex-col gap-4">
        {fieldCategories.map((category) => (
          <FinanceWechatPayApplymentRecognizedFields
            key={category}
            category={category}
            labelledBy={headingId}
            {...fieldController}
          />
        ))}
      </div>
    </section>
  );
}
