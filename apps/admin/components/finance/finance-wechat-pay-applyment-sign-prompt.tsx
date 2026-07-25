"use client";

import { useState } from "react";
import { Copy, ExternalLink } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

import type {
  WechatPayApplymentAvailableAction,
  WechatPayApplymentRecord,
} from "./finance-wechat-pay-applyment-shared";

export function FinanceWechatPayApplymentSignPrompt({
  applyment,
  availableActions,
}: {
  applyment: WechatPayApplymentRecord | null;
  availableActions: WechatPayApplymentAvailableAction[];
}) {
  const [copyMessage, setCopyMessage] = useState("");
  const actionUrl = getWechatPayApplymentSignAction(availableActions)?.url
    ?.trim();
  if (!applyment || !actionUrl) return null;
  const signUrl: string = actionUrl;

  const superAdminName = applyment.super_admin_name?.trim() ||
    "申请单超级管理员";

  async function handleCopySignUrl() {
    try {
      await navigator.clipboard.writeText(signUrl);
      setCopyMessage("签约链接已复制，请发送给申请单超级管理员使用微信打开。");
    } catch {
      setCopyMessage("签约链接复制失败，请打开链接后从浏览器地址栏复制。");
    }
  }

  return (
    <Alert data-testid="tenant-wechat-pay-sign-prompt">
      <ExternalLink aria-hidden="true" />
      <AlertTitle>待超级管理员签约</AlertTitle>
      <AlertDescription className="flex flex-col gap-3">
        <p>
          请 {superAdminName} 使用微信打开签约链接，按微信支付页面指引完成账户验证和签约。
        </p>
        <div className="flex flex-wrap gap-2">
          <Button asChild>
            <a href={signUrl} target="_blank" rel="noreferrer">
              <ExternalLink data-icon="inline-start" />
              打开签约链接
            </a>
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => void handleCopySignUrl()}
          >
            <Copy data-icon="inline-start" />
            复制签约链接
          </Button>
        </div>
        {copyMessage ? (
          <span className="text-xs text-muted-foreground">{copyMessage}</span>
        ) : null}
      </AlertDescription>
    </Alert>
  );
}

export function getWechatPayApplymentSignAction(
  availableActions: readonly WechatPayApplymentAvailableAction[],
) {
  return availableActions.find((action) =>
    action.key === "open_sign_url" && hasText(action.url)
  ) ?? null;
}

function hasText(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}
