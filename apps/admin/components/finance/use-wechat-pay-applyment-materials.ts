"use client";
import { useEffect, useRef, useState } from "react";
import { fetchApplymentOcrCapabilities } from "@/components/ocr/ocr-requests";
import {
  ATTACHMENT_CHECKPOINT_ERROR,
  createMaterialOperationGeneration,
  hasMaterialErrors,
  replaceCurrentMaterialError,
  retainUnpersistedAttachmentKeys,
  runAttachmentCheckpoint,
} from "./finance-wechat-pay-applyment-checkpoint";
import {
  buildInitialMaterialStates,
  getMaterialRetryAction,
  getOcrMaterialCategory,
  getOcrMaterialDocumentType,
  isCurrentMaterialAttachment,
  rebaseUploadedApplymentAttachment,
  reconcileMaterialStates,
  type ApplymentMaterialState,
  type ApplymentMaterialStateMap,
} from "./finance-wechat-pay-applyment-flow-model";
import { restoreApplymentMaterialStates } from "./finance-wechat-pay-applyment-material-recovery";
import { setupMountedRefLifecycle } from "./finance-wechat-pay-applyment-lifecycle";
import {
  changeApplymentAttachments,
  MANUAL_ENTRY_PERSIST_ERROR,
  persistUnsupportedApplymentMaterialsAsManual,
  type PersistAttachmentsInput,
} from "./finance-wechat-pay-applyment-manual-entry";
import {
  getApplymentMaterialErrorMessage,
  processApplymentUploadedMaterials,
  recognizeApplymentAttachment,
  RECOGNITION_PERSIST_ERROR,
} from "./finance-wechat-pay-applyment-recognition";
import type { AttachmentUploadedInput } from "./finance-wechat-pay-applyment-attachments";
import type { WechatPayApplymentAttachment } from "./finance-wechat-pay-applyment-shared";
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

