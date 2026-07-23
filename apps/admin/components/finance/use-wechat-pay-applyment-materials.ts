"use client";
import { useEffect, useRef, useState } from "react";
import type { OcrDocumentType } from "@gooes/domain";
import { mapApplymentOcrFields } from "@/components/ocr/ocr-field-review-dialog";
import {
  createApplymentOcrRecognition,
  fetchApplymentOcrCapabilities,
  fetchApplymentOcrRecognition,
} from "@/components/ocr/ocr-requests";
import {
  buildInitialMaterialStates,
  buildFailedMaterialState,
  buildRecoveredMaterialState,
  getOcrMaterialCategory,
  getOcrMaterialDocumentType,
  getPendingRecognitionAttachments,
  isCurrentMaterialAttachment,
  reconcileMaterialStates,
  updateAttachmentOcrReviewMetadata,
  type ApplymentMaterialState,
  type ApplymentMaterialStateMap,
} from "./finance-wechat-pay-applyment-flow-model";
import {
  WECHAT_PAY_APPLYMENT_OCR_DOCUMENT_TYPES,
  type WechatPayApplymentAttachment,
} from "./finance-wechat-pay-applyment-shared";

type DraftUpdateSource = "attachment_change" | "ocr_review" | "manual_entry";

type PersistAttachmentsInput = {
  attachments: WechatPayApplymentAttachment[];
  draftUpdateSource: DraftUpdateSource;
};
type UploadedAttachmentInput = {
  attachment: WechatPayApplymentAttachment;
  nextAttachments: WechatPayApplymentAttachment[];
};
type UseWechatPayApplymentMaterialsInput = {
  initialAttachments: WechatPayApplymentAttachment[];
  initialApplymentId?: string | null;
  resetKey: string;
  editable: boolean;
  persistAttachments: (input: PersistAttachmentsInput) => Promise<{
    applymentId?: string | null;
  }>;
};
type CapabilityStatus = "loading" | "available" | "unavailable";

