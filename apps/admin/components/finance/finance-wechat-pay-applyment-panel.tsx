"use client";

import {
  type FormEvent,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useTransition,
} from "react";
import { useRouter } from "next/navigation";

import type { OcrFieldReviewRow } from "@/components/ocr/ocr-field-review-dialog";
import { requestBackendJson } from "@/lib/backend-client";

import {
  isApplymentDraftSaveCancelledError,
  type ApplymentDraftSavePayload,
} from "./finance-wechat-pay-applyment-autosave";
import { submitApplymentAfterDraftFlush } from "./finance-wechat-pay-applyment-autosave-coordinator";
import { changeApplymentContactTypeWithRollback } from "./finance-wechat-pay-applyment-contact-type";
import { FinanceWechatPayApplymentEvents } from "./finance-wechat-pay-applyment-events";
import { buildInitialMaterialStates } from "./finance-wechat-pay-applyment-flow-model";
import { isApplymentDataBearingControl } from "./finance-wechat-pay-applyment-form-change";
import type { ApplymentAttachmentChangeOptions } from "./finance-wechat-pay-applyment-manual-entry";
import { useWechatPayApplymentOcrReview } from "./finance-wechat-pay-applyment-ocr-review";
import {
  buildWechatPayApplymentStoredReview,
  buildWechatPayApplymentSubmissionData,
  type WechatPayApplymentReviewTarget,
} from "./finance-wechat-pay-applyment-review-model";
import type { ApplymentSaveGenerationContext } from "./finance-wechat-pay-applyment-save-generation";
import { FinanceWechatPayApplymentPanelStatus } from "./finance-wechat-pay-applyment-save-status";
import {
  buildWechatPayApplymentManualFieldOverride,
  buildWechatPayApplymentPartialDraftPayload,
} from "./finance-wechat-pay-applyment-schema";
import {
  type WechatPayApplymentAttachment,
  type WechatPayApplymentAttachmentCategory,
  type WechatPayApplymentDetailData,
  type WechatPayApplymentDetailResult,
} from "./finance-wechat-pay-applyment-shared";
import { getInitialApplymentStage } from "./finance-wechat-pay-applyment-stage-reachability";
import { FinanceWechatPayApplymentWorkflow } from "./finance-wechat-pay-applyment-workflow";
import { useWechatPayApplymentAutosave } from "./use-wechat-pay-applyment-autosave";
import { useWechatPayApplymentMaterials } from "./use-wechat-pay-applyment-materials";
import { useWechatPayApplymentStageNavigation } from "./use-wechat-pay-applyment-stage-navigation";
import { validateAllStages } from "./finance-wechat-pay-applyment-validation";

