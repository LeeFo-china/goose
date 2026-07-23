"use client";

import {
  type FormEvent,
  useEffect,
  useRef,
  useState,
  useTransition,
} from "react";
import { useRouter } from "next/navigation";
import { CircleAlert, Loader2, Save, SendHorizontal } from "lucide-react";
import { StatusAlert } from "@/components/admin/status-alert";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { FieldLabel } from "@/components/ui/field";
import { Progress } from "@/components/ui/progress";
import { requestBackendJson } from "@/lib/backend-client";
import type { OcrFieldReviewRow } from "@/components/ocr/ocr-field-review-dialog";
import { WechatPayApplymentAttachmentsField } from "./finance-wechat-pay-applyment-attachments";
import { changeApplymentContactTypeWithRollback } from "./finance-wechat-pay-applyment-contact-type";
import type { ApplymentAttachmentChangeOptions } from "./finance-wechat-pay-applyment-manual-entry";
import {
  FinanceWechatPayApplymentOcrReview,
  useWechatPayApplymentOcrReview,
} from "./finance-wechat-pay-applyment-ocr-review";
import { FinanceWechatPayApplymentReview } from "./finance-wechat-pay-applyment-review";
import {
  runGenerationGuardedSave,
  type ApplymentSaveGenerationContext,
} from "./finance-wechat-pay-applyment-save-generation";
import { buildWechatPayApplymentPayload } from "./finance-wechat-pay-applyment-schema";
import {
  APPLYMENT_STEP_KEYS,
  FinanceWechatPayApplymentSteps,
  type ApplymentStepKey,
} from "./finance-wechat-pay-applyment-steps";
import {
  formatWechatPayApplymentTime,
  getWechatPayApplymentStatusMeta,
  type WechatPayApplymentAttachment,
  type WechatPayApplymentAttachmentCategory,
  type WechatPayApplymentDetailData,
  type WechatPayApplymentDetailResult,
  type WechatPayApplymentRecord,
} from "./finance-wechat-pay-applyment-shared";
import {
  useWechatPayApplymentMaterials,
} from "./use-wechat-pay-applyment-materials";

