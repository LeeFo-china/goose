"use client";

import { CircleAlert } from "lucide-react";

import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert";
import { Checkbox } from "@/components/ui/checkbox";
import { FieldLabel } from "@/components/ui/field";

import { WechatPayApplymentAttachmentsField } from "./finance-wechat-pay-applyment-attachments";
import type { useWechatPayApplymentMaterials } from "./use-wechat-pay-applyment-materials";

type MaterialsController = ReturnType<
  typeof useWechatPayApplymentMaterials
>;

export function FinanceWechatPayApplymentMaterialsStage({
  contactType,
  editable,
  actionPending,
  materials,
  onAttachmentsChange,
}: {
  contactType: string;
  editable: boolean;
  actionPending: boolean;
  materials: MaterialsController;
  onAttachmentsChange: MaterialsController["onChange"];
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-start gap-3 rounded-md border p-3">
        <Checkbox
          id="wechat-pay-applyment-ocr-consent"
          checked={materials.recognitionConsent}
          disabled={actionPending || !editable}
          onCheckedChange={(checked) => {
            materials.setRecognitionConsent(checked === true);
          }}
        />
        <FieldLabel
          htmlFor="wechat-pay-applyment-ocr-consent"
          className="leading-5"
        >
          同意使用已上传证照进行信息识别和申请资料回填
        </FieldLabel>
      </div>
      {materials.capabilitiesUnavailable ? (
        <Alert>
          <CircleAlert />
          <AlertTitle>证照识别暂不可用</AlertTitle>
          <AlertDescription>
            已上传资料仍会保存，请在下一步手动填写。
          </AlertDescription>
        </Alert>
      ) : null}
      <WechatPayApplymentAttachmentsField
        attachments={materials.attachments}
        contactType={contactType}
        editable={editable}
        disabled={actionPending || materials.pending}
        materialStates={materials.materialStates}
        attachmentSaveErrors={materials.attachmentSaveErrors}
        supportedOcrDocumentTypes={materials.supportedOcrDocumentTypes}
        onUploaded={materials.onUploaded}
        onRetrySave={materials.onRetrySave}
        onRetryRecognition={materials.onRetryRecognition}
        onChange={onAttachmentsChange}
      />
    </div>
  );
}
