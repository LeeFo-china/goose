"use client";

import { useId } from "react";

import { StatusAlert } from "@/components/admin/status-alert";
import { ProcurementConfirmDialog } from "@/components/supplier-procurement-editor/procurement-confirm-dialog";
import type { ProcurementSummary } from "@/components/supplier-procurement-editor/procurement-editor-rules";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";

import { formatRequisitionMoney } from "./requisition-page-utils";

export function RequisitionEditorConfirmations({
  contextOpen,
  lineCount,
  closeOpen,
  onCancelContext,
  onConfirmContext,
  onCancelClose,
  onConfirmClose,
}: {
  contextOpen: boolean;
  lineCount: number;
  closeOpen: boolean;
  onCancelContext: () => void;
  onConfirmContext: () => void;
  onCancelClose: () => void;
  onConfirmClose: () => void;
}) {
  return (
    <>
      <ProcurementConfirmDialog
        open={contextOpen}
        title="更换采购范围？"
        description={`更换项目或合作供应商会清空 ${lineCount} 个已选商品。`}
        confirmLabel="清空并更换"
        onCancel={onCancelContext}
        onConfirm={onConfirmContext}
      />
      <ProcurementConfirmDialog
        open={closeOpen}
        title="放弃未保存的更改？"
        description="当前采购申请有尚未保存的修改，关闭后这些修改不会保留。"
        confirmLabel="放弃更改"
        onCancel={onCancelClose}
        onConfirm={onConfirmClose}
      />
    </>
  );
}

export function RequisitionEditorAlerts({
  error,
  conflict,
  hasAttempt,
  saving,
  loadingDraft,
  draftLoadFailed,
  refreshRequired,
  editingId,
  refreshing,
  onAbandonAttempt,
  onRetryLoad,
  onRefresh,
}: {
  error: string | null;
  conflict: string | null;
  hasAttempt: boolean;
  saving: boolean;
  loadingDraft: boolean;
  draftLoadFailed: boolean;
  refreshRequired: boolean;
  editingId: string | null;
  refreshing: boolean;
  onAbandonAttempt: () => void;
  onRetryLoad: () => void;
  onRefresh: () => void;
}) {
  if (!error && !hasAttempt && !refreshRequired && !draftLoadFailed) {
    return null;
  }
  return (
    <div className="space-y-2 border-b px-5 py-3">
      {error ? <StatusAlert>{error}</StatusAlert> : null}
      {draftLoadFailed ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={loadingDraft}
          onClick={onRetryLoad}
        >
          重新加载采购申请
        </Button>
      ) : null}
      {hasAttempt && !saving ? (
        <div className="flex flex-wrap items-center gap-2">
          <StatusAlert tone={conflict ? "error" : "warning"}>
            {conflict
              ? "本次保存与最新数据冲突，可放弃原请求并重新加载。"
              : "存在结果未确认的保存请求，字段和窗口已锁定。请使用原请求重试，或放弃原请求后再关闭。"}
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
  draftReady,
  hasAttempt,
  onClose,
  onSave,
}: {
  summary: ProcurementSummary;
  loading: boolean;
  saving: boolean;
  refreshing: boolean;
  refreshRequired: boolean;
  draftReady: boolean;
  hasAttempt: boolean;
  onClose: () => void;
  onSave: () => void;
}) {
  const locked =
    loading || saving || refreshing || refreshRequired || !draftReady;
  const closeDescriptionId = useId();
  const closeLocked = saving || hasAttempt;
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
      <div className="flex shrink-0 flex-col items-end gap-1">
        {hasAttempt ? (
          <span
            id={closeDescriptionId}
            className="text-xs text-warning-foreground"
          >
            请先重试确认或放弃原请求，再关闭窗口
          </span>
        ) : null}
        <div className="flex justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            className="min-h-11 md:min-h-9"
            disabled={closeLocked}
            aria-describedby={hasAttempt ? closeDescriptionId : undefined}
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
            {saving
              ? "正在保存…"
              : hasAttempt
              ? "使用原请求重试"
              : "保存草稿"}
          </Button>
        </div>
      </div>
    </div>
  );
}
