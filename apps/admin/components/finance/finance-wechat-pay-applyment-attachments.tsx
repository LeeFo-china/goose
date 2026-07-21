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
const MAX_APPLYMENT_ATTACHMENT_SIZE = 2 * 1024 * 1024;
const MAX_BUSINESS_SCENE_MATERIALS = 5;
const APPLYMENT_ATTACHMENT_ACCEPT = "image/jpeg,image/png,image/bmp";
const APPLYMENT_ATTACHMENT_ALLOWED_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/bmp",
]);

const BASE_ATTACHMENT_SLOTS: Array<{
  category: WechatPayApplymentAttachmentCategory;
  required: boolean;
  description: string;
}> = [
  { category: "license_copy", required: true, description: "营业执照清晰照片或扫描件。" },
  { category: "legal_representative_id_card_front", required: true, description: "法人身份证人像面。" },
  { category: "legal_representative_id_card_back", required: true, description: "法人身份证国徽面。" },
  { category: "settlement_account_proof", required: false, description: "开户许可证、银行卡或银行账户证明。" },
];

const CONTACT_ATTACHMENT_SLOTS = [
  { category: "contact_id_card_front" as const, required: true, description: "经办人身份证人像面。" },
  { category: "contact_id_card_back" as const, required: true, description: "经办人身份证国徽面。" },
];

export function WechatPayApplymentAttachmentsField({
  attachments,
  contactType,
  editable,
  disabled,
  onChange,
}: {
  attachments: WechatPayApplymentAttachment[];
  contactType: string;
  editable: boolean;
  disabled?: boolean;
  onChange: (attachments: WechatPayApplymentAttachment[]) => void;
}) {
  const [uploadingCategory, setUploadingCategory] = useState<string | null>(null);
  const [error, setError] = useState("");
  const busy = disabled || Boolean(uploadingCategory);
  const slots = contactType === "SUPER"
    ? [...BASE_ATTACHMENT_SLOTS, ...CONTACT_ATTACHMENT_SLOTS]
    : BASE_ATTACHMENT_SLOTS;
  const businessMaterials = attachments.filter(
    (item) => item.category === "business_scene_material",
  );

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
        typeMessage: "仅支持 JPEG、PNG、BMP 图片",
        sizeMessage: "单个申请附件不能超过 2MB",
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
      onChange(category === "business_scene_material"
        ? [...attachments, nextAttachment]
        : [
          ...attachments.filter((item) => item.category !== category),
          nextAttachment,
        ]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "上传申请附件失败");
    } finally {
      setUploadingCategory(null);
    }
  }

  function removeAttachment(attachment: WechatPayApplymentAttachment) {
    onChange(attachments.filter((item) => item.object_key !== attachment.object_key));
  }

  function openAttachmentPicker(inputId: string) {
    const input = document.getElementById(inputId);
    if (input instanceof HTMLInputElement) input.click();
  }

  return (
    <section className="rounded-md border p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold">申请附件</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            单张不超过 2MB，仅支持 JPEG、PNG、BMP。
          </p>
        </div>
        <Badge variant="outline">私有存储</Badge>
      </div>

      {error ? <div className="mt-3"><StatusAlert>{error}</StatusAlert></div> : null}

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        {slots.map((slot) => {
          const attachment = attachments.find((item) => item.category === slot.category);
          return (
            <AttachmentSlot
              key={slot.category}
              category={slot.category}
              required={slot.required}
              description={slot.description}
              attachment={attachment}
              editable={editable}
              busy={busy}
              uploading={uploadingCategory === slot.category}
              onOpen={openAttachmentPicker}
              onUpload={uploadAttachment}
              onRemove={removeAttachment}
            />
          );
        })}
      </div>

      <div className="mt-4 rounded-md border p-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-sm font-medium">
              经营场景材料
              <Badge variant="outline">选传</Badge>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              门店、经营场景或小程序服务截图，最多 {MAX_BUSINESS_SCENE_MATERIALS} 张。
            </p>
          </div>
          <Badge variant="secondary">
            {businessMaterials.length}/{MAX_BUSINESS_SCENE_MATERIALS}
          </Badge>
        </div>

        {businessMaterials.length > 0 ? (
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {businessMaterials.map((attachment) => (
              <AttachmentPreview
                key={attachment.object_key}
                attachment={attachment}
                editable={editable}
                busy={busy}
                onRemove={removeAttachment}
              />
            ))}
          </div>
        ) : (
          <div className="mt-3 rounded-md border border-dashed p-3 text-sm text-muted-foreground">
            暂未上传经营场景材料
          </div>
        )}

        {editable ? (
          <div className="mt-3">
            <UploadButton
              category="business_scene_material"
              inputId="wechat-pay-applyment-attachment-business-scene"
              disabled={busy || businessMaterials.length >= MAX_BUSINESS_SCENE_MATERIALS}
              uploading={uploadingCategory === "business_scene_material"}
              label="添加场景图片"
              onOpen={openAttachmentPicker}
              onUpload={uploadAttachment}
            />
          </div>
        ) : null}
      </div>
    </section>
  );
}

