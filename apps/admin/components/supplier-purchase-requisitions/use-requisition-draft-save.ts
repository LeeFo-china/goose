"use client";

import { useCallback, useRef, useState } from "react";
import { toast } from "sonner";

import {
  resolveSupplierCommandAttempt,
  type SupplierCommandAttempt,
} from "@/components/supplier-products/supplier-command-attempt";

import {
  createRequisitionDraft,
  loadRequisition,
  loadRequisitionItems,
  updateRequisitionDraft,
} from "./requisition-api";
import {
  refreshRequisitionAfterCommand,
} from "./requisition-command-refresh";
import {
  commandConflictMessage,
  errorCode,
  errorMessage,
  toRequisitionDraftPayload,
  validateRequisitionDraft,
  type RequisitionDraftErrors,
  type RequisitionDraftState,
} from "./requisition-page-utils";
import type {
  RequisitionCommandResult,
  RequisitionCreateDraftInput,
  RequisitionDetail,
  RequisitionItemPage,
  RequisitionRecord,
  RequisitionUpdateDraftInput,
} from "./requisition-types";

export function useRequisitionDraftSave({
  editingId,
  loadingDraft,
  onValidation,
  onCommandAccepted,
  onRefreshAccepted,
  onRefreshFailed,
}: {
  editingId: string | null;
  loadingDraft: boolean;
  onValidation: (errors: RequisitionDraftErrors) => void;
  onCommandAccepted: (record: RequisitionRecord) => void;
  onRefreshAccepted: (
    detail: RequisitionDetail,
    itemPage: RequisitionItemPage,
  ) => void;
  onRefreshFailed: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [attempt, setAttempt] = useState<SupplierCommandAttempt | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [conflict, setConflict] = useState<string | null>(null);
  const [refreshRequired, setRefreshRequired] = useState(false);
  const refreshGeneration = useRef(0);

  const invalidateRefresh = useCallback(() => {
    refreshGeneration.current += 1;
    setRefreshing(false);
  }, []);

  async function refreshSavedDraft(targetId: string) {
    const generation = ++refreshGeneration.current;
    setRefreshing(true);
    const refreshed = await refreshRequisitionAfterCommand(() =>
      Promise.all([
        loadRequisition(targetId),
        loadRequisitionItems(targetId),
      ])
    );
    if (refreshGeneration.current !== generation) return false;
    setRefreshing(false);
    if (refreshed.status === "refresh_failed") {
      onRefreshFailed();
      setRefreshRequired(true);
      setError("草稿已成功保存，但最新数据刷新失败，请手动刷新。");
      return false;
    }
    const [detail, itemPage] = refreshed.value;
    onRefreshAccepted(detail, itemPage);
    setRefreshRequired(false);
    setError(null);
    return true;
  }

  async function saveDraft(draft: RequisitionDraftState) {
    const errors = validateRequisitionDraft(draft);
    onValidation(errors);
    if (
      Object.keys(errors).length > 0 ||
      saving ||
      refreshing ||
      refreshRequired ||
      loadingDraft
    ) return;
    const payload = toRequisitionDraftPayload(draft);
    const scope = editingId
      ? "purchase-requisition:update"
      : "purchase-requisition:create";
    const nextAttempt = resolveSupplierCommandAttempt(attempt, {
      scope,
      resourcePath: editingId ?? "new",
      payload,
      ...(!editingId ? { allocateResourceId: true as const } : {}),
    });
    setAttempt(nextAttempt);
    setSaving(true);
    setError(null);
    setConflict(null);
    let commandResult: RequisitionCommandResult;
    try {
      const id = editingId ?? nextAttempt.resourceId;
      if (!id) throw new Error("采购申请资源编号生成失败");
      if (editingId) {
        commandResult = await updateRequisitionDraft(
          id,
          payload as RequisitionUpdateDraftInput,
          nextAttempt,
        );
      } else {
        if (!nextAttempt.resourceId) throw new Error("采购申请编号生成失败");
        commandResult = await createRequisitionDraft(
          payload as RequisitionCreateDraftInput,
          { ...nextAttempt, resourceId: nextAttempt.resourceId },
        );
      }
    } catch (caught) {
      const nextConflict = commandConflictMessage(errorCode(caught));
      setConflict(nextConflict);
      setError(nextConflict ?? errorMessage(caught, "采购申请草稿保存失败"));
      setSaving(false);
      return;
    }
    setAttempt(null);
    setRefreshRequired(true);
    onCommandAccepted(commandResult.requisition);
    toast.success("采购申请草稿已保存");
    await refreshSavedDraft(commandResult.requisition.id);
    setSaving(false);
  }

  return {
    attempt,
    conflict,
    error,
    refreshRequired,
    refreshing,
    saving,
    invalidateRefresh,
    refreshSavedDraft,
    saveDraft,
    setAttempt,
    setConflict,
    setError,
    setRefreshRequired,
  };
}
