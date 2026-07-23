"use client";

import type { OcrFieldReviewRow } from "@/components/ocr/ocr-field-review-dialog";

import {
  FinanceWechatPayApplymentActions,
  FinanceWechatPayApplymentFlow,
} from "./finance-wechat-pay-applyment-flow";
import type { ApplymentStageKey } from "./finance-wechat-pay-applyment-flow-model";
import { FinanceWechatPayApplymentMaterialsStage } from "./finance-wechat-pay-applyment-materials-stage";
import { FinanceWechatPayApplymentOcrReview } from "./finance-wechat-pay-applyment-ocr-review";
import { FinanceWechatPayApplymentReview } from "./finance-wechat-pay-applyment-review";
import type {
  WechatPayApplymentReviewSnapshot,
  WechatPayApplymentReviewTarget,
} from "./finance-wechat-pay-applyment-review-model";
import {
  formatWechatPayApplymentTime,
  type WechatPayApplymentAttachmentCategory,
  type WechatPayApplymentRecord,
} from "./finance-wechat-pay-applyment-shared";
import { FinanceWechatPayApplymentSupplementFields } from "./finance-wechat-pay-applyment-supplement-fields";
import type { useWechatPayApplymentMaterials } from "./use-wechat-pay-applyment-materials";
import type { useWechatPayApplymentOcrReview } from "./finance-wechat-pay-applyment-ocr-review-hook";
import type { useWechatPayApplymentStageNavigation } from "./use-wechat-pay-applyment-stage-navigation";

type MaterialsController = ReturnType<
  typeof useWechatPayApplymentMaterials
>;
type NavigationController = ReturnType<
  typeof useWechatPayApplymentStageNavigation
>;
type OcrReviewController = ReturnType<
  typeof useWechatPayApplymentOcrReview
>;

export function FinanceWechatPayApplymentWorkflow({
  applyment,
  subjectType,
  contactType,
  ocrReviewCategory,
  reviewConfirmed,
  reviewSnapshot,
  pending,
  editable,
  canSubmit,
  saving,
  materials,
  navigation,
  ocrReview,
  onStageChange,
  onNextStage,
  onSubjectTypeChange,
  onContactTypeChange,
  onAttachmentsChange,
  onApplyRecognition,
  onManualFieldChange,
  onOcrCategoryChange,
  onSupplementDataChange,
  onReviewConfirmedChange,
  onReviewNavigation,
  onSubmitApplyment,
}: {
  applyment: WechatPayApplymentRecord | null;
  subjectType: string;
  contactType: string;
  ocrReviewCategory: WechatPayApplymentAttachmentCategory;
  reviewConfirmed: boolean;
  reviewSnapshot: WechatPayApplymentReviewSnapshot;
  pending: boolean;
  editable: boolean;
  canSubmit: boolean;
  saving: boolean;
  materials: MaterialsController;
  navigation: NavigationController;
  ocrReview: OcrReviewController;
  onStageChange: (stage: ApplymentStageKey) => void;
  onNextStage: () => void;
  onSubjectTypeChange: (value: string) => void;
  onContactTypeChange: (value: string) => void;
  onAttachmentsChange: MaterialsController["onChange"];
  onApplyRecognition: (
    category: WechatPayApplymentAttachmentCategory,
    rows: readonly OcrFieldReviewRow[],
  ) => void | Promise<void>;
  onManualFieldChange: (key: string, value: string) => void;
  onOcrCategoryChange: (
    category: WechatPayApplymentAttachmentCategory,
  ) => void;
  onSupplementDataChange: (overrides: Record<string, string>) => void;
  onReviewConfirmedChange: (confirmed: boolean) => void;
  onReviewNavigation: (target: WechatPayApplymentReviewTarget) => void;
  onSubmitApplyment: () => void;
}) {
  const disabled = pending || materials.pending || !editable;
  const navigationDisabled = pending || materials.pending;
  return (
    <>
      <FinanceWechatPayApplymentFlow
        activeStage={navigation.activeStage}
        reachableStage={navigation.reachableStage}
        subjectType={subjectType}
        contactType={contactType}
        disabled={disabled}
        navigationDisabled={navigationDisabled}
        onStageChange={onStageChange}
        onNextStage={onNextStage}
        onSubjectTypeChange={onSubjectTypeChange}
        onContactTypeChange={onContactTypeChange}
        materialsContent={(
          <FinanceWechatPayApplymentMaterialsStage
            contactType={contactType}
            editable={editable}
            actionPending={pending}
            materials={materials}
            onAttachmentsChange={onAttachmentsChange}
          />
        )}
        recognitionContent={(
          <FinanceWechatPayApplymentOcrReview
            attachments={materials.attachments}
            materialStates={materials.materialStates}
            selectedCategory={ocrReviewCategory}
            contactType={contactType}
            subjectType={subjectType}
            values={ocrReview.currentValues}
            comparisonValues={ocrReview.comparisonValues}
            fieldSources={ocrReview.fieldSources}
            disabled={disabled}
            onManualChange={onManualFieldChange}
            onSelectedCategoryChange={onOcrCategoryChange}
            onApply={onApplyRecognition}
            onUseManualEntry={ocrReview.useManualEntry}
          />
        )}
        supplementContent={(
          <FinanceWechatPayApplymentSupplementFields
            applyment={applyment}
            subjectType={subjectType}
            contactType={contactType}
            disabled={disabled}
            navigationDisabled={navigationDisabled}
            onReturnToMaterials={() => onStageChange("materials")}
            onDataChange={onSupplementDataChange}
          />
        )}
        submitContent={(
          <FinanceWechatPayApplymentReview
            review={reviewSnapshot}
            attachments={materials.attachments}
            contactType={contactType}
            confirmed={reviewConfirmed}
            disabled={disabled}
            navigationDisabled={navigationDisabled}
            onConfirmedChange={onReviewConfirmedChange}
            onNavigate={onReviewNavigation}
          />
        )}
      />
      <FinanceWechatPayApplymentActions
        activeStage={navigation.activeStage}
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
    </>
  );
}
