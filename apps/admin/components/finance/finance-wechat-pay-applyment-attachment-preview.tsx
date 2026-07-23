"use client";

import { FileImage, Trash2 } from "lucide-react";
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
  return (
    <div className="min-w-0 rounded-md bg-muted/50 p-3">
      <AttachmentPreviewDialog attachment={attachment} />
      <div className="mt-2 truncate text-sm">
        {attachment.file_name || attachment.object_key}
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
  const previewUrl = buildWechatPayApplymentAttachmentPreviewUrl(
    attachment.object_key,
  );
  const fileName = attachment.file_name || attachment.object_key;
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          className="h-auto w-full p-0"
          aria-label={`预览${fileName}`}
        >
          <span className="relative flex aspect-[4/3] w-full items-center justify-center overflow-hidden rounded-md border bg-background">
            <FileImage aria-hidden="true" className="text-muted-foreground" />
            <img
              src={previewUrl}
              alt={fileName}
              className="absolute inset-0 size-full object-contain"
              referrerPolicy="no-referrer"
            />
          </span>
        </Button>
      </DialogTrigger>
      <DialogContent className="w-[calc(100vw-2rem)] max-w-4xl">
        <DialogHeader>
          <DialogTitle className="break-all">{fileName}</DialogTitle>
          <DialogDescription>
            私有附件短时预览，仅用于当前资料核对。
          </DialogDescription>
        </DialogHeader>
        <div className="flex max-h-[70vh] min-h-64 items-center justify-center overflow-hidden rounded-md border bg-muted/30">
          <img
            src={previewUrl}
            alt={fileName}
            className="max-h-[70vh] w-full object-contain"
            referrerPolicy="no-referrer"
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
