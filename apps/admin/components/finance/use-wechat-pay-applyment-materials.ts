"use client";
import { useEffect, useRef, useState } from "react";
import { fetchApplymentOcrCapabilities } from "@/components/ocr/ocr-requests";
import {
  checkpointApplymentAttachment,
  createAttachmentChangeCheckpointRuntime,
  createMaterialOperationGeneration,
  hasMaterialErrors,
  retainAttachmentCheckpointErrors,
  retainUnpersistedAttachmentKeys,
  type AttachmentCheckpointErrorMap,
} from "./finance-wechat-pay-applyment-checkpoint";
import {
  buildInitialMaterialStates,
  getOcrMaterialCategory,
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
  persistUnsupportedApplymentMaterialsAsManual,
  type ApplymentAttachmentChangeOptions,
  type PersistAttachmentsInput,
} from "./finance-wechat-pay-applyment-manual-entry";
import {
  createApplymentAttachmentRetryCoordinator,
} from "./finance-wechat-pay-applyment-material-retry";
import {
  getApplymentMaterialErrorMessage,
  processApplymentUploadedMaterials,
  recognizeApplymentAttachment,
} from "./finance-wechat-pay-applyment-recognition";
import type {
  AttachmentUploadedInput,
} from "./finance-wechat-pay-applyment-attachment-controller";
import type { UseWechatPayApplymentMaterialsInput } from "./finance-wechat-pay-applyment-materials-contract";
import { reportGenerationGuardedError } from "./finance-wechat-pay-applyment-save-generation";
import type { WechatPayApplymentAttachment } from "./finance-wechat-pay-applyment-shared";
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
  const [capabilityStatus, setCapabilityStatus] = useState<CapabilityStatus>(
    "loading",
  );
  const capabilityStatusRef = useRef<CapabilityStatus>("loading");
  const applymentIdRef = useRef(input.initialApplymentId ?? null);
  const unpersistedObjectKeysRef = useRef<Set<string>>(new Set());
  const [attachmentSaveErrors, setAttachmentSaveErrors] = useState<
    AttachmentCheckpointErrorMap
  >({});
  const attachmentSaveErrorsRef = useRef(attachmentSaveErrors);
  const persistAttachmentsRef = useRef(input.persistAttachments);
  const operationQueueRef = useRef<Promise<void>>(Promise.resolve());
  const retryInFlightRef = useRef<Map<string, Promise<void>>>(new Map());
  const generationRef = useRef(createMaterialOperationGeneration());
  const pendingOperationCountRef = useRef(0);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const mountedRef = useRef(true);
  persistAttachmentsRef.current = input.persistAttachments;

  useEffect(() => setupMountedRefLifecycle(
    mountedRef,
    () => {
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
    retryInFlightRef.current.clear();
    attachmentSaveErrorsRef.current = {};
    setAttachments(initialAttachments);
    setMaterialStates(initialStates);
    setAttachmentSaveErrors({});

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
          .catch(reportOperationError(generation));
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
          .catch(reportOperationError(generation));
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
    const nextSaveErrors = retainAttachmentCheckpointErrors(
      attachmentSaveErrorsRef.current,
      nextAttachments,
    );
    attachmentsRef.current = nextAttachments;
    materialStatesRef.current = nextStates;
    attachmentSaveErrorsRef.current = nextSaveErrors;
    if (!mountedRef.current) return;
    setAttachments(nextAttachments);
    setMaterialStates(nextStates);
    setAttachmentSaveErrors(nextSaveErrors);
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
  function commitAttachmentSaveErrors(nextErrors: AttachmentCheckpointErrorMap) {
    attachmentSaveErrorsRef.current = nextErrors;
    if (mountedRef.current) setAttachmentSaveErrors(nextErrors);
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
    const context = {
      isCurrent: () => generationRef.current.isCurrent(generation),
    };
    const result = await persistAttachmentsRef.current(input, context);
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
          (message || !hasOutstandingErrors())
        ) setError(message);
      },
    });
  }
  async function checkpointAttachment(
    attachment: WechatPayApplymentAttachment,
    generation: number,
  ) {
    return checkpointApplymentAttachment({
      attachment,
      generation,
      isCurrent: generationRef.current.isCurrent,
      isCurrentAttachment: (candidate) =>
        isCurrentMaterialAttachment(attachmentsRef.current, candidate),
      persist: () => persist({
        attachments: attachmentsRef.current,
        draftUpdateSource: "attachment_change",
      }, generation),
      getErrors: () => attachmentSaveErrorsRef.current,
      commitErrors: commitAttachmentSaveErrors,
      removeUnpersisted: (objectKey) =>
        unpersistedObjectKeysRef.current.delete(objectKey),
      hasOutstandingErrors,
      reportError: setError,
      capabilityLoading: capabilityStatusRef.current === "loading",
      supportedDocumentTypes: supportedOcrDocumentTypesRef.current,
      markUnsupportedManual: () => markUnsupportedMaterialsManual(
        supportedOcrDocumentTypesRef.current,
        generation,
      ),
      recognize: () => recognizeAttachment(attachment, generation),
    });
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
    if (!hasOutstandingErrors()) setError("");
    return enqueue(
      async () => {
        await checkpointAttachment(uploaded.attachment, generation);
      },
      generation,
    );
  }
  async function onChange(
    nextAttachments: WechatPayApplymentAttachment[],
    options?: ApplymentAttachmentChangeOptions,
  ) {
    if (!input.editable) return;
    const generation = generationRef.current.current();
    const checkpointRuntime = createAttachmentChangeCheckpointRuntime({
      getAttachments: () => attachmentsRef.current,
      getMaterialStates: () => materialStatesRef.current,
      getCheckpointErrors: () => attachmentSaveErrorsRef.current,
      unpersistedObjectKeys: unpersistedObjectKeysRef.current,
      commitLocal: syncAttachments,
      commitCheckpointErrors: commitAttachmentSaveErrors,
    });
    return changeApplymentAttachments({
      currentAttachments: attachmentsRef.current,
      currentStates: materialStatesRef.current,
      nextAttachments,
      intent: options?.intent,
      relatedMutation: options?.relatedMutation,
      getCurrentAttachments: () => attachmentsRef.current,
      commitLocal: checkpointRuntime.commitLocal,
      getCurrentStates: () => materialStatesRef.current,
      commitStates: (states) => {
        if (generationRef.current.isCurrent(generation)) {
          commitMaterialStates(states);
        }
      },
      enqueue: (operation) => enqueue(operation, generation),
      isActive: () => generationRef.current.isCurrent(generation),
      captureRollback: checkpointRuntime.captureRollback,
      persist: (persistInput) => persist(persistInput, generation),
      clearError: () => {
        if (
          generationRef.current.isCurrent(generation) &&
          !hasOutstandingErrors()
        ) setError("");
      },
      reportError: (message) => {
        if (generationRef.current.isCurrent(generation)) setError(message);
      },
      reportOperationError: (operationError) => {
        reportOperationError(generation)(operationError);
      },
    });
  }
  async function onRetryRecognition(attachment: WechatPayApplymentAttachment) {
    if (!input.editable) return;
    const generation = generationRef.current.current();
    if (!hasOutstandingErrors()) setError("");
    return createRetryCoordinator(generation)
      .retryRecognition(attachment)
      .catch(reportOperationError(generation));
  }
  async function onRetrySave(attachment: WechatPayApplymentAttachment) {
    if (!input.editable) return;
    const generation = generationRef.current.current();
    return createRetryCoordinator(generation)
      .retrySave(attachment)
      .catch(reportOperationError(generation));
  }
  function createRetryCoordinator(generation: number) {
    return createApplymentAttachmentRetryCoordinator({
      inFlight: retryInFlightRef.current,
      getAttachments: () => attachmentsRef.current,
      getMaterialStates: () => materialStatesRef.current,
      getCheckpointErrors: () => attachmentSaveErrorsRef.current,
      enqueue: (operation) => enqueue(operation, generation),
      checkpoint: (attachment) => checkpointAttachment(attachment, generation),
      persist: (persistInput) => persist(persistInput, generation),
      isActive: () => generationRef.current.isCurrent(generation),
      commitState: (attachment, state) => {
        updateStateIfCurrent(attachment, state);
      },
      hasOutstandingErrors,
      clearError: () => setError(""),
      reportError: setError,
      recognize: (attachment) => recognizeAttachment(attachment, generation),
    });
  }
  function reportOperationError(generation: number) {
    return (operationError: unknown) => {
      reportGenerationGuardedError({
        generation,
        isCurrent: (candidate) =>
          mountedRef.current && generationRef.current.isCurrent(candidate),
        error: operationError,
        report: (currentError) => setError(getApplymentMaterialErrorMessage(
          currentError,
          "申请附件处理失败",
        )),
      });
    };
  }
  return {
    attachments,
    attachmentsRef,
    materialStates,
    attachmentSaveErrors,
    supportedOcrDocumentTypes,
    capabilitiesUnavailable: capabilityStatus === "unavailable",
    pending,
    error,
    onUploaded,
    onRetrySave,
    onRetryRecognition,
    onChange,
  };

  function hasOutstandingErrors() {
    return hasMaterialErrors(materialStatesRef.current) ||
      Object.keys(attachmentSaveErrorsRef.current).length > 0;
  }
}
