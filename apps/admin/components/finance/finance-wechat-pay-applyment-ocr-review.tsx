"use client";

import { useMemo } from "react";
import { AlertTriangle, PencilLine } from "lucide-react";
import {
  buildOcrFieldReviewRows,
  mapApplymentOcrFields,
  OcrFieldReviewRows,
  type OcrFieldReviewRow,
} from "@/components/ocr/ocr-field-review-dialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type {
  ApplymentFieldSource,
} from "./finance-wechat-pay-applyment-form-fields";
import {
  getCurrentApplymentAttachment,
  type ApplymentMaterialState,
  type ApplymentMaterialStateMap,
} from "./finance-wechat-pay-applyment-flow-model";
import {
  FinanceWechatPayApplymentRecognizedFields,
} from "./finance-wechat-pay-applyment-recognized-fields";
import {
  FinanceWechatPayApplymentOcrReviewPreview,
} from "./finance-wechat-pay-applyment-ocr-review-preview";
import {
  getWechatPayApplymentAttachmentCategoryLabel,
  type WechatPayApplymentAttachment,
  type WechatPayApplymentAttachmentCategory,
} from "./finance-wechat-pay-applyment-shared";

export {
  useWechatPayApplymentOcrReview,
} from "./finance-wechat-pay-applyment-ocr-review-hook";

const STATUS_META: Record<
  ApplymentMaterialState["status"],
  {
    label: string;
    variant: "outline" | "secondary" | "warning" | "danger" | "success";
  }
> = {
  missing: { label: "未上传", variant: "outline" },
  uploaded: { label: "等待识别", variant: "secondary" },
  recognizing: { label: "识别中", variant: "warning" },
  review_required: { label: "待核对", variant: "warning" },
  confirmed: { label: "已确认", variant: "success" },
  manual: { label: "手动填写", variant: "secondary" },
  failed: { label: "识别失败", variant: "danger" },
};

export type ApplymentInlineOcrReviewProps = {
  category: WechatPayApplymentAttachmentCategory;
  attachments: readonly WechatPayApplymentAttachment[];
  materialStates: ApplymentMaterialStateMap;
  contactType: string;
  subjectType: string;
  values: Readonly<Record<string, string>>;
  comparisonValues: Readonly<Record<string, string>>;
  fieldSources: Readonly<Record<string, ApplymentFieldSource>>;
  disabled?: boolean;
  showPreview?: boolean;
  onManualChange: (key: string, value: string) => void;
  onApply: (
    category: WechatPayApplymentAttachmentCategory,
    rows: readonly OcrFieldReviewRow[],
  ) => void | Promise<void>;
  onUseManualEntry: (
    category: WechatPayApplymentAttachmentCategory,
  ) => void | Promise<void>;
};

export type ApplymentOcrController = Omit<
  ApplymentInlineOcrReviewProps,
  "category" | "showPreview"
>;

export function FinanceWechatPayApplymentInlineOcrReview({
  category,
  attachments,
  materialStates,
  contactType,
  subjectType,
  values,
  comparisonValues,
  fieldSources,
  disabled,
  showPreview = true,
  onManualChange,
  onApply,
  onUseManualEntry,
}: ApplymentInlineOcrReviewProps) {
  const attachment = getCurrentApplymentAttachment(attachments, category);
  const selectedState = materialStates[category];
  const currentState = selectedState?.attachmentObjectKey ===
      attachment?.object_key
    ? selectedState
    : undefined;
  const fields = useMemo(
    () => mapApplymentOcrFields(
      category,
      currentState?.fields ?? [],
      contactType,
    ),
    [category, contactType, currentState?.fields],
  );
  const rows = useMemo(
    () => buildOcrFieldReviewRows(fields, comparisonValues),
    [comparisonValues, fields],
  );
  const status = currentState
    ? currentState.status
    : attachment
    ? "uploaded"
    : "missing";
  const statusMeta = STATUS_META[status];
  const titleId = `wechat-pay-applyment-ocr-review-${category}-title`;
  const reviewContent = (
    <section className="flex min-w-0 flex-col gap-4">
      <RecognitionWarnings warnings={currentState?.warnings ?? []} />
      <FinanceWechatPayApplymentRecognizedFields
        category={category}
        contactType={contactType}
        subjectType={subjectType}
        values={values}
        fieldSources={fieldSources}
        disabled={disabled}
        labelledBy={titleId}
        onManualChange={onManualChange}
      />
      <OcrFieldReviewRows
        rows={rows}
        applyLabel="应用所选字段并确认"
        disabled={disabled || status === "recognizing"}
        onApply={(selectedRows) => onApply(category, selectedRows)}
      />
      {attachment && status !== "manual" ? (
        <div>
          <Button
            type="button"
            variant="outline"
            disabled={disabled}
            onClick={() => onUseManualEntry(category)}
          >
            <PencilLine data-icon="inline-start" />
            改为手动填写
          </Button>
        </div>
      ) : null}
    </section>
  );

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id={titleId} className="text-sm font-medium">
          {getWechatPayApplymentAttachmentCategoryLabel(category)}
        </h3>
        <Badge variant={statusMeta.variant}>{statusMeta.label}</Badge>
      </div>
      {showPreview ? (
        <div className="grid min-h-0 gap-4 lg:grid-cols-[minmax(18rem,0.85fr)_minmax(0,1.15fr)]">
          <section className="min-w-0 lg:border-r lg:pr-4">
            <FinanceWechatPayApplymentOcrReviewPreview
              attachment={attachment}
              statusLabel={statusMeta.label}
            />
          </section>
          {reviewContent}
        </div>
      ) : reviewContent}
    </div>
  );
}

function RecognitionWarnings({
  warnings,
}: {
  warnings: ApplymentMaterialState["warnings"];
}) {
  if (warnings.length === 0) return null;
  return (
    <Alert>
      <AlertTriangle />
      <AlertTitle>识别结果需要人工核对</AlertTitle>
      <AlertDescription>
        <div className="flex flex-col gap-1">
          {warnings.map((warning) => (
            <div key={warning.code}>{warning.message}（{warning.code}）</div>
          ))}
        </div>
      </AlertDescription>
    </Alert>
  );
}
