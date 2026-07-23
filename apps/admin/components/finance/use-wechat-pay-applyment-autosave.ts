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
import {
  ApplymentDraftFencingSession,
} from "./finance-wechat-pay-applyment-draft-session";
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
  session: ApplymentDraftFencingSession;
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
        let attemptedPayload = payload;
        try {
          const fencedPayload = await activeRuntime.session.allocate(payload);
          attemptedPayload = fencedPayload;
          await saveApplymentDraftWithCreateRecovery<
            WechatPayApplymentRecord,
            WechatPayApplymentDetailData
          >({
            getCurrent: () => activeRuntime.currentApplyment,
            payload: fencedPayload,
            isCurrent: context.isCurrent,
            adoptCreated: (applyment) => {
              activeRuntime.session.adoptCreated(applyment);
            },
            adoptRecovered: (applyment) => {
              activeRuntime.session.reset(applyment);
            },
            prepareRecoveredPayload: () =>
              activeRuntime.session.allocate(payload),
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
            lastFailedPayloadRef.current = attemptedPayload;
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
    const session = new ApplymentDraftFencingSession(async (applymentId) => {
      const detail = await requestBackendJson<WechatPayApplymentDetailData>(
        `/finance/wechat-pay/applyments/${applymentId}/draft-session`,
        {
          method: "POST",
          fallbackMessage: "认领微信支付开通申请草稿会话失败",
          keepalive: true,
        },
      );
      if (!detail.applyment) throw new ApplymentDraftSaveCancelledError();
      return detail.applyment;
    });
    session.reset(currentApplymentRef.current);
    runtime = {
      id: runtimeId,
      queue,
      coordinator: new ApplymentDraftAutosaveCoordinator(queue, 800),
      session,
      currentApplyment: currentApplymentRef.current,
    };
    runtimeRef.current = runtime;
    return runtime;
  }

  ensureAutosaveRuntime();

  useEffect(() => {
    const runtime = ensureAutosaveRuntime();
    runtime.coordinator.reset();
    runtime.session.reset(input.detail.applyment);
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
    runtime.coordinator.schedule({
      ...payload,
      draft_update_source: "autosave",
    });
  }

  function enqueueMaterialCheckpoint(
    payload: ApplymentDraftSavePayload,
  ): Promise<void> {
    const runtime = ensureAutosaveRuntime();
    return runtime.coordinator.checkpoint(payload);
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
