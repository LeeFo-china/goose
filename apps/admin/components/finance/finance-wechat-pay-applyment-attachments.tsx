"use client";

import { type ChangeEvent, useState } from "react";
import { ExternalLink, FileImage, Loader2, Trash2, UploadCloud } from "lucide-react";
import { StatusAlert } from "@/components/admin/status-alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { uploadDirectToCos, validateUploadFile } from "@/lib/cos-direct-upload";
import {
  buildWechatPayApplymentAttachmentPreviewUrl,
  formatWechatPayApplymentAttachmentSize,
  getWechatPayApplymentAttachmentCategoryLabel,
  type WechatPayApplymentAttachment,
  type WechatPayApplymentAttachmentCategory,
} from "./finance-wechat-pay-applyment-shared";

const APPLYMENT_ATTACHMENT_UPLOAD_SCENE = "wechat_pay_applyment";
const MAX_APPLYMENT_ATTACHMENT_SIZE = 5 * 1024 * 1024;
const APPLYMENT_ATTACHMENT_ACCEPT = "image/jpeg,image/png,image/webp,image/heic,image/heif";
const APPLYMENT_ATTACHMENT_ALLOWED_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
]);

const APPLYMENT_ATTACHMENT_SLOTS: Array<{
  category: WechatPayApplymentAttachmentCategory;
  required: boolean;
  description: string;
}> = [
  {
    category: "license_copy",
    required: true,
    description: "上传营业执照清晰照片或扫描件。",
  },
  {
    category: "legal_representative_id_card_front",
    required: true,
    description: "上传法人身份证人像面清晰照片。",
  },
  {
    category: "legal_representative_id_card_back",
    required: true,
    description: "上传法人身份证国徽面清晰照片。",
  },
  {
    category: "settlement_account_proof",
    required: false,
    description: "可上传开户许可证、银行卡或银行账户证明。",
  },
  {
    category: "business_scene_material",
    required: false,
    description: "可上传门店、经营场景或小程序服务截图。",
  },
];

export function WechatPayApplymentAttachmentsField({
  attachments,
  editable,
  disabled,
  onChange,
}: {
  attachments: WechatPayApplymentAttachment[];
  editable: boolean;
  disabled?: boolean;
  onChange: (attachments: WechatPayApplymentAttachment[]) => void;
}) {
  const [uploadingCategory, setUploadingCategory] = useState<string | null>(null);
  const [error, setError] = useState("");
  const busy = disabled || Boolean(uploadingCategory);

  async function uploadAttachment(
    category: WechatPayApplymentAttachmentCategory,
    event: ChangeEvent<HTMLInputElement>,
  ) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    setError("");
    setUploadingCategory(category);
    try {
      validateUploadFile(file, {
        allowedTypes: APPLYMENT_ATTACHMENT_ALLOWED_TYPES,
        maxSizeBytes: MAX_APPLYMENT_ATTACHMENT_SIZE,
        typeMessage: "仅支持 jpg、png、webp、heic、heif 图片",
        sizeMessage: "单个申请附件不能超过 5MB",
      });
      const uploaded = await uploadDirectToCos(file, {
        scene: APPLYMENT_ATTACHMENT_UPLOAD_SCENE,
        uploadErrorLabel: getWechatPayApplymentAttachmentCategoryLabel(category),
      });
      const nextAttachment: WechatPayApplymentAttachment = {
        category,
        object_key: uploaded.storagePath,
        file_name: file.name,
        content_type: file.type || null,
        size: file.size,
      };
      onChange([
        ...attachments.filter((item) => item.category !== category),
        nextAttachment,
      ]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "上传申请附件失败");
    } finally {
      setUploadingCategory(null);
    }
  }

  function removeAttachment(category: WechatPayApplymentAttachmentCategory) {
    onChange(attachments.filter((item) => item.category !== category));
  }

  function openAttachmentPicker(inputId: string) {
    const input = document.getElementById(inputId);
    if (input instanceof HTMLInputElement) {
      input.click();
    }
  }

  return (
    <section className="rounded-md border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold">申请附件</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            营业执照和法人身份证正反面为提交申请必传资料。
          </p>
        </div>
        <Badge variant="outline">最多 20 个附件</Badge>
      </div>

      {error ? (
        <div className="mt-3">
          <StatusAlert>{error}</StatusAlert>
        </div>
      ) : null}

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        {APPLYMENT_ATTACHMENT_SLOTS.map((slot) => {
          const label = getWechatPayApplymentAttachmentCategoryLabel(slot.category);
          const attachment = attachments.find((item) => item.category === slot.category);
          const inputId = `wechat-pay-applyment-attachment-${slot.category}`;
          const isUploading = uploadingCategory === slot.category;
          const uploadActionLabel = attachment ? "替换附件" : "上传附件";
          const previewUrl = attachment
            ? buildWechatPayApplymentAttachmentPreviewUrl(attachment.object_key)
            : "";

          return (
            <div
              key={slot.category}
              className={cn(
                "flex min-w-0 flex-col gap-3 rounded-md border p-3",
                slot.required && !attachment ? "border-dashed" : "",
              )}
            >
              <div className="flex min-w-0 gap-3">
                <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-md border bg-muted text-muted-foreground">
                  <FileImage aria-hidden="true" className="size-4" />
                </span>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2 text-sm font-medium">
                    <span>{label}</span>
                    <Badge variant={slot.required ? "secondary" : "outline"}>
                      {slot.required ? "必传" : "选传"}
                    </Badge>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{slot.description}</p>
                </div>
              </div>

              {attachment ? (
                <div className="min-w-0 rounded-md bg-muted/50 p-3">
                  <div className="truncate text-sm">{attachment.file_name || attachment.object_key}</div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {formatWechatPayApplymentAttachmentSize(attachment.size) || "已上传"}
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button asChild variant="outline" size="sm">
                      <a href={previewUrl} target="_blank" rel="noreferrer">
                        <ExternalLink data-icon="inline-start" />
                        查看
                      </a>
                    </Button>
                    {editable ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={busy}
                        onClick={() => removeAttachment(slot.category)}
                      >
                        <Trash2 data-icon="inline-start" />
                        移除
                      </Button>
                    ) : null}
                  </div>
                </div>
              ) : (
                <div className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
                  未上传
                </div>
              )}

              {editable ? (
                <div>
                  <input
                    id={inputId}
                    className="sr-only"
                    type="file"
                    accept={APPLYMENT_ATTACHMENT_ACCEPT}
                    disabled={busy}
                    onChange={(event) => uploadAttachment(slot.category, event)}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={busy}
                    onClick={() => openAttachmentPicker(inputId)}
                  >
                    {isUploading ? (
                      <Loader2
                        aria-hidden="true"
                        className="animate-spin"
                        data-icon="inline-start"
                      />
                    ) : (
                      <UploadCloud aria-hidden="true" data-icon="inline-start" />
                    )}
                    {uploadActionLabel}
                  </Button>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </section>
  );
}
