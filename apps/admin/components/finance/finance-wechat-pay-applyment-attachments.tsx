"use client";

import { FileImage, FilePenLine, RefreshCw } from "lucide-react";
import { StatusAlert } from "@/components/admin/status-alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  type ApplymentAttachmentController,
  type ApplymentAttachmentControllerInput,
  useWechatPayApplymentAttachmentController,
} from "./finance-wechat-pay-applyment-attachment-controller";
export {
  useWechatPayApplymentAttachmentController,
} from "./finance-wechat-pay-applyment-attachment-controller";
export type {
  ApplymentAttachmentController,
  ApplymentAttachmentControllerInput,
  AttachmentUploadedInput,
} from "./finance-wechat-pay-applyment-attachment-controller";
import {
  type ApplymentMaterialState,
  getMaterialRetryAction,
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
import {
  AttachmentCheckpointStatus,
} from "./finance-wechat-pay-applyment-attachment-checkpoint-status";
import {
  ApplymentAttachmentUploadButton,
} from "./finance-wechat-pay-applyment-upload-button";

const MAX_BUSINESS_SCENE_MATERIALS = 5;

export type ApplymentAttachmentSlotDefinition = {
  category: WechatPayApplymentAttachmentCategory;
  required: boolean;
  description: string;
};

const BASE_ATTACHMENT_SLOTS: readonly ApplymentAttachmentSlotDefinition[] = [
  {
    category: "license_copy",
    required: true,
    description: "营业执照清晰照片或扫描件。",
  },
  {
    category: "legal_representative_id_card_front",
    required: true,
    description: "法人身份证人像面。",
  },
  {
    category: "legal_representative_id_card_back",
    required: true,
    description: "法人身份证国徽面。",
  },
  {
    category: "settlement_account_proof",
    required: false,
    description: "开户许可证、银行卡或银行账户证明。",
  },
];

const CONTACT_ATTACHMENT_SLOTS = [
  {
    category: "contact_id_card_front" as const,
    required: true,
    description: "经办人身份证人像面。",
  },
  {
    category: "contact_id_card_back" as const,
    required: true,
    description: "经办人身份证国徽面。",
  },
];

const MATERIAL_STATUS_META: Record<
  ApplymentMaterialState["status"],
  {
    label: string;
    variant: "outline" | "secondary" | "warning" | "danger" | "success";
  }
> = {
  missing: { label: "未上传", variant: "outline" },
  uploaded: { label: "已上传", variant: "secondary" },
  recognizing: { label: "识别中", variant: "warning" },
  review_required: { label: "待核对", variant: "warning" },
  confirmed: { label: "已确认", variant: "success" },
  manual: { label: "手动填写", variant: "secondary" },
  failed: { label: "识别失败", variant: "danger" },
};

export type WechatPayApplymentAttachmentSlotProps =
  ApplymentAttachmentSlotDefinition & {
    controller: ApplymentAttachmentController;
  };

type WechatPayApplymentAttachmentsFieldProps =
  ApplymentAttachmentControllerInput & {
    contactType: string;
  };

export function WechatPayApplymentAttachmentsField(
  input: WechatPayApplymentAttachmentsFieldProps,
) {
  const { contactType, ...controllerInput } = input;
  const controller = useWechatPayApplymentAttachmentController(controllerInput);
  const {
    attachments,
    editable,
    busy,
    uploadingCategory,
    error,
    attachmentSaveErrors,
    uploadAttachment,
    removeAttachment,
    openAttachmentPicker,
    onRetrySave,
  } = controller;
  const slots = contactType === "SUPER"
    ? [...BASE_ATTACHMENT_SLOTS, ...CONTACT_ATTACHMENT_SLOTS]
    : BASE_ATTACHMENT_SLOTS;
  const businessMaterials = attachments.filter(
    (item) => item.category === "business_scene_material",
  );

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
        {slots.map((slot) => (
          <WechatPayApplymentAttachmentSlot
            key={slot.category}
            {...slot}
            controller={controller}
          />
        ))}
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
              <div key={attachment.object_key} className="min-w-0">
                <AttachmentPreviewCard
                  attachment={attachment}
                  editable={editable}
                  busy={Boolean(busy)}
                  onRemove={removeAttachment}
                />
                <AttachmentCheckpointStatus
                  error={attachmentSaveErrors[attachment.object_key]}
                  editable={editable}
                  busy={Boolean(busy)}
                  onRetry={() => onRetrySave(attachment)}
                />
              </div>
            ))}
          </div>
        ) : (
          <div className="mt-3 rounded-md border border-dashed p-3 text-sm text-muted-foreground">
            暂未上传经营场景材料
          </div>
        )}

        {editable ? (
          <div className="mt-3">
            <ApplymentAttachmentUploadButton
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

export function WechatPayApplymentAttachmentSlot({
  category,
  required,
  description,
  controller,
}: WechatPayApplymentAttachmentSlotProps) {
  const {
    attachments,
    materialStates,
    attachmentSaveErrors,
    supportedOcrDocumentTypes,
    editable,
    busy,
    uploadingCategory,
    openAttachmentPicker,
    uploadAttachment,
    removeAttachment,
    onRetrySave,
    onRetryRecognition,
    useManualEntry,
  } = controller;
  const attachment = attachments.find((item) => item.category === category);
  const materialState = materialStates[category];
  const saveError = attachment
    ? attachmentSaveErrors[attachment.object_key]
    : undefined;
  const documentType = WECHAT_PAY_APPLYMENT_OCR_DOCUMENT_TYPES[category];
  const ocrSupported = Boolean(
    documentType && supportedOcrDocumentTypes.has(documentType),
  );
  const inputId = `wechat-pay-applyment-attachment-${category}`;
  const currentState = materialState?.attachmentObjectKey ===
      attachment?.object_key
    ? materialState
    : undefined;
  const needsPersistRetry = getMaterialRetryAction(currentState) === "persist";
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
          onRemove={removeAttachment}
        />
      ) : (
        <div className="flex aspect-[4/3] items-center justify-center rounded-md border border-dashed bg-muted/30 text-muted-foreground">
          <FileImage aria-hidden="true" className="size-8" />
        </div>
      )}
      {currentState?.error ? (
        <p className="text-xs text-destructive">{currentState.error}</p>
      ) : null}
      <AttachmentCheckpointStatus
        error={saveError}
        editable={editable}
        busy={busy}
        onRetry={() => {
          if (attachment) onRetrySave(attachment);
        }}
      />
      {editable ? (
        <div className="flex flex-wrap items-center gap-2">
          <ApplymentAttachmentUploadButton
            category={category}
            inputId={inputId}
            disabled={busy}
            uploading={uploadingCategory === category}
            label={attachment ? "替换附件" : "上传附件"}
            onOpen={openAttachmentPicker}
            onUpload={uploadAttachment}
          />
          {attachment &&
              (needsPersistRetry ||
                (currentState?.status === "failed" && ocrSupported)) ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() => onRetryRecognition(attachment)}
            >
              <RefreshCw data-icon="inline-start" />
              {needsPersistRetry ? "重试保存" : "重试识别"}
            </Button>
          ) : null}
          {attachment && currentState?.status === "failed" ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={busy}
              onClick={() => useManualEntry(attachment)}
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
