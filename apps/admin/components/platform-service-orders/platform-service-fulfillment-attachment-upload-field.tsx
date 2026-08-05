"use client";

import {
  type ChangeEvent,
  type Dispatch,
  type SetStateAction,
  useRef,
  useState,
} from "react";
import { Loader2, Paperclip, Trash2, Upload } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { uploadDirectToCos, validateUploadFile } from "@/lib/cos-direct-upload";

const FULFILLMENT_ATTACHMENT_UPLOAD_SCENE =
  "tenant_service_fulfillment_attachment";
const FULFILLMENT_ATTACHMENT_MAX_COUNT = 10;
const FULFILLMENT_ATTACHMENT_MAX_SIZE_BYTES = 10 * 1024 * 1024;
const FULFILLMENT_ATTACHMENT_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
]);
const FULFILLMENT_ATTACHMENT_ACCEPT =
  ".jpg,.jpeg,.png,.webp,.pdf,image/jpeg,image/png,image/webp,application/pdf";

export type UploadedFulfillmentAttachment = {
  id: string;
  fileId: string;
  name: string;
  sizeBytes: number;
  mimeType: string;
};

export function PlatformServiceFulfillmentAttachmentUploadField({
  inputId,
  disabled,
  attachments,
  onAttachmentsChange,
  onUploadingChange,
}: {
  inputId: string;
  disabled: boolean;
  attachments: UploadedFulfillmentAttachment[];
  onAttachmentsChange: Dispatch<
    SetStateAction<UploadedFulfillmentAttachment[]>
  >;
  onUploadingChange: (uploading: boolean) => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploadingState] = useState(false);
  const [uploadError, setUploadError] = useState("");

  function setUploading(nextUploading: boolean) {
    setUploadingState(nextUploading);
    onUploadingChange(nextUploading);
  }

  async function handleAttachmentChange(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files || []);
    event.target.value = "";
    if (files.length === 0 || disabled || uploading) return;

    setUploadError("");
    if (attachments.length + files.length > FULFILLMENT_ATTACHMENT_MAX_COUNT) {
      setUploadError(`履约附件最多上传 ${FULFILLMENT_ATTACHMENT_MAX_COUNT} 个`);
      return;
    }

    setUploading(true);
    try {
      const uploaded: UploadedFulfillmentAttachment[] = [];
      for (const file of files) {
        validateUploadFile(file, {
          allowedTypes: FULFILLMENT_ATTACHMENT_MIME_TYPES,
          maxSizeBytes: FULFILLMENT_ATTACHMENT_MAX_SIZE_BYTES,
          typeMessage: "履约附件仅支持 JPG、PNG、WebP 或 PDF",
          sizeMessage: "单个履约附件不能超过 10MB",
        });
        const result = await uploadDirectToCos(file, {
          scene: FULFILLMENT_ATTACHMENT_UPLOAD_SCENE,
          uploadErrorLabel: "履约附件",
          initFallbackMessage: "初始化履约附件上传失败",
          completeFallbackMessage: "登记履约附件失败",
          missingStorageMessage: "附件上传成功但未返回 file_id",
        });
        if (!result.fileId) throw new Error("附件上传成功但未返回 file_id");
        uploaded.push({
          id: `${result.fileId}-${file.name}`,
          fileId: result.fileId,
          name: file.name,
          sizeBytes: file.size,
          mimeType: file.type || "application/octet-stream",
        });
      }
      onAttachmentsChange((current) => [...current, ...uploaded]);
    } catch (caught) {
      setUploadError(caught instanceof Error ? caught.message : "上传履约附件失败");
    } finally {
      setUploading(false);
    }
  }

  function removeAttachment(fileId: string) {
    onAttachmentsChange((current) =>
      current.filter((attachment) => attachment.fileId !== fileId)
    );
  }

  return (
    <Field>
      <FieldLabel htmlFor={inputId}>履约附件</FieldLabel>
      <Input
        ref={fileInputRef}
        id={inputId}
        className="hidden"
        type="file"
        accept={FULFILLMENT_ATTACHMENT_ACCEPT}
        multiple
        onChange={(event) => void handleAttachmentChange(event)}
        disabled={disabled || uploading ||
          attachments.length >= FULFILLMENT_ATTACHMENT_MAX_COUNT}
      />
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={() => fileInputRef.current?.click()}
          disabled={disabled || uploading ||
            attachments.length >= FULFILLMENT_ATTACHMENT_MAX_COUNT}
        >
          {uploading
            ? <Loader2 className="animate-spin" data-icon="inline-start" />
            : <Upload data-icon="inline-start" />}
          {uploading ? "上传中" : "上传附件"}
        </Button>
        <span className="text-xs text-muted-foreground">
          JPG/PNG/WebP/PDF，单个不超过 10MB，最多 10 个
        </span>
      </div>
      {attachments.length > 0 ? (
        <div className="rounded-md border bg-muted/20">
          {attachments.map((attachment) => (
            <div
              key={attachment.fileId}
              className="flex items-center gap-3 border-b px-3 py-2 last:border-b-0"
            >
              <Paperclip className="size-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm">{attachment.name}</div>
                <div className="text-xs text-muted-foreground">
                  {attachment.mimeType} · {formatFileSize(attachment.sizeBytes)}
                </div>
              </div>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                onClick={() => removeAttachment(attachment.fileId)}
                disabled={disabled || uploading}
                aria-label={`移除附件 ${attachment.name}`}
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
          ))}
        </div>
      ) : null}
      {uploadError ? <FieldError>{uploadError}</FieldError> : null}
    </Field>
  );
}

function formatFileSize(sizeBytes: number) {
  if (sizeBytes >= 1024 * 1024) {
    return `${(sizeBytes / 1024 / 1024).toFixed(1)} MB`;
  }
  return `${Math.max(1, Math.ceil(sizeBytes / 1024))} KB`;
}