export function useWechatPayApplymentMaterials(input: UseWechatPayApplymentMaterialsInput) {
  const [attachments, setAttachments] = useState(() => [...input.initialAttachments]);
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
  const generationRef = useRef(createMaterialOperationGeneration());
  const pendingOperationCountRef = useRef(0);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const mountedRef = useRef(true);
  persistAttachmentsRef.current = input.persistAttachments;

  useEffect(() => setupMountedRefLifecycle(
    mountedRef,
    () => {
      recognitionConsentRef.current = false;
      generationRef.current.advance();
    },
  ), []);
  useEffect(() => {
    let active = true;
    const generation = generationRef.current.advance();
    const initialAttachments = [...input.initialAttachments];
    const initialStates = buildInitialMaterialStates(initialAttachments);
    attachmentsRef.current = initialAttachments;
    materialStatesRef.current = initialStates;
    applymentIdRef.current = input.initialApplymentId ?? null;
    unpersistedObjectKeysRef.current.clear();
    setAttachments(initialAttachments);
    setMaterialStates(initialStates);

    void restoreApplymentMaterialStates({
      attachments: initialAttachments,
      isActive: () =>
        active && generationRef.current.isCurrent(generation),
      onState: updateStateIfCurrent,
      onError: (message) => {
        if (generationRef.current.isCurrent(generation)) setError(message);
      },
    });

    return () => {
      active = false;
    };
  }, [input.resetKey]);
  useEffect(() => {
    if (!input.editable) return;
    let active = true;
    const generation = generationRef.current.current();
    capabilityStatusRef.current = "loading";
    setCapabilityStatus("loading");
    fetchApplymentOcrCapabilities()
      .then((capabilities) => {
        if (
          !active ||
          !generationRef.current.isCurrent(generation)
        ) return;
        const supported = new Set<string>(
          capabilities.map((item) => item.document_type),
        );
        const status = supported.size > 0 ? "available" : "unavailable";
        supportedOcrDocumentTypesRef.current = supported;
        capabilityStatusRef.current = status;
        setSupportedOcrDocumentTypes(supported);
        setCapabilityStatus(status);
        void enqueue(
          () => processUploadedMaterials(supported, generation),
          generation,
        )
          .catch(reportOperationError);
      })
      .catch((capabilityError) => {
        if (
          !active ||
          !generationRef.current.isCurrent(generation)
        ) return;
        const supported = new Set<string>();
        supportedOcrDocumentTypesRef.current = supported;
        capabilityStatusRef.current = "unavailable";
        setSupportedOcrDocumentTypes(supported);
        setCapabilityStatus("unavailable");
        setError(getApplymentMaterialErrorMessage(
          capabilityError,
          "OCR 可用能力加载失败",
        ));
        void enqueue(
          () => processUploadedMaterials(supported, generation),
          generation,
        )
          .catch(reportOperationError);
      });
    return () => {
      active = false;
    };
  }, [input.editable, input.resetKey]);
  function syncAttachments(
    nextAttachments: WechatPayApplymentAttachment[],
    nextStates = reconcileMaterialStates(
      nextAttachments,
      materialStatesRef.current,
    ),
  ) {
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
  function commitMaterialStates(nextStates: ApplymentMaterialStateMap) {
    materialStatesRef.current = nextStates;
    if (mountedRef.current) setMaterialStates(nextStates);
  }
  function enqueue(
    operation: () => Promise<void>,
    generation = generationRef.current.current(),
  ) {
    const queued = operationQueueRef.current
      .catch(() => undefined)
      .then(async () => {
        if (!generationRef.current.isCurrent(generation)) return;
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
  async function persist(
    input: PersistAttachmentsInput,
    generation = generationRef.current.current(),
  ) {
    if (!generationRef.current.isCurrent(generation)) return;
    const result = await persistAttachmentsRef.current(input);
    if (
      generationRef.current.isCurrent(generation) &&
      result.applymentId
    ) {
      applymentIdRef.current = result.applymentId;
    }
  }
  async function markUnsupportedMaterialsManual(
    supportedDocumentTypes: ReadonlySet<string>,
    generation: number,
  ) {
    await persistUnsupportedApplymentMaterialsAsManual({
      attachments: attachmentsRef.current,
      materialStates: materialStatesRef.current,
      supportedDocumentTypes,
      excludedObjectKeys: unpersistedObjectKeysRef.current,
      isActive: () => generationRef.current.isCurrent(generation),
      commitLocal: syncAttachments,
      commitStates: commitMaterialStates,
      persist: (persistInput) => persist(persistInput, generation),
      reportError: setError,
    });
  }
  async function processUploadedMaterials(
    supportedDocumentTypes: ReadonlySet<string>,
    generation: number,
  ) {
    await processApplymentUploadedMaterials({
      attachments: attachmentsRef.current,
      materialStates: materialStatesRef.current,
      supportedDocumentTypes,
      excludedObjectKeys: unpersistedObjectKeysRef.current,
      isActive: () => generationRef.current.isCurrent(generation),
      hasConsent: () => recognitionConsentRef.current,
      markUnsupportedManual: () =>
        markUnsupportedMaterialsManual(supportedDocumentTypes, generation),
      recognize: (attachment) => recognizeAttachment(attachment, generation),
    });
  }
  async function recognizeAttachment(
    attachment: WechatPayApplymentAttachment,
    generation = generationRef.current.current(),
  ) {
    await recognizeApplymentAttachment({
      attachment,
      applymentId: applymentIdRef.current,
      supportedDocumentTypes: supportedOcrDocumentTypesRef.current,
      unpersistedObjectKeys: unpersistedObjectKeysRef.current,
      generation,
      isCurrentGeneration: generationRef.current.isCurrent,
      getAttachments: () => attachmentsRef.current,
      getState: (category) => materialStatesRef.current[category],
      commitAttachments: syncAttachments,
      commitState: updateStateIfCurrent,
      persist: (persistInput) => persist(persistInput, generation),
      reportError: (message) => {
        if (
          generationRef.current.isCurrent(generation) &&
          (message || !hasMaterialErrors(materialStatesRef.current))
        ) setError(message);
      },
    });
  }
  async function checkpointAttachment(
    attachment: WechatPayApplymentAttachment,
    generation: number,
  ) {
    const outcome = await runAttachmentCheckpoint({
      generation,
      isCurrent: generationRef.current.isCurrent,
      persist: () => persist({
        attachments: attachmentsRef.current,
        draftUpdateSource: "attachment_change",
      }, generation),
      onFailed: () => {
        const nextStates = replaceCurrentMaterialError({
          materialStates: materialStatesRef.current,
          attachment,
          error: ATTACHMENT_CHECKPOINT_ERROR,
        });
        if (nextStates !== materialStatesRef.current) {
          commitMaterialStates(nextStates);
          setError(ATTACHMENT_CHECKPOINT_ERROR);
        }
      },
      onPersisted: async () => {
        unpersistedObjectKeysRef.current.delete(attachment.object_key);
        const category = getOcrMaterialCategory(attachment);
        if (
          category &&
          materialStatesRef.current[category]?.error ===
            ATTACHMENT_CHECKPOINT_ERROR
        ) {
          commitMaterialStates(replaceCurrentMaterialError({
            materialStates: materialStatesRef.current,
            attachment,
            error: null,
          }));
        }
        if (!hasMaterialErrors(materialStatesRef.current)) setError("");
        if (capabilityStatusRef.current === "loading") return;
        const documentType = getOcrMaterialDocumentType(attachment);
        if (
          !documentType ||
          !supportedOcrDocumentTypesRef.current.has(documentType)
        ) {
          await markUnsupportedMaterialsManual(
            supportedOcrDocumentTypesRef.current,
            generation,
          );
          return;
        }
        if (recognitionConsentRef.current) {
          await recognizeAttachment(attachment, generation);
        }
      },
    });
    return outcome;
  }
  async function onUploaded(uploaded: AttachmentUploadedInput) {
    if (!input.editable) return;
    const generation = generationRef.current.current();
    const rebasedAttachments = rebaseUploadedApplymentAttachment(
      attachmentsRef.current,
      uploaded.attachment,
    );
    retainUnpersistedAttachmentKeys(
      unpersistedObjectKeysRef.current,
      rebasedAttachments,
    );
    unpersistedObjectKeysRef.current.add(uploaded.attachment.object_key);
    syncAttachments(rebasedAttachments);
    if (!hasMaterialErrors(materialStatesRef.current)) setError("");
    return enqueue(
      async () => {
        await checkpointAttachment(uploaded.attachment, generation);
      },
      generation,
    );
  }
  async function onChange(nextAttachments: WechatPayApplymentAttachment[]) {
    if (!input.editable) return;
    const generation = generationRef.current.current();
    retainUnpersistedAttachmentKeys(
      unpersistedObjectKeysRef.current,
      nextAttachments,
    );
    return changeApplymentAttachments({
      currentAttachments: attachmentsRef.current,
      currentStates: materialStatesRef.current,
      nextAttachments,
      commitLocal: syncAttachments,
      getCurrentStates: () => materialStatesRef.current,
      commitStates: (states) => {
        if (generationRef.current.isCurrent(generation)) {
          commitMaterialStates(states);
        }
      },
      enqueue: (operation) => enqueue(operation, generation),
      persist: (persistInput) => persist(persistInput, generation),
      clearError: () => {
        if (
          generationRef.current.isCurrent(generation) &&
          !hasMaterialErrors(materialStatesRef.current)
        ) setError("");
      },
      reportError: (message) => {
        if (generationRef.current.isCurrent(generation)) setError(message);
      },
      reportOperationError: (operationError) => {
        if (generationRef.current.isCurrent(generation)) {
          reportOperationError(operationError);
        }
      },
    });
  }

  async function onRetryRecognition(attachment: WechatPayApplymentAttachment) {
    if (!input.editable) return;
    const generation = generationRef.current.current();
    if (!hasMaterialErrors(materialStatesRef.current)) setError("");
    return enqueue(async () => {
      const category = getOcrMaterialCategory(attachment);
      const state = category ? materialStatesRef.current[category] : undefined;
      const retryState = getMaterialRetryAction(state) === "persist"
        ? state
        : null;
      if (
        category &&
        retryState &&
        isCurrentMaterialAttachment(attachmentsRef.current, attachment)
      ) {
        if (retryState.status === "uploaded") {
          await checkpointAttachment(attachment, generation);
          return;
        }
        const retryingManualEntry = retryState.status === "manual";
        const persistError = retryingManualEntry
          ? MANUAL_ENTRY_PERSIST_ERROR
          : RECOGNITION_PERSIST_ERROR;
        try {
          await persist({
            attachments: attachmentsRef.current,
            draftUpdateSource: retryingManualEntry
              ? "manual_entry"
              : "ocr_review",
          }, generation);
          if (!generationRef.current.isCurrent(generation)) return;
          const currentState = materialStatesRef.current[category];
          if (
            currentState &&
            currentState.recognitionId === retryState.recognitionId
          ) {
            updateStateIfCurrent(attachment, { ...currentState, error: null });
            if (!hasMaterialErrors(materialStatesRef.current)) setError("");
          }
        } catch {
          if (!generationRef.current.isCurrent(generation)) return;
          const currentState = materialStatesRef.current[category];
          if (
            currentState &&
            currentState.recognitionId === retryState.recognitionId
          ) {
            updateStateIfCurrent(attachment, {
              ...currentState,
              error: persistError,
            });
          }
          setError(persistError);
        }
        return;
      }
      await recognizeAttachment(attachment, generation);
    }, generation)
      .catch(reportOperationError);
  }

  function setRecognitionConsent(checked: boolean) {
    if (!input.editable) return;
    recognitionConsentRef.current = checked;
    setRecognitionConsentState(checked);
    if (checked && capabilityStatusRef.current !== "loading") {
      const generation = generationRef.current.current();
      void enqueue(
        () => processUploadedMaterials(
          supportedOcrDocumentTypesRef.current,
          generation,
        ),
        generation,
      ).catch(reportOperationError);
    }
  }

  function reportOperationError(operationError: unknown) {
    if (mountedRef.current) {
      setError(getApplymentMaterialErrorMessage(
        operationError,
        "申请附件处理失败",
      ));
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
