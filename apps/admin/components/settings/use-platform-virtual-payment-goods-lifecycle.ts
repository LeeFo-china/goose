"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  isGoodsLifecycleProcessing,
  nextGoodsPollDelay,
} from "@/components/settings/platform-virtual-payment-goods-flow-data";
import {
  type SafeVirtualPaymentMutationFeedback,
  toSafeVirtualPaymentMutationFeedback,
} from "@/components/settings/platform-virtual-payment-errors";
import { createLatestRefreshCoordinator } from
  "@/components/settings/platform-virtual-payment-refresh-coordinator";
import type {
  PlatformVirtualGoodsActionResult,
  PlatformVirtualGoodsLifecycleSnapshot,
} from "@/components/settings/platform-virtual-payment-settings-types";
import { requestBackendJson } from "@/lib/backend-client";
import type { BrandingVirtualPaymentEnvironment } from "@gooes/domain";

const SETTINGS_PATH = "/platform/payment/wechat-virtual/branding-entitlement";

export function usePlatformVirtualPaymentGoodsLifecycle({
  environment,
  mappingVersion,
}: {
  environment: BrandingVirtualPaymentEnvironment;
  mappingVersion: number | null;
}) {
  const [snapshot, setSnapshot] =
    useState<PlatformVirtualGoodsLifecycleSnapshot | null>(null);
  const [loading, setLoading] = useState(false);
  const [pollExhausted, setPollExhausted] = useState(false);
  const [feedback, setFeedback] =
    useState<SafeVirtualPaymentMutationFeedback | null>(null);
  const refreshCoordinator = useRef(createLatestRefreshCoordinator());
  const pollAttempts = useRef(0);

  const refreshStatus = useCallback(
    async function refreshStatus(): Promise<boolean> {
      if (mappingVersion === null) {
        setSnapshot(null);
        setLoading(false);
        return false;
      }
      let failure: unknown;
      setLoading(true);
      return refreshCoordinator.current.run(
        async () => {
          try {
            return await requestBackendJson<PlatformVirtualGoodsLifecycleSnapshot>(
              `${SETTINGS_PATH}/${environment}/goods-status`,
              { fallbackMessage: "微信商品状态加载失败" },
            );
          } catch (caught) {
            failure = caught;
            throw caught;
          }
        },
        {
          onSuccess: (result) => {
            if (result.mapping_version !== mappingVersion) {
              setSnapshot(null);
              setFeedback({ message: "商品映射版本已变化，请刷新配置后重试。" });
            } else {
              setSnapshot(result);
            }
            setLoading(false);
          },
          onError: () => {
            setFeedback(toSafeVirtualPaymentMutationFeedback(
              failure,
              "微信商品状态加载失败，请稍后重试。",
            ));
            setLoading(false);
          },
        },
      );
    },
    [environment, mappingVersion],
  );

  useEffect(() => {
    refreshCoordinator.current.invalidate();
    pollAttempts.current = 0;
    setPollExhausted(false);
    setFeedback(null);
    setSnapshot(null);
    if (mappingVersion !== null) void refreshStatus();
    return () => refreshCoordinator.current.invalidate();
  }, [mappingVersion, refreshStatus]);

  useEffect(() => {
    const processing = isGoodsLifecycleProcessing(snapshot);
    const delay = nextGoodsPollDelay({
      processing,
      attempts: pollAttempts.current,
      serverDelayMs: snapshot?.poll_after_ms ?? null,
    });
    if (processing && delay === null && pollAttempts.current >= 15) {
      setPollExhausted(true);
      return;
    }
    if (delay === null) return;
    const timer = window.setTimeout(() => {
      pollAttempts.current += 1;
      void refreshStatus();
    }, delay);
    return () => window.clearTimeout(timer);
  }, [refreshStatus, snapshot]);

  async function refresh() {
    pollAttempts.current = 0;
    setPollExhausted(false);
    setFeedback(null);
    await refreshStatus();
  }

  async function startCommand(
    phase: "upload" | "publish",
    path: string,
  ): Promise<boolean> {
    if (mappingVersion === null) {
      setFeedback({ message: "请先保存当前环境的虚拟商品映射。" });
      return false;
    }
    setFeedback(null);
    try {
      await requestBackendJson<PlatformVirtualGoodsActionResult>(path, {
        method: "POST",
        body: JSON.stringify({ version: mappingVersion }),
        fallbackMessage: phase === "upload"
          ? "微信商品上传启动失败"
          : "微信商品发布启动失败",
      });
    } catch (caught) {
      setFeedback(toSafeVirtualPaymentMutationFeedback(
        caught,
        phase === "upload"
          ? "微信商品上传启动失败，请核对配置。"
          : "微信商品发布启动失败，请核对状态。",
      ));
      await refreshStatus();
      return false;
    }
    pollAttempts.current = 0;
    setPollExhausted(false);
    return refreshStatus();
  }

  function startUpload() {
    return startCommand(
      "upload",
      `${SETTINGS_PATH}/${environment}/goods/upload`,
    );
  }

  function startPublish() {
    return startCommand(
      "publish",
      `${SETTINGS_PATH}/${environment}/goods/publish`,
    );
  }

  return {
    snapshot,
    loading,
    pollExhausted,
    feedback,
    clearFeedback: () => setFeedback(null),
    refresh,
    startUpload,
    startPublish,
  };
}
