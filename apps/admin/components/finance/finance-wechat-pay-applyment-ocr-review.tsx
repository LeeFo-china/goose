"use client";

import { useEffect, useMemo } from "react";
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
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type {
  ApplymentFieldSource,
} from "./finance-wechat-pay-applyment-form-fields";
import {
  getCurrentApplymentAttachment,
  type ApplymentMaterialState,
  type ApplymentMaterialStateMap,
} from "./finance-wechat-pay-applyment-flow-model";
import {
  APPLYMENT_OCR_REVIEW_CATEGORIES,
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
  showManualEntryAction?: boolean;
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
  "category" | "showPreview" | "showManualEntryAction"
>;

export function FinanceWechatPayApplymentOcrReview({
  attachments,
  materialStates,
  selectedCategory,
  contactType,
  subjectType,
  values,
  comparisonValues,
  fieldSources,
  disabled,
  onSelectedCategoryChange,
  onManualChange,
  onApply,
  onUseManualEntry,
}: {
  attachments: readonly WechatPayApplymentAttachment[];
  materialStates: ApplymentMaterialStateMap;
  selectedCategory: WechatPayApplymentAttachmentCategory;
  contactType: string;
  subjectType: string;
  values: Readonly<Record<string, string>>;
  comparisonValues: Readonly<Record<string, string>>;
  fieldSources: Readonly<Record<string, ApplymentFieldSource>>;
  disabled?: boolean;
  onSelectedCategoryChange: (
    category: WechatPayApplymentAttachmentCategory,
  ) => void;
  onManualChange: (key: string, value: string) => void;
  onApply: (
    category: WechatPayApplymentAttachmentCategory,
    rows: readonly OcrFieldReviewRow[],
  ) => void | Promise<void>;
  onUseManualEntry: (
    category: WechatPayApplymentAttachmentCategory,
  ) => void | Promise<void>;
}) {
  const categories = useMemo(
    () => APPLYMENT_OCR_REVIEW_CATEGORIES.filter((category) =>
      contactType === "SUPER" || !category.startsWith("contact_id_card_")
    ),
    [contactType],
  );
  const preferredCategory = categories.find((category) =>
    materialStates[category]?.status === "review_required"
  ) ?? categories.find((category) =>
    getCurrentApplymentAttachment(attachments, category)
  ) ?? categories[0];

  useEffect(() => {
    if (!categories.includes(
      selectedCategory as (typeof categories)[number],
    )) {
      onSelectedCategoryChange(preferredCategory);
    }
  }, [
    categories,
    onSelectedCategoryChange,
    preferredCategory,
    selectedCategory,
  ]);

  return (
    <section className="flex min-w-0 flex-col gap-4 rounded-md border p-4">
      <div>
        <div>
          <h2 className="text-sm font-semibold">证照识别核对</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            对照原件确认识别建议，有差异的字段不会自动覆盖。
          </p>
        </div>
      </div>

      <Select
        value={selectedCategory}
        onValueChange={(value) =>
          onSelectedCategoryChange(
            value as WechatPayApplymentAttachmentCategory,
          )}
      >
        <SelectTrigger aria-label="选择核对资料" className="w-full sm:w-72">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            {categories.map((category) => (
              <SelectItem key={category} value={category}>
                {getWechatPayApplymentAttachmentCategoryLabel(category)}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>

      <FinanceWechatPayApplymentInlineOcrReview
        category={selectedCategory}
        attachments={attachments}
        materialStates={materialStates}
        contactType={contactType}
        subjectType={subjectType}
        values={values}
        comparisonValues={comparisonValues}
        fieldSources={fieldSources}
        disabled={disabled}
        onManualChange={onManualChange}
        onApply={onApply}
        onUseManualEntry={onUseManualEntry}
      />
    </section>
  );
}

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
  showManualEntryAction = true,
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
      {showManualEntryAction && attachment && status !== "manual" ? (
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
