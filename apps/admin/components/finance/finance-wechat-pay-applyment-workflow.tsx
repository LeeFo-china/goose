"use client";

import { presentApplymentBlockers } from "./finance-wechat-pay-applyment-readiness";
import type {
  WechatPayApplymentSubmissionReadiness,
} from "./finance-wechat-pay-applyment-shared";
import {
  FinanceWechatPayApplymentSinglePage,
  type FinanceWechatPayApplymentSinglePageProps,
} from "./finance-wechat-pay-applyment-single-page";

type WorkflowProps = Omit<
  FinanceWechatPayApplymentSinglePageProps,
  "readinessBlockers"
> & {
  submissionReadiness?: WechatPayApplymentSubmissionReadiness | null;
};

export function FinanceWechatPayApplymentWorkflow({
  applyment,
  subjectType,
  contactType,
  reviewConfirmed,
  submissionReadiness,
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
}: WorkflowProps) {
  const readinessBlockers = presentApplymentBlockers(
    submissionReadiness?.blockers ?? [],
  );
  return (
    <FinanceWechatPayApplymentSinglePage
      applyment={applyment}
      subjectType={subjectType}
      contactType={contactType}
      reviewConfirmed={reviewConfirmed}
      readinessBlockers={readinessBlockers}
      pending={pending}
      editable={editable}
      canSubmit={canSubmit}
      saving={saving}
      materials={materials}
      ocrReview={ocrReview}
      onSubjectTypeChange={onSubjectTypeChange}
      onContactTypeChange={onContactTypeChange}
      onAttachmentsChange={onAttachmentsChange}
      onApplyRecognition={onApplyRecognition}
      onManualFieldChange={onManualFieldChange}
      onSupplementDataChange={onSupplementDataChange}
      onReviewConfirmedChange={onReviewConfirmedChange}
      onSubmitApplyment={onSubmitApplyment}
    />
  );
}
