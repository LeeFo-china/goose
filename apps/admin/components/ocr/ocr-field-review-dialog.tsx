"use client";

import { useEffect, useMemo, useState } from "react";
import type { OcrFieldSuggestion, OcrWarning } from "@gooes/domain";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  Eye,
  EyeOff,
} from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { FieldLabel } from "@/components/ui/field";
import {
  Empty,
  EmptyDescription,
} from "@/components/ui/empty";

type ReviewState = "empty" | "consistent" | "conflict";

export type OcrFieldReviewRow = {
  field: OcrFieldSuggestion;
  currentValue: string;
  selected: boolean;
  state: ReviewState;
};

const APPLYMENT_FIELD_KEYS = new Set([
  "license_name",
  "license_code",
  "license_address",
  "license_period_begin",
  "license_period_end",
  "legal_representative_name",
  "identity_name",
  "identity_number",
  "identity_address",
  "identity_period_begin",
  "identity_period_end",
  "super_admin_name",
  "contact_identity_number",
  "contact_identity_address",
  "contact_identity_period_begin",
  "contact_identity_period_end",
  "settlement_account_number",
  "settlement_bank_name",
]);

const CONTACT_FRONT_FIELD_MAP: Record<string, [string, string]> = {
  identity_name: ["super_admin_name", "超级管理员姓名"],
  identity_number: ["contact_identity_number", "经办人身份证号码"],
  identity_address: ["contact_identity_address", "经办人身份证地址"],
};
const CONTACT_BACK_FIELD_MAP: Record<string, [string, string]> = {
  identity_period_begin: ["contact_identity_period_begin", "经办人证件有效期开始"],
  identity_period_end: ["contact_identity_period_end", "经办人证件有效期结束"],
};

export function mapApplymentOcrFields(
  category: string,
  fields: readonly OcrFieldSuggestion[],
  contactType = "SUPER",
) {
  const fieldMap = category === "contact_id_card_front"
    ? CONTACT_FRONT_FIELD_MAP
    : category === "contact_id_card_back"
    ? CONTACT_BACK_FIELD_MAP
    : null;
  return fields.flatMap((field) => {
    const mapped = fieldMap?.[field.key];
    const candidates: OcrFieldSuggestion[] = [
      mapped ? { ...field, key: mapped[0], label: mapped[1] } : field,
    ];
    if (
      category === "legal_representative_id_card_front" &&
      field.key === "identity_name" &&
      contactType === "LEGAL"
    ) {
      candidates.push({
        ...field,
        key: "super_admin_name",
        label: "超级管理员姓名",
      });
    }
    return candidates.filter((item) => APPLYMENT_FIELD_KEYS.has(item.key));
  });
}

export function buildOcrFieldReviewRows(
  fields: readonly OcrFieldSuggestion[],
  currentValues: Record<string, string>,
): OcrFieldReviewRow[] {
  return fields.map((field) => {
    const currentValue = currentValues[field.key]?.trim() ?? "";
    const recognizedValue = String(field.value ?? "").trim();
    const state = !currentValue
      ? "empty"
      : normalizeComparable(field.key, currentValue) ===
          normalizeComparable(field.key, recognizedValue)
      ? "consistent"
      : "conflict";
    return {
      field,
      currentValue,
      selected: state === "empty",
      state,
    };
  });
}

export function getUnreviewedOcrConflictKeys(
  rows: readonly OcrFieldReviewRow[],
  currentValues: Readonly<Record<string, string>>,
) {
  return rows.flatMap((row) => {
    if (!row.selected) return [];
    const currentValue = currentValues[row.field.key] ?? "";
    const normalizedCurrent = normalizeComparable(row.field.key, currentValue);
    const changedSinceReview = normalizedCurrent !== normalizeComparable(
      row.field.key,
      row.currentValue,
    );
    const conflictsWithSuggestion = Boolean(currentValue) &&
      normalizedCurrent !== normalizeComparable(
        row.field.key,
        String(row.field.value ?? ""),
      );
    return changedSinceReview && conflictsWithSuggestion
      ? [row.field.key]
      : [];
  });
}