export function useWechatPayApplymentMaterials(
  input: UseWechatPayApplymentMaterialsInput,
) {
  const [attachments, setAttachments] = useState(
    () => [...input.initialAttachments],
  );
  const attachmentsRef = useRef(attachments);
  const [materialStates, setMaterialStates] = useState<
    ApplymentMaterialStateMap
  >(() => buildInitialMaterialStates(input.initialAttachments));
  const materialStatesRef = useRef(materialStates);
  const [supportedOcrDocumentTypes, setSupportedOcrDocumentTypes] =
    useState<ReadonlySet<string>>(new Set());
  const supportedOcrDocumentTypesRef = useRef<ReadonlySet<string>>(new Set());
  const [capabilityStatus, setCapabilityStatus] =
    useState<CapabilityStatus>("loading");
  const capabilityStatusRef = useRef<CapabilityStatus>("loading");
  const [recognitionConsent, setRecognitionConsentState] = useState(false);
  const recognitionConsentRef = useRef(false);
  const applymentIdRef = useRef(input.initialApplymentId ?? null);
  const unpersistedObjectKeysRef = useRef<Set<string>>(new Set());
  const persistAttachmentsRef = useRef(input.persistAttachments);
  const operationQueueRef = useRef<Promise<void>>(Promise.resolve());
  const pendingOperationCountRef = useRef(0);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const mountedRef = useRef(true);
  persistAttachmentsRef.current = input.persistAttachments;

  useEffect(() => {
    return () => {
      mountedRef.current = false;
      recognitionConsentRef.current = false;
    };
  }, []);
  useEffect(() => {
    let active = true;
    const initialAttachments = [...input.initialAttachments];
    const initialStates = buildInitialMaterialStates(initialAttachments);
    attachmentsRef.current = initialAttachments;
    materialStatesRef.current = initialStates;
    applymentIdRef.current = input.initialApplymentId ?? null;
    unpersistedObjectKeysRef.current.clear();
    setAttachments(initialAttachments);
    setMaterialStates(initialStates);

    void (async () => {
      for (const attachment of initialAttachments) {
        if (
          !active ||
          attachment.ocr_review_status !== "review_required" ||
          !attachment.ocr_recognition_id
        ) {
          continue;
        }
        const category = getOcrMaterialCategory(attachment);
        if (!category) continue;
        try {
          const recognition = await fetchApplymentOcrRecognition(
            attachment.ocr_recognition_id,
          );
          if (!active) return;
          if (recognition.status !== "succeeded") {
            throw new Error(
              recognition.status === "expired"
                ? "识别结果已过期，请重试或手动填写"
                : "识别结果不可用，请重试或手动填写",
            );
          }
          updateStateIfCurrent(
            attachment,
            buildRecoveredMaterialState(
              attachment,
              recognition,
              mapApplymentOcrFields(category, recognition.fields),
            ),
          );
        } catch (restoreError) {
          if (!active) return;
          updateStateIfCurrent(
            attachment,
            buildFailedMaterialState(
              attachment,
              errorMessage(restoreError, "OCR 识别结果恢复失败"),
            ),
          );
          setError(errorMessage(restoreError, "OCR 识别结果恢复失败"));
        }
      }
    })();

    return () => {
      active = false;
    };
  }, [input.resetKey]);

  useEffect(() => {
    if (!input.editable) return;
    let active = true;
    capabilityStatusRef.current = "loading";
    setCapabilityStatus("loading");
    fetchApplymentOcrCapabilities()
      .then((capabilities) => {
        if (!active) return;
        const supported = new Set<string>(
          capabilities.map((item) => item.document_type),
        );
        const status = supported.size > 0 ? "available" : "unavailable";
        supportedOcrDocumentTypesRef.current = supported;
        capabilityStatusRef.current = status;
        setSupportedOcrDocumentTypes(supported);
        setCapabilityStatus(status);
        void enqueue(() => processUploadedMaterials(supported))
          .catch(reportOperationError);
      })
      .catch((capabilityError) => {
        if (!active) return;
        const supported = new Set<string>();
        supportedOcrDocumentTypesRef.current = supported;
        capabilityStatusRef.current = "unavailable";
        setSupportedOcrDocumentTypes(supported);
        setCapabilityStatus("unavailable");
        setError(errorMessage(capabilityError, "OCR 可用能力加载失败"));
        void enqueue(() => processUploadedMaterials(supported))
          .catch(reportOperationError);
      });
    return () => {
      active = false;
    };
  }, [input.editable, input.resetKey]);

  function syncAttachments(nextAttachments: WechatPayApplymentAttachment[]) {
    const nextStates = reconcileMaterialStates(
      nextAttachments,
      materialStatesRef.current,
    );
    attachmentsRef.current = nextAttachments;
    materialStatesRef.current = nextStates;
    if (!mountedRef.current) return;
    setAttachments(nextAttachments);
    setMaterialStates(nextStates);
  }

  function updateStateIfCurrent(
    attachment: WechatPayApplymentAttachment,
    nextState: ApplymentMaterialState,
  ) {
    const category = getOcrMaterialCategory(attachment);
    if (
      !category ||
      !isCurrentMaterialAttachment(attachmentsRef.current, attachment)
    ) {
      return false;
    }
    const nextStates = {
      ...materialStatesRef.current,
      [category]: nextState,
    };
    materialStatesRef.current = nextStates;
    if (mountedRef.current) setMaterialStates(nextStates);
    return true;
  }

  function enqueue(operation: () => Promise<void>) {
    const queued = operationQueueRef.current
      .catch(() => undefined)
      .then(async () => {
        pendingOperationCountRef.current += 1;
        if (mountedRef.current) setPending(true);
        try {
          await operation();
        } finally {
          pendingOperationCountRef.current -= 1;
          if (mountedRef.current && pendingOperationCountRef.current === 0) {
            setPending(false);
          }
        }
      });
    operationQueueRef.current = queued.catch(() => undefined);
    return queued;
  }

  async function persist(input: PersistAttachmentsInput) {
    const result = await persistAttachmentsRef.current(input);
    if (result.applymentId) applymentIdRef.current = result.applymentId;
  }

  async function markUnsupportedMaterialsManual(
    supportedDocumentTypes: ReadonlySet<string>,
  ) {
    const unsupported = attachmentsRef.current.filter((attachment) => {
      const category = getOcrMaterialCategory(attachment);
      if (!category) return false;
      const state = materialStatesRef.current[category];
      const documentType = WECHAT_PAY_APPLYMENT_OCR_DOCUMENT_TYPES[category];
      return Boolean(
        documentType &&
        !unpersistedObjectKeysRef.current.has(attachment.object_key) &&
        !supportedDocumentTypes.has(documentType) &&
        state?.attachmentObjectKey === attachment.object_key &&
        state.status === "uploaded",
      );
    });
    if (unsupported.length === 0) return;

    let nextAttachments = attachmentsRef.current;
    for (const attachment of unsupported) {
      nextAttachments = updateAttachmentOcrReviewMetadata(
        nextAttachments,
        attachment.object_key,
        {
          ocr_recognition_id: attachment.ocr_recognition_id ?? null,
          ocr_review_status: "manual",
        },
      );
    }
    syncAttachments(nextAttachments);
    for (const attachment of unsupported) {
      updateStateIfCurrent(attachment, {
        status: "manual",
        attachmentObjectKey: attachment.object_key,
        recognitionId: attachment.ocr_recognition_id ?? null,
        fields: [],
        warnings: [],
        error: null,
      });
    }
    await persist({
      attachments: nextAttachments,
      draftUpdateSource: "manual_entry",
    });
  }

  async function processUploadedMaterials(
    supportedDocumentTypes: ReadonlySet<string>,
  ) {
    await markUnsupportedMaterialsManual(supportedDocumentTypes);
    if (!recognitionConsentRef.current) return;
    const pendingAttachments = getPendingRecognitionAttachments({
      attachments: attachmentsRef.current,
      materialStates: materialStatesRef.current,
      supportedDocumentTypes,
      excludedObjectKeys: unpersistedObjectKeysRef.current,
    });
    for (const attachment of pendingAttachments) {
      if (!recognitionConsentRef.current) break;
      await recognizeAttachment(attachment);
    }
  }

  async function recognizeAttachment(
    attachment: WechatPayApplymentAttachment,
  ) {
    const category = getOcrMaterialCategory(attachment);
    const documentType = category
      ? WECHAT_PAY_APPLYMENT_OCR_DOCUMENT_TYPES[category]
      : undefined;
    if (
      !category ||
      !documentType ||
      !attachment.file_object_id ||
      unpersistedObjectKeysRef.current.has(attachment.object_key) ||
      !supportedOcrDocumentTypesRef.current.has(documentType) ||
      !isCurrentMaterialAttachment(attachmentsRef.current, attachment)
    ) {
      return;
    }

    setError("");
    updateStateIfCurrent(attachment, {
      status: "recognizing",
      attachmentObjectKey: attachment.object_key,
      recognitionId: attachment.ocr_recognition_id ?? null,
      fields: [],
      warnings: [],
      error: null,
    });
    try {
      const result = await createApplymentOcrRecognition({
        documentType: documentType as OcrDocumentType,
        fileObjectId: attachment.file_object_id,
        applymentId: applymentIdRef.current,
      });
      if (!isCurrentMaterialAttachment(attachmentsRef.current, attachment)) {
        return;
      }
      const nextAttachments = updateAttachmentOcrReviewMetadata(
        attachmentsRef.current,
        attachment.object_key,
        {
          ocr_recognition_id: result.recognition.id,
          ocr_review_status: "review_required",
        },
      );
      syncAttachments(nextAttachments);
      updateStateIfCurrent(attachment, {
        status: "review_required",
        attachmentObjectKey: attachment.object_key,
        recognitionId: result.recognition.id,
        fields: mapApplymentOcrFields(category, result.recognition.fields),
        warnings: [...result.recognition.warnings],
        error: null,
      });
      await persist({
        attachments: nextAttachments,
        draftUpdateSource: "ocr_review",
      });
    } catch (recognitionError) {
      if (!isCurrentMaterialAttachment(attachmentsRef.current, attachment)) {
        return;
      }
      const nextAttachments = updateAttachmentOcrReviewMetadata(
        attachmentsRef.current,
        attachment.object_key,
        {
          ocr_recognition_id: attachment.ocr_recognition_id ?? null,
          ocr_review_status: "failed",
        },
      );
      syncAttachments(nextAttachments);
      updateStateIfCurrent(
        attachment,
        buildFailedMaterialState(
          attachment,
          errorMessage(recognitionError, "证照识别失败"),
        ),
      );
      setError(errorMessage(recognitionError, "证照识别失败"));
      await persist({
        attachments: nextAttachments,
        draftUpdateSource: "ocr_review",
      });
    }
  }

  async function onUploaded(uploaded: UploadedAttachmentInput) {
    unpersistedObjectKeysRef.current.add(uploaded.attachment.object_key);
    syncAttachments(uploaded.nextAttachments);
    setError("");
    return enqueue(async () => {
      await persist({
        attachments: uploaded.nextAttachments,
        draftUpdateSource: "attachment_change",
      });
      unpersistedObjectKeysRef.current.delete(uploaded.attachment.object_key);
      if (capabilityStatusRef.current === "loading") return;
      const documentType = getOcrMaterialDocumentType(uploaded.attachment);
      if (
        !documentType ||
        !supportedOcrDocumentTypesRef.current.has(documentType)
      ) {
        await markUnsupportedMaterialsManual(
          supportedOcrDocumentTypesRef.current,
        );
        return;
      }
      if (recognitionConsentRef.current) {
        await recognizeAttachment(uploaded.attachment);
      }
    }).catch((operationError) => {
      reportOperationError(operationError);
      throw operationError;
    });
  }

  async function onChange(nextAttachments: WechatPayApplymentAttachment[]) {
    const changedToManual = nextAttachments.some((attachment) => {
      const previous = attachmentsRef.current.find(
        (item) => item.object_key === attachment.object_key,
      );
      return previous?.ocr_review_status !== "manual" &&
        attachment.ocr_review_status === "manual";
    });
    syncAttachments(nextAttachments);
    setError("");
    return enqueue(() => persist(changedToManual
      ? {
        attachments: nextAttachments,
        draftUpdateSource: "manual_entry",
      }
      : {
        attachments: nextAttachments,
        draftUpdateSource: "attachment_change",
      }))
      .catch((operationError) => {
        reportOperationError(operationError);
        throw operationError;
      });
  }

  async function onRetryRecognition(
    attachment: WechatPayApplymentAttachment,
  ) {
    setError("");
    return enqueue(() => recognizeAttachment(attachment))
      .catch(reportOperationError);
  }

  function setRecognitionConsent(checked: boolean) {
    recognitionConsentRef.current = checked;
    setRecognitionConsentState(checked);
    if (checked && capabilityStatusRef.current !== "loading") {
      void enqueue(() => processUploadedMaterials(
        supportedOcrDocumentTypesRef.current,
      )).catch(reportOperationError);
    }
  }

  function reportOperationError(operationError: unknown) {
    if (mountedRef.current) {
      setError(errorMessage(operationError, "申请附件处理失败"));
    }
  }

  return {
    attachments,
    attachmentsRef,
    materialStates,
    supportedOcrDocumentTypes,
    recognitionConsent,
    setRecognitionConsent,
    capabilitiesUnavailable: capabilityStatus === "unavailable",
    pending,
    error,
    onUploaded,
    onRetryRecognition,
    onChange,
  };
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}