function AttachmentSlot({
  category,
  required,
  description,
  attachment,
  editable,
  busy,
  uploading,
  onOpen,
  onUpload,
  onRemove,
}: {
  category: WechatPayApplymentAttachmentCategory;
  required: boolean;
  description: string;
  attachment?: WechatPayApplymentAttachment;
  editable: boolean;
  busy: boolean;
  uploading: boolean;
  onOpen: (inputId: string) => void;
  onUpload: (category: WechatPayApplymentAttachmentCategory, event: ChangeEvent<HTMLInputElement>) => void;
  onRemove: (attachment: WechatPayApplymentAttachment) => void;
}) {
  const inputId = `wechat-pay-applyment-attachment-${category}`;
  return (
    <div className={cn("flex min-w-0 flex-col gap-3 rounded-md border p-3", required && !attachment ? "border-dashed" : "")}>
      <div className="flex min-w-0 gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
          <FileImage aria-hidden="true" className="size-4" />
        </span>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2 text-sm font-medium">
            {getWechatPayApplymentAttachmentCategoryLabel(category)}
            <Badge variant={required ? "secondary" : "outline"}>{required ? "必传" : "选传"}</Badge>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">{description}</p>
        </div>
      </div>
      {attachment ? (
        <AttachmentPreview attachment={attachment} editable={editable} busy={busy} onRemove={onRemove} />
      ) : (
        <div className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">未上传</div>
      )}
      {editable ? (
        <UploadButton category={category} inputId={inputId} disabled={busy} uploading={uploading} label={attachment ? "替换附件" : "上传附件"} onOpen={onOpen} onUpload={onUpload} />
      ) : null}
    </div>
  );
}

function AttachmentPreview({ attachment, editable, busy, onRemove }: {
  attachment: WechatPayApplymentAttachment;
  editable: boolean;
  busy: boolean;
  onRemove: (attachment: WechatPayApplymentAttachment) => void;
}) {
  const previewUrl = buildWechatPayApplymentAttachmentPreviewUrl(attachment.object_key);
  return (
    <div className="min-w-0 rounded-md bg-muted/50 p-3">
      <div className="truncate text-sm">{attachment.file_name || attachment.object_key}</div>
      <div className="mt-1 text-xs text-muted-foreground">{formatWechatPayApplymentAttachmentSize(attachment.size) || "已上传"}</div>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button asChild variant="outline" size="sm"><a href={previewUrl} target="_blank" rel="noreferrer"><ExternalLink data-icon="inline-start" />查看</a></Button>
        {editable ? <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={() => onRemove(attachment)}><Trash2 data-icon="inline-start" />移除</Button> : null}
      </div>
    </div>
  );
}

function UploadButton({ category, inputId, disabled, uploading, label, onOpen, onUpload }: {
  category: WechatPayApplymentAttachmentCategory;
  inputId: string;
  disabled: boolean;
  uploading: boolean;
  label: string;
  onOpen: (inputId: string) => void;
  onUpload: (category: WechatPayApplymentAttachmentCategory, event: ChangeEvent<HTMLInputElement>) => void;
}) {
  return (
    <div>
      <input id={inputId} className="sr-only" type="file" accept={APPLYMENT_ATTACHMENT_ACCEPT} disabled={disabled} onChange={(event) => onUpload(category, event)} />
      <Button type="button" variant="outline" size="sm" disabled={disabled} onClick={() => onOpen(inputId)}>
        {uploading ? <Loader2 aria-hidden="true" className="animate-spin" data-icon="inline-start" /> : <UploadCloud aria-hidden="true" data-icon="inline-start" />}
        {label}
      </Button>
    </div>
  );
}
