"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { StatusAlert } from "@/components/admin/status-alert";
import { Button } from "@/components/ui/button";
import { requestBackendJson } from "@/lib/backend-client";
import type { PlatformWechatPayApplymentDetailResult } from "./platform-wechat-pay-applyment-requests";

const AUTO_SYNC_STATUSES = new Set([
  "applying",
  "reviewing",
  "account_verifying",
  "signing",
  "opening",
]);

export function shouldAutoSyncWechatApplyment(
  status: string,
  syncActionAvailable: boolean,
) {
  return syncActionAvailable && AUTO_SYNC_STATUSES.has(status);
}

export function PlatformWechatPayApplymentSync({
  applymentId,
  status,
  enabled,
  disabled,
  onPendingChange,
}: {
  applymentId: string;
  status: string;
  enabled: boolean;
  disabled: boolean;
  onPendingChange: (pending: boolean) => void;
}) {
  const router = useRouter();
  const inFlightRef = useRef(false);
  const mountedRef = useRef(true);
  const abortControllerRef = useRef<AbortController | null>(null);
  const [pending, setPending] = useState(false);
  const [remoteStatus, setRemoteStatus] = useState(status);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const syncWechatStatus = useCallback(async (silent = false) => {
    if (!enabled || disabled || inFlightRef.current) return;
    inFlightRef.current = true;
    const abortController = new AbortController();
    abortControllerRef.current = abortController;
    setPending(true);
    onPendingChange(true);
    setError("");
    if (!silent) setSuccess("");
    try {
      const detail = await requestBackendJson<PlatformWechatPayApplymentDetailResult>(
        `/platform/finance/wechat-pay/applyments/${applymentId}/sync-wechat-status`,
        {
          method: "POST",
          body: JSON.stringify({}),
          signal: abortController.signal,
          fallbackMessage: "同步微信进件状态失败",
        },
      );
      if (!mountedRef.current) return;
      if (detail.applyment?.status) setRemoteStatus(detail.applyment.status);
      if (!silent) setSuccess("微信状态已同步");
      router.refresh();
    } catch (syncError) {
      if (!mountedRef.current || abortController.signal.aborted) return;
      setError(
        syncError instanceof Error
          ? syncError.message
          : "同步微信进件状态失败",
      );
    } finally {
      inFlightRef.current = false;
      if (abortControllerRef.current === abortController) {
        abortControllerRef.current = null;
      }
      if (mountedRef.current) {
        setPending(false);
        onPendingChange(false);
      }
    }
  }, [applymentId, disabled, enabled, onPendingChange, router]);

  useEffect(() => {
    setRemoteStatus(status);
  }, [status]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      abortControllerRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    if (
      disabled ||
      !shouldAutoSyncWechatApplyment(remoteStatus, enabled)
    ) return;

    const syncWhenVisible = () => {
      if (document.visibilityState === "visible") void syncWechatStatus(true);
    };
    const timer = window.setInterval(syncWhenVisible, 30_000);
    document.addEventListener("visibilitychange", syncWhenVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", syncWhenVisible);
    };
  }, [disabled, enabled, remoteStatus, syncWechatStatus]);

  if (!enabled) return null;

  return (
    <div className="flex flex-col gap-2">
      {error ? <StatusAlert>{error}</StatusAlert> : null}
      {success ? <StatusAlert tone="success">{success}</StatusAlert> : null}
      <Button
        type="button"
        variant="outline"
        className="w-full"
        disabled={pending || disabled}
        onClick={() => void syncWechatStatus(false)}
      >
        <RefreshCw
          className={pending ? "animate-spin" : undefined}
          data-icon="inline-start"
        />
        同步微信状态
      </Button>
    </div>
  );
}
