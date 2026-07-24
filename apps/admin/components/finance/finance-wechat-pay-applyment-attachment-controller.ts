"use client";

import { type ChangeEvent, useState } from "react";

import {
  uploadDirectToCos,
  validateUploadFile,
} from "@/lib/cos-direct-upload";

import type {
  AttachmentCheckpointErrorMap,
} from "./finance-wechat-pay-applyment-checkpoint";
import {
  type ApplymentMaterialStateMap,
  replaceApplymentAttachment,
} from "./finance-wechat-pay-applyment-flow-model";
import {
  createApplymentAttachmentMutationIntent,
  type ApplymentAttachmentChangeOptions,
} from "./finance-wechat-pay-applyment-manual-entry";
import {
  getWechatPayApplymentAttachmentCategoryLabel,
  type WechatPayApplymentAttachment,
  type WechatPayApplymentAttachmentCategory,
} from "./finance-wechat-pay-applyment-shared";

const APPLYMENT_ATTACHMENT_UPLOAD_SCENE = "wechat_pay_applyment";
const MAX_APPLYMENT_ATTACHMENT_SIZE = 2 * 1024 * 1024;
const APPLYMENT_ATTACHMENT_ALLOWED_TYPES = new Set([
  "image/jpeg",
  "image/png",
]);

export type AttachmentUploadedInput = {
  attachment: WechatPayApplymentAttachment;
  nextAttachments: WechatPayApplymentAttachment[];
};

export type ApplymentAttachmentControllerInput = {
  attachments: WechatPayApplymentAttachment[];
  editable: boolean;
  disabled?: boolean;
  materialStates: ApplymentMaterialStateMap;
  attachmentSaveErrors: AttachmentCheckpointErrorMap;
  supportedOcrDocumentTypes: ReadonlySet<string>;
  onUploaded: (input: AttachmentUploadedInput) => void | Promise<void>;
  onRetrySave: (
    attachment: WechatPayApplymentAttachment,
  ) => void | Promise<void>;
  onRetryRecognition: (
    attachment: WechatPayApplymentAttachment,
  ) => void | Promise<void>;
  onChange: (
    nextAttachments: WechatPayApplymentAttachment[],
    options?: ApplymentAttachmentChangeOptions,
  ) => void | Promise<void>;
};

export type ApplymentAttachmentController = {
  attachments: WechatPayApplymentAttachment[];
  editable: boolean;
  materialStates: ApplymentMaterialStateMap;
  attachmentSaveErrors: AttachmentCheckpointErrorMap;
  supportedOcrDocumentTypes: ReadonlySet<string>;
  onRetrySave: ApplymentAttachmentControllerInput["onRetrySave"];
  onRetryRecognition: ApplymentAttachmentControllerInput["onRetryRecognition"];
  busy: boolean;
  uploadingCategory: WechatPayApplymentAttachmentCategory | null;
  error: string;
  errorCategory: string | null;
  openAttachmentPicker: (inputId: string) => void;
  uploadAttachment: (
    category: WechatPayApplymentAttachmentCategory,
    event: ChangeEvent<HTMLInputElement>,
  ) => void;
  removeAttachment: (attachment: WechatPayApplymentAttachment) => void;
};

export function useWechatPayApplymentAttachmentController({
  attachments,
  editable,
  disabled,
  materialStates,
  attachmentSaveErrors,
  supportedOcrDocumentTypes,
  onUploaded,
  onRetrySave,
  onRetryRecognition,
  onChange,
}: ApplymentAttachmentControllerInput): ApplymentAttachmentController {
  const [uploadingCategory, setUploadingCategory] =
    useState<WechatPayApplymentAttachmentCategory | null>(null);
  const [error, setError] = useState("");
  const [errorCategory, setErrorCategory] = useState<string | null>(null);
  const busy = disabled || Boolean(uploadingCategory);

  async function uploadAttachment(
    category: WechatPayApplymentAttachmentCategory,
    event: ChangeEvent<HTMLInputElement>,
  ) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    setError("");
    setErrorCategory(category);
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
    setErrorCategory(attachment.category ?? null);
    try {
      const nextAttachments = attachments.filter(
        (item) => item.object_key !== attachment.object_key,
      );
      await onChange(nextAttachments, {
        intent: createApplymentAttachmentMutationIntent(
          attachments,
          nextAttachments,
        ),
      });
    } catch (changeError) {
      setError(changeError instanceof Error
        ? changeError.message
        : "移除申请附件失败");
    }
  }

  function openAttachmentPicker(inputId: string) {
    const input = document.getElementById(inputId);
    if (input instanceof HTMLInputElement) input.click();
  }

  return {
    attachments,
    editable,
    materialStates,
    attachmentSaveErrors,
    supportedOcrDocumentTypes,
    onRetrySave,
    onRetryRecognition,
    busy: Boolean(busy),
    uploadingCategory,
    error,
    errorCategory,
    openAttachmentPicker,
    uploadAttachment,
    removeAttachment,
  };
}
