"use client";

import { useEffect, useRef, useState } from "react";

import { requestBackendJson } from "@/lib/backend-client";

import {
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
  queue: ApplymentDraftSaveQueue;
  coordinator: ApplymentDraftAutosaveCoordinator;
};

export function useWechatPayApplymentAutosave(input: {
  applyment: WechatPayApplymentRecord | null;
  resetKey: string;
}) {
  const [currentApplyment, setCurrentApplyment] =
    useState<WechatPayApplymentRecord | null>(input.applyment);
  const currentApplymentRef =
    useRef<WechatPayApplymentRecord | null>(input.applyment);
  const [saveState, setSaveState] =
    useState<ApplymentDraftSaveState>("idle");
  const [saveError, setSaveError] = useState("");
  const lastFailedPayloadRef = useRef<ApplymentDraftSavePayload | null>(null);
  const runtimeRef = useRef<AutosaveRuntime | null>(null);

  function ensureAutosaveRuntime(): AutosaveRuntime {
    if (runtimeRef.current) return runtimeRef.current;
    const queue = new ApplymentDraftSaveQueue(
      async (payload, context) => {
        if (context.isCurrent()) {
          setSaveState("saving");
          setSaveError("");
        }
        try {
          await saveApplymentDraftWithCreateRecovery<WechatPayApplymentRecord>({
            getCurrent: () => currentApplymentRef.current,
            payload,
            isCurrent: context.isCurrent,
            commitCurrent: (applyment) => {
              if (!context.isCurrent()) return;
              currentApplymentRef.current = applyment;
              setCurrentApplyment(applyment);
            },
            request: (path, init) =>
              requestBackendJson<WechatPayApplymentDetailData>(path, init),
          });
          if (!context.isCurrent()) return;
          lastFailedPayloadRef.current = null;
          setSaveState("saved");
        } catch (error) {
          if (
            context.isCurrent() &&
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
    const runtime = {
      queue,
      coordinator: new ApplymentDraftAutosaveCoordinator(queue, 800),
    };
    runtimeRef.current = runtime;
    return runtime;
  }

  ensureAutosaveRuntime();

  useEffect(() => {
    ensureAutosaveRuntime().coordinator.reset();
    currentApplymentRef.current = input.applyment;
    setCurrentApplyment(input.applyment);
    lastFailedPayloadRef.current = null;
    setSaveState("idle");
    setSaveError("");
  }, [input.applyment, input.resetKey]);

  useEffect(() => {
    ensureAutosaveRuntime();
    return () => {
      const runtime = runtimeRef.current;
      runtimeRef.current = null;
      runtime?.coordinator.dispose();
    };
  }, []);

  function scheduleDraftSave(payload: ApplymentDraftSavePayload): void {
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
    return enqueueMaterialCheckpoint(payload);
  }

  return {
    currentApplyment,
    currentApplymentRef,
    saveState,
    saveError,
    scheduleDraftSave,
    enqueueMaterialCheckpoint,
    flushDraftSaves,
    retryLastSave,
  };
}
