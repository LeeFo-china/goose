"use client";

import { useState } from "react";
import { FileImage, RefreshCw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  buildWechatPayApplymentAttachmentPreviewUrl,
  formatWechatPayApplymentAttachmentSize,
  getWechatPayApplymentAttachmentDisplayName,
  type WechatPayApplymentAttachment,
} from "./finance-wechat-pay-applyment-shared";

export function AttachmentPreviewCard({
  attachment,
  editable,
  busy,
  onRemove,
}: {
  attachment: WechatPayApplymentAttachment;
  editable: boolean;
  busy: boolean;
  onRemove: (attachment: WechatPayApplymentAttachment) => void;
}) {
  const displayName = getWechatPayApplymentAttachmentDisplayName(attachment);
  return (
    <div className="min-w-0 rounded-md bg-muted/50 p-3">
      <AttachmentPreviewDialog attachment={attachment} />
      <div className="mt-2 truncate text-sm">
        {displayName}
      </div>
      <div className="mt-1 text-xs text-muted-foreground">
        {formatWechatPayApplymentAttachmentSize(attachment.size) || "已上传"}
      </div>
      {editable ? (
        <div className="mt-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={busy}
            onClick={() => onRemove(attachment)}
          >
            <Trash2 data-icon="inline-start" />
            移除
          </Button>
        </div>
      ) : null}
    </div>
  );
}

export function AttachmentPreviewDialog({
  attachment,
}: {
  attachment: WechatPayApplymentAttachment;
}) {
  const previewUrl = buildWechatPayApplymentAttachmentPreviewUrl(attachment);
  const displayName = getWechatPayApplymentAttachmentDisplayName(attachment);
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          className="h-auto w-full p-0"
          aria-label={`预览${displayName}`}
        >
          <span className="relative flex h-40 w-full items-center justify-center overflow-hidden rounded-md border bg-background sm:h-48">
            <FileImage aria-hidden="true" className="text-muted-foreground" />
            <PreviewImage
              previewUrl={previewUrl}
              displayName={displayName}
              className="absolute inset-0 size-full object-contain"
            />
          </span>
        </Button>
      </DialogTrigger>
      <DialogContent className="w-[calc(100vw-2rem)] max-w-4xl">
        <DialogHeader>
          <DialogTitle className="break-all">{displayName}</DialogTitle>
          <DialogDescription>
            已上传。私有附件短时预览，仅用于当前资料核对。
          </DialogDescription>
        </DialogHeader>
        <div className="flex max-h-[70vh] min-h-64 items-center justify-center overflow-hidden rounded-md border bg-muted/30">
          <PreviewImage
            previewUrl={previewUrl}
            displayName={displayName}
            className="max-h-[70vh] w-full object-contain"
            retryable
          />
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="outline">关闭</Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PreviewImage({
  previewUrl,
  displayName,
  className,
  retryable = false,
}: {
  previewUrl: string;
  displayName: string;
  className: string;
  retryable?: boolean;
}) {
  const [attempt, setAttempt] = useState(0);
  const [failed, setFailed] = useState(false);
  if (!previewUrl) {
    return <p className="text-sm text-muted-foreground">预览暂不可用</p>;
  }
  if (failed) {
    return (
      <div className="relative z-10 flex flex-col items-center gap-2 p-3 text-center">
        <p className="text-sm text-muted-foreground">预览加载失败</p>
        {retryable ? (
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
      </div>
    );
  }
  return (
    <img
      key={attempt}
      src={previewUrl}
      alt={displayName}
      className={className}
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
    />
  );
}
