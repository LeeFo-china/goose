"use client";

import { StatusAlert } from "@/components/admin/status-alert";
import type { ProcurementSummary } from "@/components/supplier-procurement-editor/procurement-editor-rules";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";

import { formatRequisitionMoney } from "./requisition-page-utils";

export function RequisitionEditorAlerts({
  error,
  conflict,
  hasAttempt,
  saving,
  loadingDraft,
  refreshRequired,
  editingId,
  refreshing,
  onAbandonAttempt,
  onRefresh,
}: {
  error: string | null;
  conflict: string | null;
  hasAttempt: boolean;
  saving: boolean;
  loadingDraft: boolean;
  refreshRequired: boolean;
  editingId: string | null;
  refreshing: boolean;
  onAbandonAttempt: () => void;
  onRefresh: () => void;
}) {
  if (!error && !hasAttempt && !refreshRequired) return null;
  return (
    <div className="space-y-2 border-b px-5 py-3">
      {error ? <StatusAlert>{error}</StatusAlert> : null}
      {hasAttempt && !saving ? (
        <div className="flex flex-wrap items-center gap-2">
          <StatusAlert tone={conflict ? "error" : "warning"}>
            {conflict
              ? "本次保存与最新数据冲突，可放弃原请求并重新加载。"
              : "存在结果未确认的保存请求，字段已锁定。请使用原请求重试，关闭窗口不会清除请求。"}
          </StatusAlert>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={loadingDraft}
            onClick={onAbandonAttempt}
          >
            放弃本次重试并刷新
          </Button>
        </div>
      ) : null}
      {refreshRequired && editingId ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={loadingDraft || refreshing || saving}
          onClick={onRefresh}
        >
          {refreshing ? <Spinner data-icon="inline-start" /> : null}
          刷新最新数据
        </Button>
      ) : null}
    </div>
  );
}

export function RequisitionEditorFooter({
  summary,
  loading,
  saving,
  refreshing,
  refreshRequired,
  hasAttempt,
  onClose,
  onSave,
}: {
  summary: ProcurementSummary;
  loading: boolean;
  saving: boolean;
  refreshing: boolean;
  refreshRequired: boolean;
  hasAttempt: boolean;
  onClose: () => void;
  onSave: () => void;
}) {
  const locked = loading || saving || refreshing || refreshRequired;
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
      <div
        className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs sm:flex sm:flex-wrap sm:text-sm"
        aria-live="polite"
      >
        <span>
          <strong className="tabular-nums">{summary.itemCount}</strong> 个 SKU
        </span>
        <span>
          参考货值{" "}
          <strong className="tabular-nums">
            {formatRequisitionMoney(summary.referenceAmount)}
          </strong>
        </span>
        <span
          className={
            summary.missingCategoryCount
              ? "font-medium text-warning-foreground"
              : "text-muted-foreground"
          }
        >
          待选成本类目{" "}
          <strong className="tabular-nums">
            {summary.missingCategoryCount}
          </strong>
        </span>
      </div>
      <div className="flex shrink-0 justify-end gap-2">
        <Button
          type="button"
          variant="outline"
          className="min-h-11 md:min-h-9"
          disabled={saving}
          onClick={onClose}
        >
          关闭
        </Button>
        <Button
          type="button"
          className="min-h-11 md:min-h-9"
          disabled={locked}
          onClick={onSave}
        >
          {saving ? <Spinner data-icon="inline-start" /> : null}
          {saving ? "正在保存…" : hasAttempt ? "使用原请求重试" : "保存草稿"}
        </Button>
      </div>
    </div>
  );
}
