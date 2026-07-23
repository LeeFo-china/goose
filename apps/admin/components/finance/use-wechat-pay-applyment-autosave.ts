"use client";

import { useEffect, useRef, useState } from "react";

import { requestBackendJson } from "@/lib/backend-client";

import {
  ApplymentDraftSaveCancelledError,
  ApplymentDraftSaveQueue,
  isApplymentDraftSaveCancelledError,
  type ApplymentDraftSavePayload,
  type ApplymentDraftSaveState,
} from "./finance-wechat-pay-applyment-autosave";
import {
  ApplymentDraftAutosaveCoordinator,
  ApplymentDraftRevisionAllocator,
  saveApplymentDraftWithCreateRecovery,
} from "./finance-wechat-pay-applyment-autosave-coordinator";
import {
  createApplymentAutosavePageLifecycle,
} from "./finance-wechat-pay-applyment-lifecycle";
import type {
  WechatPayApplymentDetailData,
  WechatPayApplymentRecord,
} from "./finance-wechat-pay-applyment-shared";

type AutosaveRuntime = {
  id: symbol;
  queue: ApplymentDraftSaveQueue;
  coordinator: ApplymentDraftAutosaveCoordinator;
  revisions: ApplymentDraftRevisionAllocator;
  currentApplyment: WechatPayApplymentRecord | null;
};

