"use client";

import {
  type RefObject,
  useEffect,
  useMemo,
  useState,
} from "react";
import { AlertTriangle, FileImage, PencilLine, RefreshCw } from "lucide-react";
import {
  buildOcrFieldReviewRows,
  getUnreviewedOcrConflictKeys,
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
import type {
  ApplymentMaterialState,
  ApplymentMaterialStateMap,
} from "./finance-wechat-pay-applyment-flow-model";
import {
  updateAttachmentOcrReviewMetadata,
} from "./finance-wechat-pay-applyment-flow-model";
import {
  createApplymentAttachmentMutationIntent,
  type ApplymentAttachmentChangeOptions,
} from "./finance-wechat-pay-applyment-manual-entry";
import {
  APPLYMENT_OCR_REVIEW_CATEGORIES,
  FinanceWechatPayApplymentRecognizedFields,
  getOcrComparisonValues,
  getStoredFieldSources,
  getStoredOcrValues,
} from "./finance-wechat-pay-applyment-recognized-fields";
import {
  buildWechatPayApplymentAttachmentPreviewUrl,
  getWechatPayApplymentAttachmentCategoryLabel,
  getWechatPayApplymentAttachmentDisplayName,
  type WechatPayApplymentAttachment,
  type WechatPayApplymentAttachmentCategory,
  type WechatPayApplymentRecord,
} from "./finance-wechat-pay-applyment-shared";

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

export function useWechatPayApplymentOcrReview(input: {
  applyment: WechatPayApplymentRecord | null;
  formRef: RefObject<HTMLFormElement | null>;
  attachmentsRef: RefObject<WechatPayApplymentAttachment[]>;
  materialStates: ApplymentMaterialStateMap;
  onAttachmentsChange: (
    attachments: WechatPayApplymentAttachment[],
    options?: ApplymentAttachmentChangeOptions,
  ) => Promise<void>;
  onReviewInvalidated: () => void;
  onError: (message: string) => void;
}) {
  const [appliedValues, setAppliedValues] = useState<Record<string, string>>({});
  const [currentValues, setCurrentValues] = useState<Record<string, string>>({});
  const [fieldSources, setFieldSources] = useState<
    Record<string, ApplymentFieldSource>
  >({});

  useEffect(() => {
    const values = getStoredOcrValues(input.applyment);
    setAppliedValues({});
    setCurrentValues(values);
    setFieldSources(getStoredFieldSources(input.applyment, values));
  }, [input.applyment?.id, input.applyment?.updated_at]);

  function onManualChange(key: string, value: string) {
    input.onReviewInvalidated();
    setAppliedValues((current) => ({ ...current, [key]: value }));
    setCurrentValues((current) => ({ ...current, [key]: value }));
    setFieldSources((current) => ({ ...current, [key]: "manual" }));
  }

  async function applyRecognitionRows(
    category: WechatPayApplymentAttachmentCategory,
    rows: readonly OcrFieldReviewRow[],
  ) {
    const formElement = input.formRef.current;
    if (!formElement) return;
    const selectedKeys = rows
      .filter((row) => row.selected)
      .map((row) => row.field.key);
    const liveValues = readFormValues(formElement, selectedKeys);
    const unreviewedKeys = getUnreviewedOcrConflictKeys(rows, liveValues);
    if (unreviewedKeys.length > 0) {
      input.onReviewInvalidated();
      setAppliedValues((current) => ({ ...current, ...liveValues }));
      setCurrentValues((current) => ({ ...current, ...liveValues }));
      setFieldSources((current) => ({
        ...current,
        ...Object.fromEntries(
          unreviewedKeys.map((key) => [key, "manual" as const]),
        ),
      }));
      input.onError("检测到尚未核对的人工修改，请确认差异后重新选择识别字段");
      return;
    }
    const values = Object.fromEntries(
      rows
        .filter((row) => row.selected)
        .map((row) => [row.field.key, String(row.field.value ?? "")]),
    );
    const selected = input.attachmentsRef.current.find(
      (attachment) => attachment.category === category,
    );
    if (!selected || Object.keys(values).length === 0) return;
    const selectedState = input.materialStates[category];
    const nextAttachments = updateAttachmentOcrReviewMetadata(
      input.attachmentsRef.current,
      selected.object_key,
      {
        ocr_recognition_id:
          selectedState?.recognitionId ?? selected.ocr_recognition_id ?? null,
        ocr_review_status: "confirmed",
      },
    );
    const previousValues = readFormValues(formElement, Object.keys(values));
    const previousApplied = { ...appliedValues };
    const previousCurrent = { ...currentValues };
    const previousSources = { ...fieldSources };

    input.onReviewInvalidated();
    input.onError("");
    try {
      await input.onAttachmentsChange(nextAttachments, {
        intent: createApplymentAttachmentMutationIntent(
          input.attachmentsRef.current,
          nextAttachments,
        ),
        relatedMutation: {
          commitOptimistic: () => {
            writeFormValues(formElement, values);
            setAppliedValues((current) => ({ ...current, ...values }));
            setCurrentValues((current) => ({ ...current, ...values }));
            setFieldSources((current) => ({
              ...current,
              ...Object.fromEntries(
                Object.keys(values).map((key) => [key, "ocr" as const]),
              ),
            }));
          },
          rollback: () => {
            writeFormValues(formElement, previousValues);
            setAppliedValues(previousApplied);
            setCurrentValues(previousCurrent);
            setFieldSources(previousSources);
          },
        },
      });
    } catch (error) {
      input.onError(error instanceof Error
        ? error.message
        : "识别结果保存失败");
    }
  }

  async function useManualEntry(
    category: WechatPayApplymentAttachmentCategory,
  ) {
    const selected = input.attachmentsRef.current.find(
      (attachment) => attachment.category === category,
    );
    if (!selected) return;
    const nextAttachments = updateAttachmentOcrReviewMetadata(
      input.attachmentsRef.current,
      selected.object_key,
      {
        ocr_recognition_id: selected.ocr_recognition_id ?? null,
        ocr_review_status: "manual",
      },
    );
    input.onError("");
    try {
      await input.onAttachmentsChange(nextAttachments, {
        intent: createApplymentAttachmentMutationIntent(
          input.attachmentsRef.current,
          nextAttachments,
        ),
      });
    } catch (error) {
      input.onError(error instanceof Error
        ? error.message
        : "手动填写状态保存失败");
    }
  }

  return {
    appliedValues,
    currentValues,
    comparisonValues: getOcrComparisonValues(input.applyment, currentValues),
    fieldSources,
    onManualChange,
    applyRecognitionRows,
    useManualEntry,
  };
}

export function FinanceWechatPayApplymentOcrReview({
  attachments,
  materialStates,
  contactType,
  subjectType,
  values,
  comparisonValues,
  fieldSources,
  disabled,
  onManualChange,
  onApply,
  onUseManualEntry,
}: {
  attachments: readonly WechatPayApplymentAttachment[];
  materialStates: ApplymentMaterialStateMap;
  contactType: string;
  subjectType: string;
  values: Readonly<Record<string, string>>;
  comparisonValues: Readonly<Record<string, string>>;
  fieldSources: Readonly<Record<string, ApplymentFieldSource>>;
  disabled?: boolean;
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
    attachments.some((attachment) => attachment.category === category)
  ) ?? categories[0];
  const [selectedCategory, setSelectedCategory] =
    useState<WechatPayApplymentAttachmentCategory>(preferredCategory);

  useEffect(() => {
    if (!categories.includes(
      selectedCategory as (typeof categories)[number],
    )) {
      setSelectedCategory(preferredCategory);
    }
  }, [categories, preferredCategory, selectedCategory]);

  const selectedAttachment = attachments.find(
    (attachment) => attachment.category === selectedCategory,
  );
  const selectedState = materialStates[selectedCategory];
  const fields = useMemo(
    () => mapApplymentOcrFields(
      selectedCategory,
      selectedState?.fields ?? [],
      contactType,
    ),
    [contactType, selectedCategory, selectedState?.fields],
  );
  const rows = useMemo(
    () => buildOcrFieldReviewRows(fields, comparisonValues),
    [comparisonValues, fields],
  );
  const status = selectedState?.status ??
    (selectedAttachment ? "uploaded" : "missing");
  const statusMeta = STATUS_META[status];

  return (
    <section className="flex min-w-0 flex-col gap-4 rounded-md border p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold">证照识别核对</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            对照原件确认识别建议，有差异的字段不会自动覆盖。
          </p>
        </div>
        <Badge variant={statusMeta.variant}>{statusMeta.label}</Badge>
      </div>

      <Select
        value={selectedCategory}
        onValueChange={(value) =>
          setSelectedCategory(value as WechatPayApplymentAttachmentCategory)}
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

      <div className="grid min-h-0 gap-4 lg:grid-cols-[minmax(18rem,0.85fr)_minmax(0,1.15fr)]">
        <section className="min-w-0 lg:border-r lg:pr-4">
          <AttachmentDocumentPreview
            attachment={selectedAttachment}
            status={status}
          />
        </section>
        <section className="flex min-w-0 flex-col gap-4">
          <RecognitionWarnings warnings={selectedState?.warnings ?? []} />
          <FinanceWechatPayApplymentRecognizedFields
            selectedCategory={selectedCategory}
            contactType={contactType}
            subjectType={subjectType}
            values={values}
            fieldSources={fieldSources}
            disabled={disabled}
            onManualChange={onManualChange}
          />
          <OcrFieldReviewRows
            rows={rows}
            applyLabel="应用所选字段并确认"
            disabled={disabled || status === "recognizing"}
            onApply={(selectedRows) => onApply(
              selectedCategory,
              selectedRows,
            )}
          />
          {selectedAttachment && status !== "manual" ? (
            <div>
              <Button
                type="button"
                variant="outline"
                disabled={disabled}
                onClick={() => onUseManualEntry(selectedCategory)}
              >
                <PencilLine data-icon="inline-start" />
                改为手动填写
              </Button>
            </div>
          ) : null}
        </section>
      </div>
    </section>
  );
}

function readFormValues(
  form: HTMLFormElement,
  keys: readonly string[],
): Record<string, string> {
  return Object.fromEntries(keys.map((key) => {
    const control = form.elements.namedItem(key);
    return [
      key,
      control && "value" in control ? String(control.value) : "",
    ];
  }));
}

function writeFormValues(
  form: HTMLFormElement,
  values: Readonly<Record<string, string>>,
) {
  for (const [key, value] of Object.entries(values)) {
    const control = form.elements.namedItem(key);
    if (control && "value" in control) control.value = value;
  }
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

function AttachmentDocumentPreview({
  attachment,
  status,
}: {
  attachment?: WechatPayApplymentAttachment;
  status: ApplymentMaterialState["status"];
}) {
  const [attempt, setAttempt] = useState(0);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setAttempt(0);
    setFailed(false);
  }, [attachment?.object_key]);

  if (!attachment) {
    return (
      <div className="flex aspect-[4/3] items-center justify-center rounded-md border border-dashed bg-muted/30">
        <div className="flex flex-col items-center gap-2 text-muted-foreground">
          <FileImage aria-hidden="true" />
          <span className="text-sm">请先上传该资料</span>
        </div>
      </div>
    );
  }
  const previewUrl = buildWechatPayApplymentAttachmentPreviewUrl(attachment);
  const displayName = getWechatPayApplymentAttachmentDisplayName(attachment);
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <div className="flex aspect-[4/3] items-center justify-center overflow-hidden rounded-md border bg-muted/30">
        {previewUrl && !failed ? (
          <img
            key={attempt}
            src={previewUrl}
            alt={displayName}
            className="size-full object-contain"
            loading="lazy"
            referrerPolicy="no-referrer"
            onError={() => setFailed(true)}
          />
        ) : (
          <div className="flex flex-col items-center gap-2 text-center">
            <FileImage aria-hidden="true" />
            <span className="text-sm text-muted-foreground">预览加载失败</span>
            {previewUrl ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  setAttempt((value) => value + 1);
                  setFailed(false);
                }}
              >
                <RefreshCw data-icon="inline-start" />
                重试预览
              </Button>
            ) : null}
          </div>
        )}
      </div>
      <div className="truncate text-sm">{displayName}</div>
      <div className="text-xs text-muted-foreground">
        {STATUS_META[status].label}，私有附件仅供当前核对
      </div>
    </div>
  );
}
