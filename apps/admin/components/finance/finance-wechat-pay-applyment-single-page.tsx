"use client";

import { CircleAlert } from "lucide-react";

import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert";
import { FieldGroup } from "@/components/ui/field";
import { Separator } from "@/components/ui/separator";

import { FinanceWechatPayApplymentActions } from "./finance-wechat-pay-applyment-actions";
import {
  useWechatPayApplymentAttachmentController,
  WechatPayApplymentBusinessMaterials,
} from "./finance-wechat-pay-applyment-attachments";
import {
  FinanceWechatPayApplymentDocumentSection,
  LEGAL_REPRESENTATIVE_ID_CARD_DOCUMENT_SECTION_CONFIG,
  type ApplymentDocumentSectionDefinition,
} from "./finance-wechat-pay-applyment-document-section";
import { SelectField } from "./finance-wechat-pay-applyment-form-fields";
import {
  APPLYMENT_TARGET_IDS,
  type WechatPayApplymentReadinessItem,
} from "./finance-wechat-pay-applyment-readiness";
import { FinanceWechatPayApplymentReview } from "./finance-wechat-pay-applyment-review";
import {
  formatWechatPayApplymentTime,
  type WechatPayApplymentRecord,
} from "./finance-wechat-pay-applyment-shared";
import {
  FinanceWechatPayApplymentBusinessFields,
  FinanceWechatPayApplymentContactFields,
  FinanceWechatPayApplymentSettlementFields,
} from "./finance-wechat-pay-applyment-supplement-fields";
import type { useWechatPayApplymentOcrReview } from "./finance-wechat-pay-applyment-ocr-review-hook";
import type { useWechatPayApplymentMaterials } from "./use-wechat-pay-applyment-materials";

const SUBJECT_TYPE_OPTIONS = [
  { value: "SUBJECT_TYPE_ENTERPRISE", label: "企业" },
  { value: "SUBJECT_TYPE_INDIVIDUAL", label: "个体工商户" },
];

const CONTACT_TYPE_OPTIONS = [
  { value: "LEGAL", label: "法人本人" },
  { value: "SUPER", label: "经办人" },
];

const LICENSE_DOCUMENT_SECTION_CONFIG = {
  title: "营业执照",
  slots: [{
    category: "license_copy",
    required: true,
  }],
  fieldCategories: ["license_copy"],
} as const satisfies ApplymentDocumentSectionDefinition;

const CONTACT_ID_CARD_DOCUMENT_SECTION_CONFIG = {
  title: "经办人身份证",
  slots: [
    {
      category: "contact_id_card_front",
      required: true,
    },
    {
      category: "contact_id_card_back",
      required: true,
    },
  ],
  fieldCategories: ["contact_id_card_front", "contact_id_card_back"],
} as const satisfies ApplymentDocumentSectionDefinition;

const SETTLEMENT_DOCUMENT_SECTION_CONFIG = {
  title: "结算账户证明",
  slots: [{
    category: "settlement_account_proof",
    required: false,
  }],
  fieldCategories: ["settlement_account_proof"],
} as const satisfies ApplymentDocumentSectionDefinition;

type MaterialsController = ReturnType<typeof useWechatPayApplymentMaterials>;
type SinglePageMaterials = Pick<
  MaterialsController,
  | "attachments"
  | "materialStates"
  | "attachmentSaveErrors"
  | "supportedOcrDocumentTypes"
  | "capabilitiesUnavailable"
  | "pending"
  | "onUploaded"
  | "onRetrySave"
  | "onRetryRecognition"
>;
type SinglePageOcrReview = Pick<
  ReturnType<typeof useWechatPayApplymentOcrReview>,
  | "currentValues"
  | "fieldSources"
>;

export type FinanceWechatPayApplymentSinglePageProps = {
  applyment: WechatPayApplymentRecord | null;
  subjectType: string;
  contactType: string;
  reviewConfirmed: boolean;
  readinessBlockers: readonly WechatPayApplymentReadinessItem[];
  pending: boolean;
  editable: boolean;
  canSubmit: boolean;
  saving: boolean;
  materials: SinglePageMaterials;
  ocrReview: SinglePageOcrReview;
  onSubjectTypeChange: (value: string) => void;
  onContactTypeChange: (value: string) => void;
  onAttachmentsChange: MaterialsController["onChange"];
  onManualFieldChange: (key: string, value: string) => void;
  onSupplementDataChange: (overrides: Record<string, string>) => void;
  onReviewConfirmedChange: (confirmed: boolean) => void;
  onSubmitApplyment: () => void;
};