export function FinanceWechatPayApplymentPanel({
  data,
}: {
  data: WechatPayApplymentDetailResult;
}) {
  const router = useRouter();
  const applyment = data.applyment;
  const formRef = useRef<HTMLFormElement>(null);
  const applymentRef = useRef<WechatPayApplymentRecord | null>(applyment);
  const [activeStep, setActiveStep] = useState<ApplymentStepKey>("subject");
  const [subjectType, setSubjectType] = useState(
    applyment?.subject_type || "SUBJECT_TYPE_ENTERPRISE",
  );
  const [contactType, setContactType] = useState(applyment?.contact_type || "LEGAL");
  const [reviewConfirmed, setReviewConfirmed] = useState(false);
  const [error, setError] = useState(data.error || "");
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();
  const statusMeta = getWechatPayApplymentStatusMeta(applyment?.status);
  const editable = data.can_edit;
  const materials = useWechatPayApplymentMaterials({
    initialAttachments: applyment?.attachments || [],
    initialApplymentId: applyment?.id,
    resetKey: `${applyment?.id ?? "new"}:${applyment?.updated_at ?? ""}`,
    editable,
    persistAttachments: persistMaterialAttachments,
  });
  const {
    attachments,
    attachmentsRef,
    materialStates,
    attachmentSaveErrors,
    supportedOcrDocumentTypes,
  } = materials;
  const ocrReview = useWechatPayApplymentOcrReview({
    applyment,
    formRef,
    attachmentsRef,
    materialStates,
    onAttachmentsChange: handleAttachmentsChange,
    onReviewInvalidated: () => setReviewConfirmed(false),
    onError: setError,
  });
  const stepIndex = APPLYMENT_STEP_KEYS.indexOf(activeStep);
  const progress = ((stepIndex + 1) / APPLYMENT_STEP_KEYS.length) * 100;

  useEffect(() => {
    applymentRef.current = applyment;
    setSubjectType(applyment?.subject_type || "SUBJECT_TYPE_ENTERPRISE");
    setContactType(applyment?.contact_type || "LEGAL");
    setReviewConfirmed(false);
  }, [applyment?.id, applyment?.updated_at]);

  function submitSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editable) return;
    saveDraft(buildCurrentApplymentPayload(event.currentTarget));
  }

  function saveDraft(payload: Record<string, unknown>) {
    setError("");
    setSaved(false);
    startTransition(async () => {
      try {
        await saveApplymentDraft(payload);
        setSaved(true);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "微信支付开通申请保存失败");
      }
    });
  }

  function submitApplyment() {
    const currentApplyment = applymentRef.current;
    if (!currentApplyment || !editable || !data.can_submit) return;
    const formElement = formRef.current;
    if (!formElement || !validateVisibleStep(formElement, setActiveStep)) return;
    const payload = buildCurrentApplymentPayload(formElement);
    setError("");
    setSaved(false);
    startTransition(async () => {
      try {
        const savedDetail = await saveApplymentDraft(payload);
        const targetApplyment = savedDetail.applyment || currentApplyment;
        await requestBackendJson<WechatPayApplymentDetailData>(
          `/finance/wechat-pay/applyments/${targetApplyment.id}/submit`,
          {
            method: "POST",
            body: JSON.stringify({
              remark: typeof payload.remark === "string"
                ? payload.remark
                : targetApplyment.remark,
            }),
            fallbackMessage: "微信支付开通申请提交失败",
          },
        );
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "微信支付开通申请提交失败");
      }
    });
  }

  function buildCurrentApplymentPayload(
    formElement: HTMLFormElement,
    attachmentsOverride = attachmentsRef.current,
  ) {
    return buildWechatPayApplymentPayload(new FormData(formElement), {
      hasSensitivePayload: Boolean(applyment?.has_sensitive_payload),
      attachments: attachmentsOverride,
    });
  }

  async function saveApplymentDraft(
    payload: Record<string, unknown>,
    isCurrent = () => true,
  ) {
    const currentApplyment = applymentRef.current;
    const path = currentApplyment
      ? `/finance/wechat-pay/applyments/${currentApplyment.id}`
      : "/finance/wechat-pay/applyments";
    const outcome = await runGenerationGuardedSave({
      request: () => requestBackendJson<WechatPayApplymentDetailData>(path, {
        method: currentApplyment ? "PUT" : "POST",
        body: JSON.stringify(payload),
        fallbackMessage: "微信支付开通申请保存失败",
      }),
      isCurrent,
      commit: (detail) => {
        if (detail.applyment) applymentRef.current = detail.applyment;
      },
    });
    return outcome.result;
  }

  async function persistMaterialAttachments(input: {
    attachments: WechatPayApplymentAttachment[];
    draftUpdateSource: "manual_entry" | "attachment_change" | "ocr_review";
    contactType?: string;
  }, context: ApplymentSaveGenerationContext) {
    if (!editable) throw new Error("当前账号无权修改微信支付开通申请");
    const formElement = formRef.current;
    if (!formElement) throw new Error("申请表单尚未就绪，请稍后重试");
    const payload = buildCurrentApplymentPayload(
      formElement,
      input.attachments,
    );
    if (input.contactType) payload.contact_type = input.contactType;
    payload.draft_update_source = input.draftUpdateSource;
    if (input.attachments.some((attachment) => {
      const previous = applymentRef.current?.attachments.find(
        (item) => item.object_key === attachment.object_key,
      );
      return previous?.ocr_review_status !== "confirmed" &&
        attachment.ocr_review_status === "confirmed";
    })) {
      payload.draft_update_source = "ocr_confirm";
    }
    const detail = await saveApplymentDraft(payload, context.isCurrent);
    return { applymentId: detail.applyment?.id };
  }

  async function handleAttachmentsChange(
    nextAttachments: WechatPayApplymentAttachment[],
    options?: ApplymentAttachmentChangeOptions,
  ) {
    setReviewConfirmed(false);
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
    setReviewConfirmed(false);
    void changeApplymentContactTypeWithRollback({
      currentType: contactType,
      nextType: value,
      attachments: attachmentsRef.current,
      commitType: setContactType,
      changeAttachments: async (nextAttachments, options) => {
        await materials.onChange(nextAttachments, options);
      },
      reportError: setError,
    }).catch(() => undefined);
  }

  return (
    <div className="grid min-h-0 gap-4 xl:grid-cols-[minmax(0,1fr)_20rem]">
      <form
        ref={formRef}
        className="flex min-w-0 flex-col gap-4"
        noValidate
        onSubmit={submitSave}
      >
        {error ? <StatusAlert>{error}</StatusAlert> : null}
        {saved ? <StatusAlert tone="success">开通申请已保存。</StatusAlert> : null}
        {materials.error ? <StatusAlert>{materials.error}</StatusAlert> : null}
        {!editable ? (
          <StatusAlert tone="warning">
            当前账号无编辑权限，或申请已进入只读处理阶段。
          </StatusAlert>
        ) : null}
        {applyment?.rejected_reason ? (
          <StatusAlert tone="warning" title="驳回原因">
            {applyment.rejected_reason}
          </StatusAlert>
        ) : null}

        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={statusMeta.variant}>{statusMeta.label}</Badge>
          {applyment?.application_no ? <Badge variant="outline">{applyment.application_no}</Badge> : null}
          {applyment?.sub_mchid ? <Badge variant="outline">子商户 {applyment.sub_mchid}</Badge> : null}
          {applyment?.has_sensitive_payload ? <Badge variant="success">敏感资料已加密</Badge> : null}
        </div>

        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
            <span>第 {stepIndex + 1} 步，共 {APPLYMENT_STEP_KEYS.length} 步</span>
            <span>{Math.round(progress)}%</span>
          </div>
          <Progress value={progress} aria-label="微信支付开通资料填写进度" />
        </div>

        <FinanceWechatPayApplymentSteps
          applyment={applyment}
          activeStep={activeStep}
          subjectType={subjectType}
          contactType={contactType}
          editable={editable}
          disabled={pending || materials.pending || !editable}
          ocrFieldValues={ocrReview.appliedValues}
          onStepChange={setActiveStep}
          onSubjectTypeChange={(value) => {
            setSubjectType(value);
            setReviewConfirmed(false);
          }}
          onContactTypeChange={changeContactType}
          attachmentsContent={(
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
                    已上传资料仍会保存，请在下一步手动填写。
                  </AlertDescription>
                </Alert>
              ) : null}
              <WechatPayApplymentAttachmentsField
                attachments={attachments}
                contactType={contactType}
                editable={editable}
                disabled={pending || materials.pending}
                materialStates={materialStates}
                attachmentSaveErrors={attachmentSaveErrors}
                supportedOcrDocumentTypes={supportedOcrDocumentTypes}
                onUploaded={materials.onUploaded}
                onRetrySave={materials.onRetrySave}
                onRetryRecognition={materials.onRetryRecognition}
                onChange={handleAttachmentsChange}
              />
              <FinanceWechatPayApplymentOcrReview
                attachments={attachments}
                materialStates={materialStates}
                contactType={contactType}
                subjectType={subjectType}
                values={ocrReview.currentValues}
                comparisonValues={ocrReview.comparisonValues}
                fieldSources={ocrReview.fieldSources}
                disabled={pending || materials.pending || !editable}
                onManualChange={ocrReview.onManualChange}
                onApply={applyRecognitionRows}
                onUseManualEntry={ocrReview.useManualEntry}
              />
            </div>
          )}
          reviewContent={(
            <FinanceWechatPayApplymentReview
              applyment={applyment}
              attachments={attachments}
              contactType={contactType}
              confirmed={reviewConfirmed}
              disabled={pending || materials.pending || !editable}
              onConfirmedChange={setReviewConfirmed}
            />
          )}
        />

        <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
          <div className="text-xs text-muted-foreground">
            最近更新：{formatWechatPayApplymentTime(applyment?.updated_at)}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="submit"
              variant="outline"
              disabled={pending || materials.pending || !editable}
            >
              {pending ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <Save data-icon="inline-start" />}
              保存申请
            </Button>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  type="button"
                  disabled={
                    pending || materials.pending || !applyment || !editable ||
                    !data.can_submit ||
                    !reviewConfirmed || activeStep !== "review"
                  }
                >
                  <SendHorizontal data-icon="inline-start" />
                  提交平台审核
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>提交微信支付开通申请？</AlertDialogTitle>
                  <AlertDialogDescription>
                    提交后租户侧资料将进入只读状态，由平台审核并决定是否发送微信正式进件。
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>继续检查</AlertDialogCancel>
                  <AlertDialogAction type="button" onClick={submitApplyment}>
                    确认提交
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>
      </form>

      <aside className="h-fit min-w-0 rounded-md border p-4">
        <h2 className="text-sm font-semibold">处理记录</h2>
        <div className="mt-3 flex flex-col gap-3">
          {data.events.length > 0 ? data.events.map((event) => (
            <div key={event.id} className="rounded-md border p-3">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline">{event.event_type}</Badge>
                <span className="text-xs text-muted-foreground">
                  {formatWechatPayApplymentTime(event.created_at)}
                </span>
              </div>
              <p className="mt-2 text-sm">{event.message || "-"}</p>
            </div>
          )) : (
            <div className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
              暂无处理记录
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}

function validateVisibleStep(
  form: HTMLFormElement,
  setActiveStep: (step: ApplymentStepKey) => void,
) {
  const invalid = form.querySelector<HTMLElement>(":invalid");
  if (!invalid) return true;
  const panel = invalid.closest<HTMLElement>("[data-applyment-step]");
  const step = panel?.dataset.applymentStep as ApplymentStepKey | undefined;
  if (step) setActiveStep(step);
  requestAnimationFrame(() => {
    invalid.focus();
    form.reportValidity();
  });
  return false;
}
