"use client";

import { CircleAlert } from "lucide-react";

import type { OcrFieldReviewRow } from "@/components/ocr/ocr-field-review-dialog";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert";
import { Checkbox } from "@/components/ui/checkbox";
import { FieldGroup, FieldLabel } from "@/components/ui/field";
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
  type WechatPayApplymentAttachmentCategory,
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
  description: "上传营业执照并核对主体、信用代码和法人信息。",
  slots: [{
    category: "license_copy",
    required: true,
    description: "营业执照清晰照片或扫描件。",
  }],
  reviewCategories: ["license_copy"],
} as const satisfies ApplymentDocumentSectionDefinition;

const CONTACT_ID_CARD_DOCUMENT_SECTION_CONFIG = {
  title: "经办人身份证",
  description: "请分别上传经办人身份证人像面和国徽面，并核对身份信息。",
  slots: [
    {
      category: "contact_id_card_front",
      required: true,
      description: "经办人身份证人像面。",
    },
    {
      category: "contact_id_card_back",
      required: true,
      description: "经办人身份证国徽面。",
    },
  ],
  reviewCategories: ["contact_id_card_front", "contact_id_card_back"],
} as const satisfies ApplymentDocumentSectionDefinition;

const SETTLEMENT_DOCUMENT_SECTION_CONFIG = {
  title: "结算账户证明",
  description: "可上传开户许可证、银行卡或银行账户证明，并核对识别信息。",
  slots: [{
    category: "settlement_account_proof",
    required: false,
    description: "开户许可证、银行卡或银行账户证明。",
  }],
  reviewCategories: ["settlement_account_proof"],
} as const satisfies ApplymentDocumentSectionDefinition;

type MaterialsController = ReturnType<typeof useWechatPayApplymentMaterials>;
type SinglePageMaterials = Pick<
  MaterialsController,
  | "attachments"
  | "materialStates"
  | "attachmentSaveErrors"
  | "supportedOcrDocumentTypes"
  | "recognitionConsent"
  | "capabilitiesUnavailable"
  | "pending"
  | "setRecognitionConsent"
  | "onUploaded"
  | "onRetrySave"
  | "onRetryRecognition"
>;
type SinglePageOcrReview = Pick<
  ReturnType<typeof useWechatPayApplymentOcrReview>,
  | "currentValues"
  | "comparisonValues"
  | "fieldSources"
  | "useManualEntry"
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
  onApplyRecognition: (
    category: WechatPayApplymentAttachmentCategory,
    rows: readonly OcrFieldReviewRow[],
  ) => void | Promise<void>;
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
  onApplyRecognition,
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
  const ocrController = {
    attachments: materials.attachments,
    materialStates: materials.materialStates,
    contactType,
    subjectType,
    values: ocrReview.currentValues,
    comparisonValues: ocrReview.comparisonValues,
    fieldSources: ocrReview.fieldSources,
    disabled,
    onManualChange: onManualFieldChange,
    onApply: onApplyRecognition,
    onUseManualEntry: ocrReview.useManualEntry,
  };

  return (
    <div className="mx-auto flex w-full max-w-5xl min-w-0 flex-col gap-6">
      <section tabIndex={-1} className="flex min-w-0 flex-col gap-4">
        <SectionHeading
          title="申请身份"
          description="主体和超级管理员身份决定证照与结算资料要求。"
        />
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

      <div className="flex flex-col gap-3">
        <div className="flex items-start gap-3 rounded-md border p-3">
          <Checkbox
            id="wechat-pay-applyment-ocr-consent"
            checked={materials.recognitionConsent}
            disabled={pending || !editable}
            onCheckedChange={(checked) => {
              materials.setRecognitionConsent(checked === true);
            }}
          />
          <FieldLabel
            htmlFor="wechat-pay-applyment-ocr-consent"
            className="leading-5"
          >
            同意使用已上传证照进行信息识别和申请资料回填
          </FieldLabel>
        </div>
        {materials.capabilitiesUnavailable ? (
          <Alert>
            <CircleAlert />
            <AlertTitle>证照识别暂不可用</AlertTitle>
            <AlertDescription>
              已上传资料仍会保存，可在对应资料区手动填写。
            </AlertDescription>
          </Alert>
        ) : null}
      </div>

      <Separator />

      <FinanceWechatPayApplymentDocumentSection
        {...LICENSE_DOCUMENT_SECTION_CONFIG}
        id={APPLYMENT_TARGET_IDS.licenseMaterials}
        attachmentController={attachmentController}
        ocrController={ocrController}
      />

      <Separator />

      <FinanceWechatPayApplymentDocumentSection
        {...LEGAL_REPRESENTATIVE_ID_CARD_DOCUMENT_SECTION_CONFIG}
        title="法人身份证"
        id={APPLYMENT_TARGET_IDS.legalIdMaterials}
        attachmentController={attachmentController}
        ocrController={ocrController}
      />

      {contactType === "SUPER" ? (
        <>
          <Separator />
          <FinanceWechatPayApplymentDocumentSection
            {...CONTACT_ID_CARD_DOCUMENT_SECTION_CONFIG}
            id={APPLYMENT_TARGET_IDS.contactIdMaterials}
            attachmentController={attachmentController}
            ocrController={ocrController}
          />
        </>
      ) : null}

      <Separator />

      <section tabIndex={-1} className="flex min-w-0 flex-col gap-4">
        <SectionHeading
          title="联系信息"
          description="填写商户、超级管理员和客服电话。"
        />
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
          description="先核对结算证明，再补充账户和结算规则。"
        />
        <FinanceWechatPayApplymentDocumentSection
          {...SETTLEMENT_DOCUMENT_SECTION_CONFIG}
          id={APPLYMENT_TARGET_IDS.settlementMaterials}
          headingLevel="h3"
          attachmentController={attachmentController}
          ocrController={ocrController}
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
        <SectionHeading
          title="经营资料"
          description="补充经营场景、联系地址和辅助图片。"
        />
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
        <SectionHeading
          title="提交确认"
          description="处理缺失项并确认资料真实有效后提交平台审核。"
        />
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
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <header>
      <h2 className="text-sm font-semibold">{title}</h2>
      <p className="mt-1 text-xs text-muted-foreground">{description}</p>
    </header>
  );
}