export function FinanceWechatPayApplymentSinglePage({
  applyment,
  subjectType,
  contactType,
  reviewConfirmed,
  readinessBlockers,
  pending,
  editable,
  canSubmit,
  saving,
  materials,
  ocrReview,
  onSubjectTypeChange,
  onContactTypeChange,
  onAttachmentsChange,
  onManualFieldChange,
  onSupplementDataChange,
  onReviewConfirmedChange,
  onSubmitApplyment,
}: FinanceWechatPayApplymentSinglePageProps) {
  const disabled = pending || materials.pending || !editable;
  const attachmentController = useWechatPayApplymentAttachmentController({
    attachments: materials.attachments,
    editable,
    disabled: pending || materials.pending,
    materialStates: materials.materialStates,
    attachmentSaveErrors: materials.attachmentSaveErrors,
    supportedOcrDocumentTypes: materials.supportedOcrDocumentTypes,
    onUploaded: materials.onUploaded,
    onRetrySave: materials.onRetrySave,
    onRetryRecognition: materials.onRetryRecognition,
    onChange: onAttachmentsChange,
  });
  const fieldController = {
    contactType,
    subjectType,
    values: ocrReview.currentValues,
    fieldSources: ocrReview.fieldSources,
    disabled,
    onManualChange: onManualFieldChange,
  };

  return (
    <div className="mx-auto flex w-full max-w-5xl min-w-0 flex-col gap-6">
      <section tabIndex={-1} className="flex min-w-0 flex-col gap-4">
        <SectionHeading title="申请身份" />
        <FieldGroup className="grid gap-4 md:grid-cols-2">
          <SelectField
            label="主体类型"
            name="subject_type"
            defaultValue={subjectType}
            options={SUBJECT_TYPE_OPTIONS}
            requirement="required"
            disabled={disabled}
            onValueChange={onSubjectTypeChange}
          />
          <SelectField
            label="超级管理员身份"
            name="contact_type"
            defaultValue={contactType}
            options={CONTACT_TYPE_OPTIONS}
            requirement="required"
            disabled={disabled}
            onValueChange={onContactTypeChange}
          />
        </FieldGroup>
      </section>

      {materials.capabilitiesUnavailable ? (
        <div className="flex flex-col gap-3">
          <Alert>
            <CircleAlert />
            <AlertTitle>证照识别暂不可用</AlertTitle>
            <AlertDescription>
              已上传资料仍会保存，可在对应资料区手动填写。
            </AlertDescription>
          </Alert>
        </div>
      ) : null}

      <Separator />

      <FinanceWechatPayApplymentDocumentSection
        {...LICENSE_DOCUMENT_SECTION_CONFIG}
        id={APPLYMENT_TARGET_IDS.licenseMaterials}
        attachmentController={attachmentController}
        fieldController={fieldController}
      />

      <Separator />

      <FinanceWechatPayApplymentDocumentSection
        {...LEGAL_REPRESENTATIVE_ID_CARD_DOCUMENT_SECTION_CONFIG}
        title="法人身份证"
        id={APPLYMENT_TARGET_IDS.legalIdMaterials}
        attachmentController={attachmentController}
        fieldController={fieldController}
      />

      {contactType === "SUPER" ? (
        <>
          <Separator />
          <FinanceWechatPayApplymentDocumentSection
            {...CONTACT_ID_CARD_DOCUMENT_SECTION_CONFIG}
            id={APPLYMENT_TARGET_IDS.contactIdMaterials}
            attachmentController={attachmentController}
            fieldController={fieldController}
          />
        </>
      ) : null}

      <Separator />

      <section tabIndex={-1} className="flex min-w-0 flex-col gap-4">
        <SectionHeading title="联系信息" />
        <FinanceWechatPayApplymentContactFields
          applyment={applyment}
          disabled={disabled}
        />
      </section>

      <Separator />

      <section
        tabIndex={-1}
        className="flex min-w-0 flex-col gap-5"
      >
        <SectionHeading
          title="结算账户"
        />
        <FinanceWechatPayApplymentDocumentSection
          {...SETTLEMENT_DOCUMENT_SECTION_CONFIG}
          id={APPLYMENT_TARGET_IDS.settlementMaterials}
          headingLevel="h3"
          attachmentController={attachmentController}
          fieldController={fieldController}
        />
        <FinanceWechatPayApplymentSettlementFields
          applyment={applyment}
          subjectType={subjectType}
          disabled={disabled}
          onDataChange={onSupplementDataChange}
        />
      </section>

      <Separator />

      <section
        tabIndex={-1}
        className="flex min-w-0 flex-col gap-4"
      >
        <SectionHeading title="经营资料" />
        <FinanceWechatPayApplymentBusinessFields
          applyment={applyment}
          disabled={disabled}
        />
        <WechatPayApplymentBusinessMaterials
          id={APPLYMENT_TARGET_IDS.businessMaterials}
          controller={attachmentController}
        />
      </section>

      <Separator />

      <section tabIndex={-1} className="flex min-w-0 flex-col gap-4">
        <SectionHeading title="提交确认" />
        <FinanceWechatPayApplymentReview
          attachments={materials.attachments}
          contactType={contactType}
          confirmed={reviewConfirmed}
          disabled={disabled}
          readinessBlockers={readinessBlockers}
          onConfirmedChange={onReviewConfirmedChange}
        />
        <FinanceWechatPayApplymentActions
          updatedAtLabel={formatWechatPayApplymentTime(applyment?.updated_at)}
          pending={pending}
          saving={saving}
          materialsPending={materials.pending}
          hasApplyment={Boolean(applyment)}
          editable={editable}
          canSubmit={canSubmit}
          reviewConfirmed={reviewConfirmed}
          onSubmitApplyment={onSubmitApplyment}
        />
      </section>
    </div>
  );
}

function SectionHeading({
  title,
}: {
  title: string;
}) {
  return (
    <header>
      <h2 className="text-sm font-semibold">{title}</h2>
    </header>
  );
}
