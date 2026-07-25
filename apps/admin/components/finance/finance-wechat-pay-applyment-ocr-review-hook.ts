"use client";

import {
  type RefObject,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import type { OcrFieldSuggestion } from "@gooes/domain";
import {
  buildOcrFieldReviewRows,
  getUnreviewedOcrConflictKeys,
  mapApplymentOcrFields,
  type OcrFieldReviewRow,
} from "@/components/ocr/ocr-field-review-dialog";
import type {
  ApplymentFieldSource,
} from "./finance-wechat-pay-applyment-form-fields";
import {
  getCurrentApplymentAttachment,
  updateCurrentApplymentAttachmentOcrReviewMetadata,
  type ApplymentMaterialStateMap,
} from "./finance-wechat-pay-applyment-flow-model";
import {
  createApplymentAttachmentMutationIntent,
  type ApplymentAttachmentChangeOptions,
} from "./finance-wechat-pay-applyment-manual-entry";
import {
  createOcrReviewMutationGeneration,
  runGenerationGuardedOcrReviewMutation,
  setupOcrReviewMutationGeneration,
} from "./finance-wechat-pay-applyment-ocr-mutation";
import {
  getOcrComparisonValues,
  getStoredFieldSources,
  getStoredOcrValues,
} from "./finance-wechat-pay-applyment-recognized-fields";
import type {
  WechatPayApplymentAttachment,
  WechatPayApplymentAttachmentCategory,
  WechatPayApplymentRecord,
} from "./finance-wechat-pay-applyment-shared";

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
  const mutationResetKey =
    `${input.applyment?.id ?? "new"}:${input.applyment?.updated_at ?? ""}`;
  const mutationGenerationRef = useRef(createOcrReviewMutationGeneration());

  useLayoutEffect(
    () => setupOcrReviewMutationGeneration(mutationGenerationRef.current),
    [mutationResetKey],
  );

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
    options: { confirmWhenNoSelected?: boolean } = {},
  ) {
    const formElement = input.formRef.current;
    if (!formElement) return;
    const selectedRows = rows.filter((row) => row.selected);
    const selectedKeys = selectedRows.map((row) => row.field.key);
    const liveValues = readFormValues(formElement, selectedKeys);
    const unreviewedKeys = getUnreviewedOcrConflictKeys(rows, liveValues);
    if (unreviewedKeys.length > 0) {
      preserveManualConflicts(liveValues, unreviewedKeys);
      return;
    }
    const values = Object.fromEntries(
      selectedRows
        .map((row) => [row.field.key, String(row.field.value ?? "")]),
    );
    const selected = getCurrentApplymentAttachment(
      input.attachmentsRef.current,
      category,
    );
    const valueKeys = Object.keys(values);
    if (
      !selected ||
      (valueKeys.length === 0 && !options.confirmWhenNoSelected)
    ) return;
    const selectedState = input.materialStates[category];
    const recognitionId = selectedState?.attachmentObjectKey ===
        selected.object_key
      ? selectedState.recognitionId
      : selected.ocr_recognition_id ?? null;
    const update = updateCurrentApplymentAttachmentOcrReviewMetadata(
      input.attachmentsRef.current,
      category,
      {
        ocr_recognition_id: recognitionId,
        ocr_review_status: "confirmed",
      },
    );
    if (!update) return;
    const nextAttachments = update.attachments;
    const previousValues = readFormValues(formElement, valueKeys);
    const previousApplied = { ...appliedValues };
    const previousCurrent = { ...currentValues };
    const previousSources = { ...fieldSources };
    const generation = mutationGenerationRef.current.current();

    input.onReviewInvalidated();
    input.onError("");
    return await runGenerationGuardedOcrReviewMutation({
      generation,
      isCurrentGeneration: mutationGenerationRef.current.isCurrent,
      mutate: () => input.onAttachmentsChange(nextAttachments, {
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
                valueKeys.map((key) => [key, "ocr" as const]),
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
      }),
      fallbackMessage: "识别结果保存失败",
      onError: input.onError,
    });
  }

  function confirmRecognitionFields(
    category: WechatPayApplymentAttachmentCategory,
    fields: readonly OcrFieldSuggestion[],
    contactType: string,
  ) {
    const rows = buildOcrFieldReviewRows(
      mapApplymentOcrFields(category, fields, contactType),
      getOcrComparisonValues(input.applyment, currentValues),
    );
    return applyRecognitionRows(category, rows, {
      confirmWhenNoSelected: true,
    });
  }

  async function useManualEntry(
    category: WechatPayApplymentAttachmentCategory,
  ) {
    const selected = getCurrentApplymentAttachment(
      input.attachmentsRef.current,
      category,
    );
    if (!selected) return;
    const update = updateCurrentApplymentAttachmentOcrReviewMetadata(
      input.attachmentsRef.current,
      category,
      {
        ocr_recognition_id: selected.ocr_recognition_id ?? null,
        ocr_review_status: "manual",
      },
    );
    if (!update) return;
    const nextAttachments = update.attachments;
    const generation = mutationGenerationRef.current.current();
    input.onError("");
    await runGenerationGuardedOcrReviewMutation({
      generation,
      isCurrentGeneration: mutationGenerationRef.current.isCurrent,
      mutate: () => input.onAttachmentsChange(nextAttachments, {
        intent: createApplymentAttachmentMutationIntent(
          input.attachmentsRef.current,
          nextAttachments,
        ),
      }),
      fallbackMessage: "手动填写状态保存失败",
      onError: input.onError,
    });
  }

  function preserveManualConflicts(
    liveValues: Record<string, string>,
    unreviewedKeys: string[],
  ) {
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
  }

  return {
    appliedValues,
    currentValues,
    comparisonValues: getOcrComparisonValues(input.applyment, currentValues),
    fieldSources,
    onManualChange,
    applyRecognitionRows,
    confirmRecognitionFields,
    useManualEntry,
  };
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
