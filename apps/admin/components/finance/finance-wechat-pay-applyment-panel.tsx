"use client";

import {
  type FormEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import type {
  OcrDocumentType,
  OcrFieldSuggestion,
  OcrWarning,
} from "@gooes/domain";
import { useRouter } from "next/navigation";
import { Loader2, Save, SendHorizontal } from "lucide-react";
import { StatusAlert } from "@/components/admin/status-alert";
import {
  mapApplymentOcrFields,
  OcrFieldReviewDialog,
} from "@/components/ocr/ocr-field-review-dialog";
import {
  createApplymentOcrRecognition,
  fetchApplymentOcrCapabilities,
} from "@/components/ocr/ocr-requests";
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
import { Progress } from "@/components/ui/progress";
import { requestBackendJson } from "@/lib/backend-client";
import { WechatPayApplymentAttachmentsField } from "./finance-wechat-pay-applyment-attachments";
import { FinanceWechatPayApplymentReview } from "./finance-wechat-pay-applyment-review";
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
  WECHAT_PAY_APPLYMENT_OCR_DOCUMENT_TYPES,
} from "./finance-wechat-pay-applyment-shared";

export function FinanceWechatPayApplymentPanel({
  data,
}: {
  data: WechatPayApplymentDetailResult;
}) {
  const router = useRouter();
  const applyment = data.applyment;
  const formRef = useRef<HTMLFormElement>(null);
  const [activeStep, setActiveStep] = useState<ApplymentStepKey>("subject");
  const [subjectType, setSubjectType] = useState(
    applyment?.subject_type || "SUBJECT_TYPE_ENTERPRISE",
  );
  const [contactType, setContactType] = useState(applyment?.contact_type || "LEGAL");
  const [reviewConfirmed, setReviewConfirmed] = useState(false);
  const [error, setError] = useState(data.error || "");
  const [saved, setSaved] = useState(false);
  const [attachments, setAttachments] = useState<WechatPayApplymentAttachment[]>(
    applyment?.attachments || [],
  );
  const [ocrDocumentTypes, setOcrDocumentTypes] = useState<OcrDocumentType[]>(
    [],
  );
  const [recognizingCategory, setRecognizingCategory] = useState<string | null>(
    null,
  );
  const [ocrError, setOcrError] = useState("");
  const [ocrFields, setOcrFields] = useState<OcrFieldSuggestion[]>([]);
  const [ocrWarnings, setOcrWarnings] = useState<OcrWarning[]>([]);
  const [ocrCurrentValues, setOcrCurrentValues] = useState<
    Record<string, string>
  >({});
  const [ocrAppliedValues, setOcrAppliedValues] = useState<
    Record<string, string>
  >({});
  const [ocrDialogOpen, setOcrDialogOpen] = useState(false);
  const [ocrAttachmentCategory, setOcrAttachmentCategory] = useState<
    string | null
  >(null);
  const [pending, startTransition] = useTransition();
  const supportedOcrDocumentTypes = useMemo(
    () => new Set<string>(ocrDocumentTypes),
    [ocrDocumentTypes],
  );
  const statusMeta = getWechatPayApplymentStatusMeta(applyment?.status);
  const editable = !applyment || ["draft", "rejected", "wechat_editing"].includes(
    applyment.status,
  );
  const stepIndex = APPLYMENT_STEP_KEYS.indexOf(activeStep);
  const progress = ((stepIndex + 1) / APPLYMENT_STEP_KEYS.length) * 100;

  useEffect(() => {
    setAttachments(applyment?.attachments || []);
    setSubjectType(applyment?.subject_type || "SUBJECT_TYPE_ENTERPRISE");
    setContactType(applyment?.contact_type || "LEGAL");
    setReviewConfirmed(false);
    setOcrAppliedValues({});
  }, [applyment?.id, applyment?.updated_at]);

  useEffect(() => {
    if (!editable) return;
    let active = true;
    fetchApplymentOcrCapabilities()
      .then((capabilities) => {
        if (active) {
          setOcrDocumentTypes(capabilities.map((item) => item.document_type));
        }
      })
      .catch((capabilityError) => {
        if (active) {
          setOcrError(capabilityError instanceof Error
            ? capabilityError.message
            : "OCR 可用能力加载失败");
        }
      });
    return () => {
      active = false;
    };
  }, [editable]);

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
    if (!applyment || !data.can_submit) return;
    const formElement = formRef.current;
    if (!formElement || !validateVisibleStep(formElement, setActiveStep)) return;
    const payload = buildCurrentApplymentPayload(formElement);
    setError("");
    setSaved(false);
    startTransition(async () => {
      try {
        const savedDetail = await saveApplymentDraft(payload);
        const targetApplyment = savedDetail.applyment || applyment;
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

  function buildCurrentApplymentPayload(formElement: HTMLFormElement) {
    return buildWechatPayApplymentPayload(new FormData(formElement), {
      hasSensitivePayload: Boolean(applyment?.has_sensitive_payload),
      attachments,
    });
  }

  function saveApplymentDraft(payload: Record<string, unknown>) {
    const path = applyment
      ? `/finance/wechat-pay/applyments/${applyment.id}`
      : "/finance/wechat-pay/applyments";
    return requestBackendJson<WechatPayApplymentDetailData>(path, {
      method: applyment ? "PUT" : "POST",
      body: JSON.stringify(payload),
      fallbackMessage: "微信支付开通申请保存失败",
    });
  }

  function changeContactType(value: string) {
    setContactType(value);
    setReviewConfirmed(false);
    if (value === "LEGAL") {
      setAttachments((current) => current.filter((attachment) =>
        attachment.category !== "contact_id_card_front" &&
        attachment.category !== "contact_id_card_back"
      ));
    }
  }

  async function recognizeAttachment(attachment: WechatPayApplymentAttachment) {
    const category = attachment.category as
      WechatPayApplymentAttachmentCategory | undefined;
    const documentType = category
      ? WECHAT_PAY_APPLYMENT_OCR_DOCUMENT_TYPES[category]
      : undefined;
    if (!attachment.file_object_id) {
      setOcrError("旧附件缺少文件 ID，请重新上传后再识别");
      return;
    }
    if (
      !category ||
      !documentType ||
      !supportedOcrDocumentTypes.has(documentType)
    ) {
      setOcrError("当前附件暂不支持证照识别");
      return;
    }

    setOcrError("");
    setRecognizingCategory(category);
    try {
      const result = await createApplymentOcrRecognition({
        documentType,
        fileObjectId: attachment.file_object_id,
        applymentId: applyment?.id,
      });
      const fields = mapApplymentOcrFields(
        category,
        result.recognition.fields,
      );
      if (fields.length === 0) {
        setOcrError("识别成功，但没有可回填到当前申请的字段");
        return;
      }
      setOcrFields(fields);
      setOcrWarnings([...result.recognition.warnings]);
      setOcrCurrentValues(readCurrentOcrValues(
        formRef.current,
        fields,
        Boolean(applyment?.has_sensitive_payload),
      ));
      setOcrAttachmentCategory(category);
      setOcrDialogOpen(true);
    } catch (recognitionError) {
      setOcrError(recognitionError instanceof Error
        ? recognitionError.message
        : "证照识别失败");
    } finally {
      setRecognizingCategory(null);
    }
  }

  function applyOcrValues(values: Record<string, string>) {
    setOcrAppliedValues((current) => ({ ...current, ...values }));
    setReviewConfirmed(false);
    setActiveStep(getOcrTargetStep(ocrAttachmentCategory));
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
        {ocrError ? <StatusAlert>{ocrError}</StatusAlert> : null}
        <OcrFieldReviewDialog
          open={ocrDialogOpen}
          fields={ocrFields}
          warnings={ocrWarnings}
          currentValues={ocrCurrentValues}
          onOpenChange={setOcrDialogOpen}
          onApply={applyOcrValues}
        />
        {!editable ? (
          <StatusAlert tone="warning">当前申请已提交或进入平台处理阶段，租户侧只读。</StatusAlert>
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
          disabled={pending || !editable}
          ocrFieldValues={ocrAppliedValues}
          onStepChange={setActiveStep}
          onSubjectTypeChange={(value) => {
            setSubjectType(value);
            setReviewConfirmed(false);
          }}
          onContactTypeChange={changeContactType}
          attachmentsContent={(
            <WechatPayApplymentAttachmentsField
              attachments={attachments}
              contactType={contactType}
              editable={editable}
              disabled={pending}
              supportedOcrDocumentTypes={supportedOcrDocumentTypes}
              recognizingCategory={recognizingCategory}
              onRecognize={recognizeAttachment}
              onChange={(nextAttachments) => {
                setAttachments(nextAttachments);
                setReviewConfirmed(false);
              }}
            />
          )}
          reviewContent={(
            <FinanceWechatPayApplymentReview
              applyment={applyment}
              attachments={attachments}
              contactType={contactType}
              confirmed={reviewConfirmed}
              disabled={pending || !editable}
              onConfirmedChange={setReviewConfirmed}
            />
          )}
        />

        <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
          <div className="text-xs text-muted-foreground">
            最近更新：{formatWechatPayApplymentTime(applyment?.updated_at)}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" variant="outline" disabled={pending || !editable}>
              {pending ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <Save data-icon="inline-start" />}
              保存申请
            </Button>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  type="button"
                  disabled={
                    pending || !applyment || !data.can_submit ||
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

const STORED_SENSITIVE_OCR_FIELDS = new Set([
  "identity_name",
  "identity_number",
  "identity_address",
  "contact_identity_number",
  "contact_identity_address",
  "settlement_account_number",
]);

function readCurrentOcrValues(
  form: HTMLFormElement | null,
  fields: readonly OcrFieldSuggestion[],
  hasSensitivePayload: boolean,
) {
  const formData = form ? new FormData(form) : new FormData();
  return Object.fromEntries(fields.map((field) => {
    const value = String(formData.get(field.key) ?? "").trim();
    const displayValue = !value &&
        hasSensitivePayload &&
        STORED_SENSITIVE_OCR_FIELDS.has(field.key)
      ? "已安全保存"
      : value;
    return [field.key, displayValue];
  }));
}

function getOcrTargetStep(category: string | null): ApplymentStepKey {
  if (category === "license_copy") return "subject";
  if (category === "settlement_account_proof") return "settlement";
  return "contact";
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
