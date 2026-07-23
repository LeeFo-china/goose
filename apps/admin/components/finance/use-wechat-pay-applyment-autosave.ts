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
  saveApplymentDraftWithCreateRecovery,
} from "./finance-wechat-pay-applyment-autosave-coordinator";
import type {
  WechatPayApplymentDetailData,
  WechatPayApplymentRecord,
} from "./finance-wechat-pay-applyment-shared";

type AutosaveRuntime = {
  id: symbol;
  queue: ApplymentDraftSaveQueue;
  coordinator: ApplymentDraftAutosaveCoordinator;
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
            keepalive: () => activeRuntime.coordinator.isDetaching,
            commitCurrent: (applyment) => {
              if (!context.isCurrent()) return;
              activeRuntime.currentApplyment = applyment;
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
      currentApplyment: currentApplymentRef.current,
    };
    runtimeRef.current = runtime;
    return runtime;
  }

  ensureAutosaveRuntime();

  useEffect(() => {
    const runtime = ensureAutosaveRuntime();
    runtime.coordinator.reset();
    runtime.currentApplyment = input.detail.applyment;
    currentDetailRef.current = input.detail;
    currentApplymentRef.current = input.detail.applyment;
    setCurrentDetail(input.detail);
    lastFailedPayloadRef.current = null;
    setSaveState("idle");
    setSaveError("");
  }, [input.detail, input.resetKey]);

  useEffect(() => {
    mountedRef.current = true;
    const runtime = ensureAutosaveRuntime();
    const detachRuntime = () => {
      mountedRef.current = false;
      if (runtimeRef.current?.id === runtime.id) {
        runtimeRef.current = null;
      }
      void runtime.coordinator.detach().catch(() => undefined);
    };
    window.addEventListener("pagehide", detachRuntime);
    return () => {
      window.removeEventListener("pagehide", detachRuntime);
      detachRuntime();
    };
  }, []);

  function markDraftSaveScheduled(): void {
    if (!mountedRef.current) return;
    setSaveState((state) => state === "failed" ? state : "saving");
  }

  function scheduleDraftSave(payload: ApplymentDraftSavePayload): void {
    markDraftSaveScheduled();
    ensureAutosaveRuntime().coordinator.schedule({
      ...payload,
      draft_update_source: "autosave",
    });
  }

  function enqueueMaterialCheckpoint(
    payload: ApplymentDraftSavePayload,
  ): Promise<void> {
    return ensureAutosaveRuntime().coordinator.checkpoint(payload);
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
