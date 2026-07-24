"use client";

import type { ChangeEvent } from "react";
import { Loader2, UploadCloud } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type {
  WechatPayApplymentAttachmentCategory,
} from "./finance-wechat-pay-applyment-shared";

const APPLYMENT_ATTACHMENT_ACCEPT = "image/jpeg,image/png";

export function ApplymentAttachmentUploadButton({
  category,
  inputId,
  disabled,
  uploading,
  label,
  onOpen,
  onUpload,
}: {
  category: WechatPayApplymentAttachmentCategory;
  inputId: string;
  disabled: boolean;
  uploading: boolean;
  label: string;
  onOpen: (inputId: string) => void;
  onUpload: (
    category: WechatPayApplymentAttachmentCategory,
    event: ChangeEvent<HTMLInputElement>,
  ) => void;
}) {
  return (
    <div>
      <Input
        id={inputId}
        className="sr-only !size-px"
        type="file"
        accept={APPLYMENT_ATTACHMENT_ACCEPT}
        tabIndex={-1}
        aria-hidden="true"
        disabled={disabled}
        onChange={(event) => onUpload(category, event)}
      />
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={disabled}
        onClick={() => onOpen(inputId)}
      >
        {uploading
          ? (
            <Loader2
              aria-hidden="true"
              className="animate-spin"
              data-icon="inline-start"
            />
          )
          : <UploadCloud aria-hidden="true" data-icon="inline-start" />}
        {label}
      </Button>
    </div>
  );
}