export function useWechatPayApplymentAutosave(input: {
  detail: WechatPayApplymentDetailData;
  resetKey: string;
}) {
  const [currentDetail, setCurrentDetail] =
    useState<WechatPayApplymentDetailData>(input.detail);
  const currentDetailRef =
    useRef<WechatPayApplymentDetailData>(input.detail);
  const currentApplymentRef =
    useRef<WechatPayApplymentRecord | null>(input.detail.applyment);
  const [saveState, setSaveState] =
    useState<ApplymentDraftSaveState>("idle");
  const [saveError, setSaveError] = useState("");
  const lastFailedPayloadRef = useRef<ApplymentDraftSavePayload | null>(null);
  const runtimeRef = useRef<AutosaveRuntime | null>(null);
  const mountedRef = useRef(false);

  function ensureAutosaveRuntime(): AutosaveRuntime {
    if (runtimeRef.current) return runtimeRef.current;
    const runtimeId = Symbol("wechat-pay-applyment-autosave");
    let runtime: AutosaveRuntime | null = null;
    const queue = new ApplymentDraftSaveQueue(
      async (payload, context) => {
        const activeRuntime = runtime;
        if (!activeRuntime) {
          throw new ApplymentDraftSaveCancelledError();
        }
        const isAttached = () =>
          mountedRef.current &&
          runtimeRef.current?.id === activeRuntime.id;
        if (context.isCurrent() && isAttached()) {
          setSaveState("saving");
          setSaveError("");
        }
        try {
          await saveApplymentDraftWithCreateRecovery<
            WechatPayApplymentRecord,
            WechatPayApplymentDetailData
          >({
            getCurrent: () => activeRuntime.currentApplyment,
            payload,
            isCurrent: context.isCurrent,
            commitCurrent: (applyment) => {
              if (!context.isCurrent()) return;
              activeRuntime.currentApplyment = applyment;
              activeRuntime.revisions.absorb(applyment.draft_revision);
              if (isAttached()) currentApplymentRef.current = applyment;
            },
            shouldCommitDetail: () =>
              isAttached() &&
              activeRuntime.coordinator.isLatestPayload(payload),
            commitDetail: (detail) => {
              if (!context.isCurrent() || !isAttached()) return;
              currentDetailRef.current = detail;
              currentApplymentRef.current = detail.applyment;
              setCurrentDetail(detail);
            },
            request: (path, init) =>
              requestBackendJson<WechatPayApplymentDetailData>(path, init),
          });
          if (
            !context.isCurrent() ||
            !isAttached() ||
            !activeRuntime.coordinator.isLatestPayload(payload)
          ) return;
          lastFailedPayloadRef.current = null;
          setSaveState("saved");
        } catch (error) {
          if (
            context.isCurrent() &&
            isAttached() &&
            activeRuntime.coordinator.isLatestPayload(payload) &&
            !isApplymentDraftSaveCancelledError(error)
          ) {
            lastFailedPayloadRef.current = payload;
            setSaveError(
              error instanceof Error
                ? error.message
                : "微信支付开通申请保存失败",
            );
            setSaveState("failed");
          }
          throw error;
        }
      },
    );
    runtime = {
      id: runtimeId,
      queue,
      coordinator: new ApplymentDraftAutosaveCoordinator(queue, 800),
      revisions: new ApplymentDraftRevisionAllocator(
        currentApplymentRef.current?.draft_revision,
      ),
      currentApplyment: currentApplymentRef.current,
    };
    runtimeRef.current = runtime;
    return runtime;
  }

  ensureAutosaveRuntime();

  useEffect(() => {
    const runtime = ensureAutosaveRuntime();
    runtime.coordinator.reset();
    runtime.revisions.reset(input.detail.applyment?.draft_revision);
    runtime.currentApplyment = input.detail.applyment;
    currentDetailRef.current = input.detail;
    currentApplymentRef.current = input.detail.applyment;
    setCurrentDetail(input.detail);
    lastFailedPayloadRef.current = null;
    setSaveState("idle");
    setSaveError("");
  }, [input.detail, input.resetKey]);

  useEffect(() => {
    const runtime = ensureAutosaveRuntime();
    const lifecycle = createApplymentAutosavePageLifecycle({
      mountedRef,
      flush: () => runtime.coordinator.flush(),
      detach: async () => {
        if (runtimeRef.current?.id === runtime.id) {
          runtimeRef.current = null;
        }
        await runtime.coordinator.detach();
      },
      restore: () => {
        if (!runtimeRef.current && !runtime.coordinator.isDetaching) {
          runtimeRef.current = runtime;
        }
      },
    });
    lifecycle.mount();
    const handlePageHide = (event: PageTransitionEvent) => {
      void lifecycle.pageHide(event).catch(() => undefined);
    };
    const handlePageShow = (event: PageTransitionEvent) => {
      lifecycle.pageShow(event);
    };
    window.addEventListener("pagehide", handlePageHide);
    window.addEventListener("pageshow", handlePageShow);
    return () => {
      window.removeEventListener("pagehide", handlePageHide);
      window.removeEventListener("pageshow", handlePageShow);
      void lifecycle.unmount().catch(() => undefined);
    };
  }, []);

  function markDraftSaveScheduled(): void {
    if (!mountedRef.current) return;
    setSaveState((state) => state === "failed" ? state : "saving");
  }

  function scheduleDraftSave(payload: ApplymentDraftSavePayload): void {
    markDraftSaveScheduled();
    const runtime = ensureAutosaveRuntime();
    runtime.coordinator.schedule(runtime.revisions.allocate({
      ...payload,
      draft_update_source: "autosave",
    }));
  }

  function enqueueMaterialCheckpoint(
    payload: ApplymentDraftSavePayload,
  ): Promise<void> {
    const runtime = ensureAutosaveRuntime();
    return runtime.coordinator.checkpoint(
      runtime.revisions.allocate(payload),
    );
  }

  function flushDraftSaves(): Promise<void> {
    return ensureAutosaveRuntime().coordinator.flush();
  }

  function retryLastSave(): Promise<void> {
    const payload = lastFailedPayloadRef.current;
    if (!payload) return Promise.resolve();
    return ensureAutosaveRuntime().coordinator.retry(payload);
  }

  return {
    currentDetail,
    currentDetailRef,
    currentApplyment: currentDetail.applyment,
    currentApplymentRef,
    canEdit: currentDetail.can_edit,
    canSubmit: currentDetail.can_submit,
    saveState,
    saveError,
    scheduleDraftSave,
    enqueueMaterialCheckpoint,
    flushDraftSaves,
    retryLastSave,
  };
}
