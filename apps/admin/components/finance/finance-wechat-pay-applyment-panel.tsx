"use client";

import {
  type FormEvent,
  useEffect,
  useRef,
  useState,
  useTransition,
} from "react";
import { useRouter } from "next/navigation";

import { requestBackendJson } from "@/lib/backend-client";

import {
  isApplymentDraftSaveCancelledError,
  type ApplymentDraftSavePayload,
} from "./finance-wechat-pay-applyment-autosave";
import { submitApplymentAfterDraftFlush } from "./finance-wechat-pay-applyment-autosave-coordinator";
import { changeApplymentContactTypeWithRollback } from "./finance-wechat-pay-applyment-contact-type";
import { isApplymentDataBearingControl } from "./finance-wechat-pay-applyment-form-change";
import type { ApplymentMaterialState } from "./finance-wechat-pay-applyment-flow-model";
import type { ApplymentAttachmentChangeOptions } from "./finance-wechat-pay-applyment-manual-entry";
import { useWechatPayApplymentOcrReview } from "./finance-wechat-pay-applyment-ocr-review";
import type { ApplymentSaveGenerationContext } from "./finance-wechat-pay-applyment-save-generation";
import { FinanceWechatPayApplymentPanelStatus } from "./finance-wechat-pay-applyment-save-status";
import {
  buildWechatPayApplymentManualFieldOverride,
  buildWechatPayApplymentPartialDraftPayload,
} from "./finance-wechat-pay-applyment-schema";
import { FinanceWechatPayApplymentSignPrompt } from "./finance-wechat-pay-applyment-sign-prompt";
import {
  type WechatPayApplymentAttachment,
  type WechatPayApplymentAttachmentCategory,
  type WechatPayApplymentDetailData,
  type WechatPayApplymentDetailResult,
} from "./finance-wechat-pay-applyment-shared";
import {
  buildWechatPayApplymentSubjectTypeOverrides,
} from "./finance-wechat-pay-applyment-subject-type";
import { validateApplymentForm } from "./finance-wechat-pay-applyment-validation";
import { FinanceWechatPayApplymentWorkflow } from "./finance-wechat-pay-applyment-workflow";
import { useWechatPayApplymentAutosave } from "./use-wechat-pay-applyment-autosave";
import { useWechatPayApplymentMaterials } from "./use-wechat-pay-applyment-materials";

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
  const settlementRules = autosave.currentDetail.settlement_rules?.list ??
    data.settlement_rules?.list ?? [];
  const currentApplymentRef = autosave.currentApplymentRef;
  const editable = autosave.canEdit;
  const canSubmit = autosave.canSubmit;
  const [subjectType, setSubjectType] = useState(
    sourceApplyment?.subject_type || "SUBJECT_TYPE_ENTERPRISE",
  );
  const [contactType, setContactType] = useState(
    sourceApplyment?.contact_type || "LEGAL",
  );
  const [reviewConfirmed, setReviewConfirmed] = useState(false);
  const initialAttachments = sourceApplyment?.attachments || [];
  const [error, setError] = useState(data.error || "");
  const [pending, startTransition] = useTransition();
  const autoAppliedRecognitionKeysRef = useRef<Set<string>>(new Set());
  const materials = useWechatPayApplymentMaterials({
    initialAttachments,
    initialApplymentId: sourceApplyment?.id,
    resetKey,
    editable,
    persistAttachments: persistMaterialAttachments,
  });
  const {
    attachmentsRef,
    materialStates,
  } = materials;
  const ocrReview = useWechatPayApplymentOcrReview({
    applyment: sourceApplyment,
    formRef,
    attachmentsRef,
    materialStates,
    onAttachmentsChange: handleAttachmentsChange,
    onReviewInvalidated: invalidateReview,
    onError: setError,
  });
  const availableActions = autosave.currentDetail.available_actions ??
    data.available_actions ?? [];

  useEffect(() => {
    setSubjectType(
      sourceApplyment?.subject_type || "SUBJECT_TYPE_ENTERPRISE",
    );
    setContactType(sourceApplyment?.contact_type || "LEGAL");
    setReviewConfirmed(false);
    autoAppliedRecognitionKeysRef.current.clear();
  }, [resetKey, sourceApplyment]);

  useEffect(() => {
    autoApplyPendingRecognitionFields();
  });

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
        ...autosave.getDraftFallbackValues(),
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

  function autoApplyPendingRecognitionFields() {
    if (!editable || pending) return;
    for (const [category, state] of Object.entries(materialStates) as Array<
      [WechatPayApplymentAttachmentCategory, ApplymentMaterialState]
    >) {
      if (
        state.status !== "review_required" ||
        !state.attachmentObjectKey ||
        !state.recognitionId
      ) continue;
      const key = `${category}:${state.attachmentObjectKey}:${state.recognitionId}`;
      if (autoAppliedRecognitionKeysRef.current.has(key)) continue;
      autoAppliedRecognitionKeysRef.current.add(key);
      void ocrReview.confirmRecognitionFields(
        category,
        state.fields,
        contactType,
      ).then((outcome) => {
        if (outcome?.type !== "persisted") {
          autoAppliedRecognitionKeysRef.current.delete(key);
        }
      }).catch(() => {
        autoAppliedRecognitionKeysRef.current.delete(key);
      });
    }
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
  }

  function handleApplymentFormChange(event: FormEvent<HTMLFormElement>) {
    if (isApplymentDataBearingControl(event.target as HTMLInputElement)) {
      invalidateReview();
    }
  }

  function handleApplymentFormInput(event: FormEvent<HTMLFormElement>) {
    if (isApplymentDataBearingControl(event.target as HTMLInputElement)) {
      scheduleDraftSave();
    }
  }

  function handleSubjectTypeChange(value: string) {
    let overrides: ReturnType<typeof buildWechatPayApplymentSubjectTypeOverrides>;
    try {
      overrides = buildWechatPayApplymentSubjectTypeOverrides(
        value,
        settlementRules,
      );
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "当前主体缺少可用微信支付经营行业规则",
      );
      return;
    }
    setSubjectType(value);
    invalidateReview();
    scheduleDraftSave(overrides);
  }

  function handleManualFieldChange(key: string, value: string) {
    ocrReview.onManualChange(key, value);
    scheduleDraftSave(
      buildWechatPayApplymentManualFieldOverride(key, value),
    );
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
        return Boolean(form && validateApplymentForm(form));
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
    <form
      ref={formRef}
      className="mx-auto flex w-full max-w-5xl min-w-0 flex-col gap-4"
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
        materialsError={materials.error}
        editable={editable}
        canRetrySave={autosave.canRetrySave}
        onRetry={() => {
          void autosave.retryLastSave().catch(() => undefined);
        }}
      />
      <FinanceWechatPayApplymentSignPrompt
        applyment={applyment}
        availableActions={availableActions}
      />
      <FinanceWechatPayApplymentWorkflow
        applyment={applyment}
        settlementRules={settlementRules}
        subjectType={subjectType}
        contactType={contactType}
        reviewConfirmed={reviewConfirmed}
        submissionReadiness={autosave.currentDetail.submission_readiness}
        pending={pending}
        editable={editable}
        canSubmit={canSubmit}
        saving={autosave.saveState === "saving"}
        materials={materials}
        ocrReview={ocrReview}
        onSubjectTypeChange={handleSubjectTypeChange}
        onContactTypeChange={changeContactType}
        onAttachmentsChange={handleAttachmentsChange}
        onManualFieldChange={handleManualFieldChange}
        onSupplementDataChange={handleSupplementDataChange}
        onReviewConfirmedChange={setReviewConfirmed}
        onSubmitApplyment={submitApplyment}
      />
    </form>
  );
}
