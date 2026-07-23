"use client";

import { type ChangeEvent, useState } from "react";
import {
  FileImage,
  FilePenLine,
  Loader2,
  RefreshCw,
  UploadCloud,
} from "lucide-react";
import { StatusAlert } from "@/components/admin/status-alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  uploadDirectToCos,
  validateUploadFile,
} from "@/lib/cos-direct-upload";
import {
  type ApplymentMaterialState,
  type ApplymentMaterialStateMap,
  replaceApplymentAttachment,
  updateAttachmentOcrReviewMetadata,
} from "./finance-wechat-pay-applyment-flow-model";
import {
  getWechatPayApplymentAttachmentCategoryLabel,
  WECHAT_PAY_APPLYMENT_OCR_DOCUMENT_TYPES,
  type WechatPayApplymentAttachment,
  type WechatPayApplymentAttachmentCategory,
} from "./finance-wechat-pay-applyment-shared";
import {
  AttachmentPreviewCard,
} from "./finance-wechat-pay-applyment-attachment-preview";

const APPLYMENT_ATTACHMENT_UPLOAD_SCENE = "wechat_pay_applyment";
const MAX_APPLYMENT_ATTACHMENT_SIZE = 2 * 1024 * 1024;
const MAX_BUSINESS_SCENE_MATERIALS = 5;
const APPLYMENT_ATTACHMENT_ACCEPT = "image/jpeg,image/png";
const APPLYMENT_ATTACHMENT_ALLOWED_TYPES = new Set([
  "image/jpeg",
  "image/png",
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

const MATERIAL_STATUS_META: Record<
  ApplymentMaterialState["status"],
  { label: string; variant: "outline" | "secondary" | "warning" | "danger" | "success" }
> = {
  missing: { label: "未上传", variant: "outline" },
  uploaded: { label: "已上传", variant: "secondary" },
  recognizing: { label: "识别中", variant: "warning" },
  review_required: { label: "待核对", variant: "warning" },
  confirmed: { label: "已确认", variant: "success" },
  manual: { label: "手动填写", variant: "secondary" },
  failed: { label: "识别失败", variant: "danger" },
};

type AttachmentUploadedInput = {
  attachment: WechatPayApplymentAttachment;
  nextAttachments: WechatPayApplymentAttachment[];
};

export function WechatPayApplymentAttachmentsField({
  attachments,
  contactType,
  editable,
  disabled,
  materialStates,
  supportedOcrDocumentTypes,
  onUploaded,
  onRetryRecognition,
  onChange,
}: {
  attachments: WechatPayApplymentAttachment[];
  contactType: string;
  editable: boolean;
  disabled?: boolean;
  materialStates: ApplymentMaterialStateMap;
  supportedOcrDocumentTypes: ReadonlySet<string>;
  onUploaded: (input: AttachmentUploadedInput) => void | Promise<void>;
  onRetryRecognition: (
    attachment: WechatPayApplymentAttachment,
  ) => void | Promise<void>;
  onChange: (
    nextAttachments: WechatPayApplymentAttachment[],
  ) => void | Promise<void>;
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
        typeMessage: "仅支持 JPEG、PNG 图片",
        sizeMessage: "单个申请附件不能超过 2MB",
      });
      const uploaded = await uploadDirectToCos(file, {
        scene: APPLYMENT_ATTACHMENT_UPLOAD_SCENE,
        uploadErrorLabel: getWechatPayApplymentAttachmentCategoryLabel(category),
      });
      if (!uploaded.fileId) {
        throw new Error("附件上传成功但未返回文件 ID，请重新上传");
      }
      const attachment: WechatPayApplymentAttachment = {
        category,
        file_object_id: uploaded.fileId,
        object_key: uploaded.storagePath,
        file_name: file.name,
        content_type: file.type || null,
        size: file.size,
        ocr_recognition_id: null,
        ocr_review_status: "uploaded",
      };
      const nextAttachments = replaceApplymentAttachment(
        attachments,
        attachment,
      );
      await onUploaded({ attachment, nextAttachments });
    } catch (uploadError) {
      setError(uploadError instanceof Error
        ? uploadError.message
        : "上传申请附件失败");
    } finally {
      setUploadingCategory(null);
    }
  }

  async function removeAttachment(attachment: WechatPayApplymentAttachment) {
    setError("");
    try {
      await onChange(
        attachments.filter((item) => item.object_key !== attachment.object_key),
      );
    } catch (changeError) {
      setError(changeError instanceof Error
        ? changeError.message
        : "移除申请附件失败");
    }
  }

  async function useManualEntry(attachment: WechatPayApplymentAttachment) {
    setError("");
    try {
      await onChange(updateAttachmentOcrReviewMetadata(
        attachments,
        attachment.object_key,
        {
          ocr_recognition_id: attachment.ocr_recognition_id ?? null,
          ocr_review_status: "manual",
        },
      ));
    } catch (changeError) {
      setError(changeError instanceof Error
        ? changeError.message
        : "切换手动填写失败");
    }
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
            单张不超过 2MB，仅支持 JPEG、PNG。
          </p>
        </div>
        <Badge variant="outline">私有存储</Badge>
      </div>

      {error ? <div className="mt-3"><StatusAlert>{error}</StatusAlert></div> : null}

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        {slots.map((slot) => {
          const attachment = attachments.find(
            (item) => item.category === slot.category,
          );
          const materialState = materialStates[slot.category];
          const documentType = WECHAT_PAY_APPLYMENT_OCR_DOCUMENT_TYPES[
            slot.category
          ];
          return (
            <AttachmentSlot
              key={slot.category}
              category={slot.category}
              required={slot.required}
              description={slot.description}
              attachment={attachment}
              materialState={materialState}
              editable={editable}
              busy={Boolean(busy)}
              uploading={uploadingCategory === slot.category}
              ocrSupported={Boolean(
                documentType &&
                supportedOcrDocumentTypes.has(documentType),
              )}
              onOpen={openAttachmentPicker}
              onUpload={uploadAttachment}
              onRemove={removeAttachment}
              onRetryRecognition={onRetryRecognition}
              onManualEntry={useManualEntry}
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
              <AttachmentPreviewCard
                key={attachment.object_key}
                attachment={attachment}
                editable={editable}
                busy={Boolean(busy)}
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
              disabled={Boolean(
                busy ||
                businessMaterials.length >= MAX_BUSINESS_SCENE_MATERIALS
              )}
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
  materialState,
  editable,
  busy,
  uploading,
  ocrSupported,
  onOpen,
  onUpload,
  onRemove,
  onRetryRecognition,
  onManualEntry,
}: {
  category: WechatPayApplymentAttachmentCategory;
  required: boolean;
  description: string;
  attachment?: WechatPayApplymentAttachment;
  materialState?: ApplymentMaterialState;
  editable: boolean;
  busy: boolean;
  uploading: boolean;
  ocrSupported: boolean;
  onOpen: (inputId: string) => void;
  onUpload: (
    category: WechatPayApplymentAttachmentCategory,
    event: ChangeEvent<HTMLInputElement>,
  ) => void;
  onRemove: (attachment: WechatPayApplymentAttachment) => void;
  onRetryRecognition: (attachment: WechatPayApplymentAttachment) => void;
  onManualEntry: (attachment: WechatPayApplymentAttachment) => void;
}) {
  const inputId = `wechat-pay-applyment-attachment-${category}`;
  const currentState = materialState?.attachmentObjectKey ===
      attachment?.object_key
    ? materialState
    : undefined;
  const statusMeta = MATERIAL_STATUS_META[currentState?.status ??
    (attachment ? "uploaded" : "missing")];
  return (
    <div className={cn(
      "flex min-w-0 flex-col gap-3 rounded-md border p-3",
      required && !attachment ? "border-dashed" : "",
    )}>
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2 text-sm font-medium">
            {getWechatPayApplymentAttachmentCategoryLabel(category)}
            <Badge variant={required ? "secondary" : "outline"}>
              {required ? "必传" : "选传"}
            </Badge>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">{description}</p>
        </div>
        <Badge variant={statusMeta.variant}>{statusMeta.label}</Badge>
      </div>
      {attachment ? (
        <AttachmentPreviewCard
          attachment={attachment}
          editable={editable}
          busy={busy}
          onRemove={onRemove}
        />
      ) : (
        <div className="flex aspect-[4/3] items-center justify-center rounded-md border border-dashed bg-muted/30 text-muted-foreground">
          <FileImage aria-hidden="true" className="size-8" />
        </div>
      )}
      {currentState?.error ? (
        <p className="text-xs text-destructive">{currentState.error}</p>
      ) : null}
      {editable ? (
        <div className="flex flex-wrap items-center gap-2">
          <UploadButton
            category={category}
            inputId={inputId}
            disabled={busy}
            uploading={uploading}
            label={attachment ? "替换附件" : "上传附件"}
            onOpen={onOpen}
            onUpload={onUpload}
          />
          {attachment && currentState?.status === "failed" && ocrSupported ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() => onRetryRecognition(attachment)}
            >
              <RefreshCw data-icon="inline-start" />
              重试识别
            </Button>
          ) : null}
          {attachment && currentState?.status === "failed" ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={busy}
              onClick={() => onManualEntry(attachment)}
            >
              <FilePenLine data-icon="inline-start" />
              手动填写
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function UploadButton({
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
          ? <Loader2 aria-hidden="true" className="animate-spin" data-icon="inline-start" />
          : <UploadCloud aria-hidden="true" data-icon="inline-start" />}
        {label}
      </Button>
    </div>
  );
}
