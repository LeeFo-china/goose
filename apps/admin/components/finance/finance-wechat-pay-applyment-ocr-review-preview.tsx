"use client";

import { useEffect, useState } from "react";
import { FileImage, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyMedia,
} from "@/components/ui/empty";
import {
  buildWechatPayApplymentAttachmentPreviewUrl,
  getWechatPayApplymentAttachmentDisplayName,
  type WechatPayApplymentAttachment,
} from "./finance-wechat-pay-applyment-shared";

export function FinanceWechatPayApplymentOcrReviewPreview({
  attachment,
  statusLabel,
}: {
  attachment?: WechatPayApplymentAttachment;
  statusLabel: string;
}) {
  const [attempt, setAttempt] = useState(0);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setAttempt(0);
    setFailed(false);
  }, [attachment?.object_key]);

  if (!attachment) {
    return (
      <Empty className="aspect-[4/3] border bg-muted/30">
        <EmptyMedia variant="icon">
          <FileImage aria-hidden="true" />
        </EmptyMedia>
        <EmptyDescription>请先上传该资料</EmptyDescription>
      </Empty>
    );
  }
  const previewUrl = buildWechatPayApplymentAttachmentPreviewUrl(attachment);
  const displayName = getWechatPayApplymentAttachmentDisplayName(attachment);
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <div className="flex aspect-[4/3] items-center justify-center overflow-hidden rounded-md border bg-muted/30">
        {previewUrl && !failed ? (
          <img
            key={attempt}
            src={previewUrl}
            alt={displayName}
            className="size-full object-contain"
            loading="lazy"
            referrerPolicy="no-referrer"
            onError={() => setFailed(true)}
          />
        ) : (
          <Empty>
            <EmptyMedia variant="icon">
              <FileImage aria-hidden="true" />
            </EmptyMedia>
            <EmptyDescription>预览加载失败</EmptyDescription>
            {previewUrl ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  setAttempt((value) => value + 1);
                  setFailed(false);
                }}
              >
                <RefreshCw data-icon="inline-start" />
                重试预览
              </Button>
            ) : null}
          </Empty>
        )}
      </div>
      <div className="truncate text-sm">{displayName}</div>
      <div className="text-xs text-muted-foreground">
        {statusLabel}，私有附件仅供当前核对
      </div>
    </div>
  );
}