export function formatOcrReviewValue(
  field: OcrFieldSuggestion,
  value: OcrFieldSuggestion["value"],
  revealed: boolean,
) {
  const text = String(value ?? "").trim();
  if (!field.sensitive || revealed || !text) return text;
  if (
    field.key.includes("identity_number") ||
    field.key === "settlement_account_number"
  ) {
    return `${text.slice(0, 3)}••••${text.slice(-4)}`;
  }
  return `${text.slice(0, 2)}••••`;
}

function normalizeComparable(key: string, value: string) {
  if (key.includes("identity_number")) {
    return value.replace(/\s/g, "").toUpperCase();
  }
  if (key === "settlement_account_number") return value.replace(/\D/g, "");
  return value.trim().replace(/\s+/g, " ");
}

export function groupOcrFieldReviewRows(
  rows: readonly OcrFieldReviewRow[],
) {
  return {
    persistent: rows.filter((row) =>
      row.state === "conflict" || row.state === "empty"
    ),
    collapsible: rows.filter((row) => row.state === "consistent"),
  };
}

export function OcrFieldReviewRows({
  rows,
  applyLabel = "应用所选字段",
  disabled,
  onApply,
}: {
  rows: readonly OcrFieldReviewRow[];
  applyLabel?: string;
  disabled?: boolean;
  onApply: (rows: readonly OcrFieldReviewRow[]) => void;
}) {
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [revealedSensitiveKeys, setRevealedSensitiveKeys] = useState<Set<string>>(
    new Set(),
  );
  const groupedRows = groupOcrFieldReviewRows(rows);

  useEffect(() => {
    setSelectedKeys(new Set(
      rows.filter((row) => row.selected).map((row) => row.field.key),
    ));
    setRevealedSensitiveKeys(new Set());
  }, [rows]);

  function applySelected() {
    onApply(rows.map((row) => ({
      ...row,
      selected: selectedKeys.has(row.field.key),
    })));
  }

  return (
    <div className="flex min-w-0 flex-col gap-3">
      {groupedRows.persistent.length > 0 ? (
        <ReviewRowGroup
          title="需要核对的差异和缺失"
          rows={groupedRows.persistent}
          selectedKeys={selectedKeys}
          revealedSensitiveKeys={revealedSensitiveKeys}
          onSelectedKeysChange={setSelectedKeys}
          onRevealedSensitiveKeysChange={setRevealedSensitiveKeys}
        />
      ) : null}
      {groupedRows.collapsible.length > 0 ? (
        <Collapsible defaultOpen={groupedRows.persistent.length === 0}>
          <CollapsibleTrigger asChild>
            <Button type="button" variant="ghost" className="w-full justify-between">
              其他识别建议（{groupedRows.collapsible.length}）
              <ChevronDown data-icon="inline-end" />
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <ReviewRowGroup
              rows={groupedRows.collapsible}
              selectedKeys={selectedKeys}
              revealedSensitiveKeys={revealedSensitiveKeys}
              onSelectedKeysChange={setSelectedKeys}
              onRevealedSensitiveKeysChange={setRevealedSensitiveKeys}
            />
          </CollapsibleContent>
        </Collapsible>
      ) : null}
      {rows.length === 0 ? (
        <Empty className="border py-6 md:p-6">
          <EmptyDescription>
            暂无可应用的识别建议，请直接核对并填写右侧字段。
          </EmptyDescription>
        </Empty>
      ) : null}
      <div className="flex justify-end">
        <Button
          type="button"
          disabled={disabled || selectedKeys.size === 0}
          onClick={applySelected}
        >
          {applyLabel}
        </Button>
      </div>
    </div>
  );
}