export function FinanceWechatPayApplymentPanel({
  data,
}: {
  data: WechatPayApplymentDetailResult;
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const sourceApplyment = data.applyment;
  const resetKey =
    `${sourceApplyment?.id ?? "new"}:${sourceApplyment?.updated_at ?? ""}`;
  const autosave = useWechatPayApplymentAutosave({
    detail: data,
    resetKey,
  });
  const applyment = autosave.currentApplyment;
  const currentApplymentRef = autosave.currentApplymentRef;
  const editable = autosave.canEdit;
  const canSubmit = autosave.canSubmit;
  const [ocrReviewCategory, setOcrReviewCategory] =
    useState<WechatPayApplymentAttachmentCategory>("license_copy");
  const [subjectType, setSubjectType] = useState(
    sourceApplyment?.subject_type || "SUBJECT_TYPE_ENTERPRISE",
  );
  const [contactType, setContactType] = useState(
    sourceApplyment?.contact_type || "LEGAL",
  );
  const [reviewConfirmed, setReviewConfirmed] = useState(false);
  const [reviewRevision, setReviewRevision] = useState(0);
  const [reviewSnapshot, setReviewSnapshot] = useState(() =>
    buildWechatPayApplymentStoredReview(
      sourceApplyment,
      sourceApplyment?.attachments || [],
    )
  );
  const initialAttachments = sourceApplyment?.attachments || [];
  const initialStage = getInitialApplymentStage({
    contactType,
    attachments: initialAttachments,
    materialStates: buildInitialMaterialStates(initialAttachments),
    blockerStages: [],
  });
  const [error, setError] = useState(data.error || "");
  const [pending, startTransition] = useTransition();
  const materials = useWechatPayApplymentMaterials({
    initialAttachments,
    initialApplymentId: sourceApplyment?.id,
    resetKey,
    editable,
    persistAttachments: persistMaterialAttachments,
  });
  const {
    attachments,
    attachmentsRef,
    materialStates,
  } = materials;
  const navigation = useWechatPayApplymentStageNavigation({
    formRef,
    resetKey,
    initialStage,
    contactType,
    attachments,
    materialStates,
    activateOcrCategory: setOcrReviewCategory,
  });
  const ocrReview = useWechatPayApplymentOcrReview({
    applyment: sourceApplyment,
    formRef,
    attachmentsRef,
    materialStates,
    onAttachmentsChange: handleAttachmentsChange,
    onReviewInvalidated: invalidateReview,
    onError: setError,
  });

  useLayoutEffect(() => {
    const form = formRef.current;
    if (form) {
      setReviewSnapshot(buildCurrentSubmission(form, attachments).review);
    }
  }, [
    applyment?.id,
    attachments,
    contactType,
    ocrReview.currentValues,
    reviewRevision,
    subjectType,
  ]);

  useEffect(() => {
    setSubjectType(
      sourceApplyment?.subject_type || "SUBJECT_TYPE_ENTERPRISE",
    );
    setContactType(sourceApplyment?.contact_type || "LEGAL");
    setReviewConfirmed(false);
  }, [resetKey, sourceApplyment]);

  function buildCurrentSubmission(
    form: HTMLFormElement,
    attachmentsOverride = attachmentsRef.current,
  ) {
    return buildWechatPayApplymentSubmissionData(new FormData(form), {
      applyment: currentApplymentRef.current,
      hasSensitivePayload: Boolean(
        currentApplymentRef.current?.has_sensitive_payload,
      ),
      attachments: attachmentsOverride,
    });
  }

  function buildCurrentDraftPayload(
    overrides: ApplymentDraftSavePayload = {},
    attachmentsOverride = attachmentsRef.current,
    contactTypeOverride?: string,
  ): ApplymentDraftSavePayload {
    const form = formRef.current;
    if (!form) throw new Error("申请表单尚未就绪，请稍后重试");
    const nextContactType = contactTypeOverride ??
      (typeof overrides.contact_type === "string"
        ? overrides.contact_type
        : contactType);
    const payload = buildWechatPayApplymentPartialDraftPayload(
      new FormData(form),
      {
        attachments: attachmentsOverride,
        contactType: nextContactType,
        subjectType,
        overrides,
      },
    );
    return payload;
  }

  function scheduleDraftSave(
    overrides: ApplymentDraftSavePayload = {},
  ): void {
    if (!editable || !formRef.current) return;
    autosave.scheduleDraftSave(buildCurrentDraftPayload(overrides));
  }

  async function enqueueMaterialCheckpoint(
    input: {
      attachments: WechatPayApplymentAttachment[];
      draftUpdateSource:
        | "manual_entry"
        | "attachment_change"
        | "ocr_review";
      contactType?: string;
    },
    context: ApplymentSaveGenerationContext,
  ) {
    if (!editable) throw new Error("当前账号无权修改微信支付开通申请");
    const payload = buildCurrentDraftPayload(
      {},
      input.attachments,
      input.contactType,
    );
    payload.draft_update_source = input.draftUpdateSource;
    if (input.attachments.some((attachment) => {
      const previous = currentApplymentRef.current?.attachments.find(
        (item) => item.object_key === attachment.object_key,
      );
      return previous?.ocr_review_status !== "confirmed" &&
        attachment.ocr_review_status === "confirmed";
    })) {
      payload.draft_update_source = "ocr_confirm";
    }
    if (!context.isCurrent()) return { applymentId: null };
    await autosave.enqueueMaterialCheckpoint(payload);
    return {
      applymentId: context.isCurrent()
        ? currentApplymentRef.current?.id
        : null,
    };
  }

  async function persistMaterialAttachments(
    input: Parameters<typeof enqueueMaterialCheckpoint>[0],
    context: ApplymentSaveGenerationContext,
  ) {
    return enqueueMaterialCheckpoint(input, context);
  }

  async function handleAttachmentsChange(
    nextAttachments: WechatPayApplymentAttachment[],
    options?: ApplymentAttachmentChangeOptions,
  ) {
    invalidateReview();
    await materials.onChange(nextAttachments, options);
  }

  function applyRecognitionRows(
    category: WechatPayApplymentAttachmentCategory,
    rows: readonly OcrFieldReviewRow[],
  ) {
    if (!rows.some((row) => row.selected)) return;
    return ocrReview.applyRecognitionRows(category, rows);
  }

  function changeContactType(value: string) {
    if (value === contactType) return;
    invalidateReview();
    if (value !== "LEGAL") {
      setContactType(value);
      scheduleDraftSave({ contact_type: value });
      return;
    }
    void changeApplymentContactTypeWithRollback({
      currentType: contactType,
      nextType: value,
      attachments: attachmentsRef.current,
      commitType: setContactType,
      changeAttachments: materials.onChange,
      reportError: setError,
    }).catch(() => undefined);
  }

  function invalidateReview() {
    setReviewConfirmed(false);
    setReviewRevision((revision) => revision + 1);
  }

  function handleApplymentFormChange(event: FormEvent<HTMLFormElement>) {
    navigation.handleFormChange(event);
    if (isApplymentDataBearingControl(event.target as HTMLInputElement)) {
      invalidateReview();
    }
  }

  function handleApplymentFormInput(event: FormEvent<HTMLFormElement>) {
    if (isApplymentDataBearingControl(event.target as HTMLInputElement)) {
      scheduleDraftSave();
    }
  }

  function handleStageChange(
    stage: Parameters<typeof navigation.requestStageChange>[0],
  ) {
    if (navigation.requestStageChange(stage)) scheduleDraftSave();
  }

  function handleNextStage() {
    if (navigation.handleNextStage()) scheduleDraftSave();
  }

  function handleReviewNavigation(target: WechatPayApplymentReviewTarget) {
    if (target.ocrCategory) setOcrReviewCategory(target.ocrCategory);
    handleStageChange(target.stage);
  }

  function handleSupplementDataChange(
    overrides: Record<string, string>,
  ) {
    invalidateReview();
    scheduleDraftSave(overrides);
  }

  function submitSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editable) return;
    setError("");
    void autosave.enqueueMaterialCheckpoint({
      ...buildCurrentDraftPayload(),
      draft_update_source: "manual_save",
    }).catch(() => undefined);
  }

  function submitApplyment() {
    if (!editable || !canSubmit) return;
    setError("");
    const submission = submitApplymentAfterDraftFlush({
      validate: () => {
        const form = formRef.current;
        return Boolean(
          form &&
          validateAllStages(
            form,
            navigation.activateStage,
            setOcrReviewCategory,
          ),
        );
      },
      buildPayload: () => buildCurrentDraftPayload(),
      save: autosave.enqueueMaterialCheckpoint,
      flush: autosave.flushDraftSaves,
      getCurrent: () => currentApplymentRef.current,
      submit: async (id, body) => {
        await requestBackendJson<WechatPayApplymentDetailData>(
          `/finance/wechat-pay/applyments/${id}/submit`,
          {
            method: "POST",
            body: JSON.stringify(body),
            fallbackMessage: "微信支付开通申请提交失败",
          },
        );
      },
    });
    if (submission === false) return;
    startTransition(async () => {
      try {
        const submitted = await submission;
        if (submitted) router.refresh();
      } catch (submitError) {
        if (isApplymentDraftSaveCancelledError(submitError)) return;
        setError(
          submitError instanceof Error
            ? submitError.message
            : "微信支付开通申请提交失败",
        );
      }
    });
  }

  return (
    <div className="grid min-h-0 gap-4 xl:grid-cols-[minmax(0,1fr)_20rem]">
      <form
        ref={formRef}
        className="flex min-w-0 flex-col gap-4"
        noValidate
        onChangeCapture={handleApplymentFormChange}
        onInputCapture={handleApplymentFormInput}
        onSubmit={submitSave}
      >
        <FinanceWechatPayApplymentPanelStatus
          applyment={applyment}
          saveState={autosave.saveState}
          saveError={autosave.saveError}
          error={error}
          stageError={navigation.stageError}
          materialsError={materials.error}
          editable={editable}
          canRetrySave={autosave.canRetrySave}
          onRetry={() => {
            void autosave.retryLastSave().catch(() => undefined);
          }}
        />
        <FinanceWechatPayApplymentWorkflow
          applyment={applyment}
          subjectType={subjectType}
          contactType={contactType}
          ocrReviewCategory={ocrReviewCategory}
          reviewConfirmed={reviewConfirmed}
          reviewSnapshot={reviewSnapshot}
          pending={pending}
          editable={editable}
          canSubmit={canSubmit}
          saving={autosave.saveState === "saving"}
          materials={materials}
          navigation={navigation}
          ocrReview={ocrReview}
          onStageChange={handleStageChange}
          onNextStage={handleNextStage}
          onSubjectTypeChange={(value) => {
            setSubjectType(value);
            invalidateReview();
            scheduleDraftSave({ subject_type: value });
          }}
          onContactTypeChange={changeContactType}
          onAttachmentsChange={handleAttachmentsChange}
          onApplyRecognition={applyRecognitionRows}
          onManualFieldChange={(key, value) => {
            ocrReview.onManualChange(key, value);
            scheduleDraftSave(
              buildWechatPayApplymentManualFieldOverride(key, value),
            );
          }}
          onOcrCategoryChange={setOcrReviewCategory}
          onSupplementDataChange={handleSupplementDataChange}
          onReviewConfirmedChange={setReviewConfirmed}
          onReviewNavigation={handleReviewNavigation}
          onSubmitApplyment={submitApplyment}
        />
      </form>

      <FinanceWechatPayApplymentEvents events={data.events} />
    </div>
  );
}