function ReviewRowGroup({
  title,
  rows,
  selectedKeys,
  revealedSensitiveKeys,
  onSelectedKeysChange,
  onRevealedSensitiveKeysChange,
}: {
  title?: string;
  rows: readonly OcrFieldReviewRow[];
  selectedKeys: ReadonlySet<string>;
  revealedSensitiveKeys: ReadonlySet<string>;
  onSelectedKeysChange: (keys: Set<string>) => void;
  onRevealedSensitiveKeysChange: (keys: Set<string>) => void;
}) {
  return (
    <div className="overflow-hidden rounded-md border">
      {title ? (
        <div className="border-b bg-muted/40 px-4 py-2 text-xs font-medium">
          {title}
        </div>
      ) : null}
      {rows.map((row) => {
        const checked = selectedKeys.has(row.field.key);
        const revealed = revealedSensitiveKeys.has(row.field.key);
        return (
          <div
            key={row.field.key}
            className="grid gap-3 border-b p-4 last:border-b-0 md:grid-cols-[28px_150px_minmax(0,1fr)_minmax(0,1fr)]"
          >
            <Checkbox
              id={`ocr-review-${row.field.key}`}
              checked={checked}
              onCheckedChange={(value) => {
                const next = new Set(selectedKeys);
                if (value === true) next.add(row.field.key);
                else next.delete(row.field.key);
                onSelectedKeysChange(next);
              }}
            />
            <div className="flex min-w-0 flex-col items-start gap-2">
              <FieldLabel htmlFor={`ocr-review-${row.field.key}`}>
                {row.field.label}
              </FieldLabel>
              {row.field.sensitive ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  aria-label={revealed ? "隐藏敏感字段" : "显示敏感字段"}
                  onClick={() => {
                    const next = new Set(revealedSensitiveKeys);
                    if (revealed) next.delete(row.field.key);
                    else next.add(row.field.key);
                    onRevealedSensitiveKeysChange(next);
                  }}
                >
                  {revealed
                    ? <EyeOff data-icon="inline-start" />
                    : <Eye data-icon="inline-start" />}
                  {revealed ? "隐藏" : "显示"}
                </Button>
              ) : null}
            </div>
            <div className="min-w-0">
              <div className="text-xs text-muted-foreground">当前表单</div>
              <div className="mt-1 break-all text-sm">
                {row.currentValue
                  ? formatOcrReviewValue(row.field, row.currentValue, revealed)
                  : "未填写"}
              </div>
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                识别建议
                <ReviewStateBadge row={row} />
                {typeof row.field.confidence === "number" ? (
                  <span>{formatConfidence(row.field.confidence)}</span>
                ) : null}
              </div>
              <div className="mt-1 break-all text-sm font-medium">
                {formatOcrReviewValue(row.field, row.field.value, revealed) || "-"}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ReviewStateBadge({ row }: { row: OcrFieldReviewRow }) {
  if (row.state === "consistent") {
    return <Badge variant="success"><CheckCircle2 />一致</Badge>;
  }
  if (row.state === "conflict") return <Badge variant="warning">有差异</Badge>;
  return <Badge variant="secondary">待补充</Badge>;
}

function formatConfidence(confidence: number) {
  const percentage = confidence <= 1 ? confidence * 100 : confidence;
  return `${Math.round(percentage)}%`;
}

export function OcrFieldReviewDialog({
  open,
  fields,
  warnings,
  currentValues,
  onOpenChange,
  onApply,
}: {
  open: boolean;
  fields: readonly OcrFieldSuggestion[];
  warnings: readonly OcrWarning[];
  currentValues: Record<string, string>;
  onOpenChange: (open: boolean) => void;
  onApply: (values: Record<string, string>) => void;
}) {
  const initialRows = useMemo(
    () => buildOcrFieldReviewRows(fields, currentValues),
    [currentValues, fields],
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>核对识别结果</DialogTitle>
          <DialogDescription>
            识别内容仅作为填写建议。请逐项核对原件，勾选后只更新当前表单，不会自动保存或提交申请。
          </DialogDescription>
        </DialogHeader>

        {warnings.length > 0 ? (
          <Alert>
            <AlertTriangle />
            <AlertTitle>需要人工复核</AlertTitle>
            <AlertDescription>
              {warnings.map((warning) => (
                <div key={warning.code}>{warning.message}（{warning.code}）</div>
              ))}
            </AlertDescription>
          </Alert>
        ) : null}

        <OcrFieldReviewRows
          rows={initialRows}
          onApply={(rows) => {
            onApply(Object.fromEntries(
              rows
                .filter((row) => row.selected)
                .map((row) => [
                  row.field.key,
                  String(row.field.value ?? ""),
                ]),
            ));
            onOpenChange(false);
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
