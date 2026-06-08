"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { type ProjectLogStageCode } from "@gooes/domain";
import type { ProjectRecord } from "@/components/projects/project-mutations";
import type {
  AcceptanceDialogState,
  AcceptanceTemplate,
  ConstructionStageItem,
  ProjectAcceptance,
} from "@/components/projects/project-acceptance-types";
import {
  approveProjectAcceptance,
  createFinalProjectAcceptance,
  createStageAcceptance,
  deleteProjectAcceptanceDraft,
  loadFinalAcceptanceTemplate,
  loadProjectAcceptanceData,
  notifyProjectAcceptanceCustomer,
  rejectProjectAcceptance,
  saveProjectAcceptance,
} from "@/components/projects/project-acceptances-panel-api";
import { getProjectAcceptancesPanelDerived } from "@/components/projects/project-acceptances-panel-derived";
import { useProjectAcceptanceEditableState } from "@/components/projects/project-acceptances-panel-editable-state";
import {
  formatDateTime,
  getAcceptanceDisplayTitle,
} from "@/components/projects/project-acceptance-utils";

function resolveSelectedAcceptanceId(
  list: ProjectAcceptance[],
  requestedId: string | undefined,
  currentId: string,
  preferredId = "",
): string {
  if (preferredId && list.some((item) => item.id === preferredId)) return preferredId;
  if (requestedId && list.some((item) => item.id === requestedId)) return requestedId;
  if (currentId && list.some((item) => item.id === currentId)) return currentId;
  return list[0]?.id || "";
}

export function useProjectAcceptancesPanel(
  project: ProjectRecord,
  active: boolean,
  options: {
    selectedAcceptanceId?: string;
    onSelectedAcceptanceIdChange?: (id: string) => void;
  } = {},
) {
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState("");
  const [acceptances, setAcceptances] = useState<ProjectAcceptance[]>([]);
  const [constructionStages, setConstructionStages] = useState<ConstructionStageItem[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const selectedIdRef = useRef("");
  const lastEmittedSelectedIdRef = useRef("");
  const externalSelectedIdRef = useRef(options.selectedAcceptanceId || "");
  const localPreferredSelectedIdRef = useRef("");
  const [stageCode, setStageCode] = useState<ProjectLogStageCode>(
    "plumbing_electrical",
  );
  const [actionDialog, setActionDialog] = useState<AcceptanceDialogState>(null);
  const [actionDialogError, setActionDialogError] = useState("");
  const [templateDialogOpen, setTemplateDialogOpen] = useState(false);
  const [templateLoading, setTemplateLoading] = useState(false);
  const [templateError, setTemplateError] = useState("");
  const [finalTemplate, setFinalTemplate] = useState<AcceptanceTemplate | null>(null);
  const {
    selected,
    latestCustomerDispute,
    latestRejectAction,
    selectedStats,
    selectedSections,
    occupiedStages,
    selectableStageOptions,
    firstAvailableStage,
    selectedStageBlockedReason,
    selectedStageBlocked,
    canCreateByProjectStatus,
    canCreateAcceptance,
    canCreateFinalAcceptance,
    finalAcceptanceBlockedReason,
    summary,
  } = useMemo(
    () => getProjectAcceptancesPanelDerived({
      acceptances,
      constructionStages,
      selectedId,
      stageCode,
      projectStatus: project.status,
    }),
    [acceptances, constructionStages, project.status, selectedId, stageCode],
  );
  const {
    uploadingItemId,
    editable,
    setEditable,
    updateEditableItem,
    uploadImages,
  } = useProjectAcceptanceEditableState({
    selected,
    projectId: project.id,
    setError,
  });

  const emitSelectedAcceptanceId = (id: string, force = false) => {
    if (!options.onSelectedAcceptanceIdChange) return;
    if (!force && id === lastEmittedSelectedIdRef.current) return;
    lastEmittedSelectedIdRef.current = id;
    options.onSelectedAcceptanceIdChange(id);
  };

  const selectAcceptanceId = (
    id: string,
    settings: {
      emit?: boolean;
      forceEmit?: boolean;
      preferReload?: boolean;
    } = {},
  ) => {
    if (settings.preferReload) {
      localPreferredSelectedIdRef.current = id;
    }

    if (id !== selectedIdRef.current) {
      selectedIdRef.current = id;
      setSelectedId(id);
    }

    if (settings.emit !== false) {
      emitSelectedAcceptanceId(id, settings.forceEmit);
    }
  };

  const loadAcceptances = async () => {
    setLoading(true);
    setError("");
    try {
      const [data, stageData] = await loadProjectAcceptanceData(project.id);
      const list = data.list || [];
      setAcceptances(list);
      setConstructionStages(stageData.stages || []);
      const nextSelectedId = resolveSelectedAcceptanceId(
        list,
        options.selectedAcceptanceId,
        selectedIdRef.current,
        localPreferredSelectedIdRef.current,
      );
      selectAcceptanceId(nextSelectedId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "验收列表加载失败");
      setAcceptances([]);
      setConstructionStages([]);
      selectAcceptanceId("");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!active) return;
    void loadAcceptances();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, project.id]);

  useEffect(() => {
    if (acceptances.length === 0) return;
    const requestedId = options.selectedAcceptanceId || "";
    const externalSelectionChanged = requestedId !== externalSelectedIdRef.current;
    if (externalSelectionChanged) {
      externalSelectedIdRef.current = requestedId;
      localPreferredSelectedIdRef.current = "";
    }
    const preferredId = localPreferredSelectedIdRef.current;
    const nextSelectedId = resolveSelectedAcceptanceId(
      acceptances,
      requestedId,
      selectedIdRef.current,
      preferredId,
    );
    const requestedValid = Boolean(
      requestedId && acceptances.some((item) => item.id === requestedId),
    );
    const shouldNormalizeUrl = Boolean(
      options.onSelectedAcceptanceIdChange
      && nextSelectedId
      && ((requestedId && !requestedValid) || (!requestedId && nextSelectedId)),
    );
    selectAcceptanceId(nextSelectedId, { forceEmit: shouldNormalizeUrl });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [options.selectedAcceptanceId, acceptances]);

  useEffect(() => {
    if (!firstAvailableStage) return;
    if (!stageCode || occupiedStages.has(stageCode)) {
      setStageCode(firstAvailableStage.value);
    }
  }, [firstAvailableStage?.value, occupiedStages, stageCode]);

  const runAction = async (action: () => Promise<void>) => {
    setActionLoading(true);
    setError("");
    try {
      await action();
      await loadAcceptances();
    } catch (err) {
      setError(err instanceof Error ? err.message : "操作失败");
    } finally {
      setActionLoading(false);
    }
  };

  const openActionDialog = (type: "approve" | "reject" | "delete") => {
    if (!selected) return;
    setActionDialogError("");
    setActionDialog({
      type,
      acceptanceId: selected.id,
      title: getAcceptanceDisplayTitle(selected),
      comment: type === "approve" ? "复核通过" : "",
    });
  };

  const closeActionDialog = () => {
    if (actionLoading) return;
    setActionDialog(null);
    setActionDialogError("");
  };

  const createAcceptance = () =>
    runAction(async () => {
      if (!canCreateAcceptance) {
        throw new Error("当前无可发起的工序验收");
      }
      const created = await createStageAcceptance({
        projectId: project.id,
        stageCode,
      });
      selectAcceptanceId(created.id, { preferReload: true });
    });

  const createFinalAcceptance = () =>
    runAction(async () => {
      if (!canCreateFinalAcceptance) {
        throw new Error(finalAcceptanceBlockedReason || "当前不可发起竣工交付验收");
      }
      const created = await createFinalProjectAcceptance(project.id);
      selectAcceptanceId(created.id, { preferReload: true });
    });

  const openTemplateDialog = async () => {
    setTemplateDialogOpen(true);
    setTemplateError("");
    if (finalTemplate) return;

    setTemplateLoading(true);
    try {
      const data = await loadFinalAcceptanceTemplate();
      setFinalTemplate(data.template || null);
      if (!data.hasTemplate) {
        setTemplateError("当前没有启用的竣工交付验收模板");
      }
    } catch (err) {
      setTemplateError(err instanceof Error ? err.message : "竣工模板加载失败");
    } finally {
      setTemplateLoading(false);
    }
  };

  const saveAcceptance = (submit = false) =>
    runAction(async () => {
      if (!selected) return;
      await saveProjectAcceptance({
        acceptanceId: selected.id,
        editable,
        submit,
      });
    });

  const approveAcceptance = (acceptanceId: string, comment: string) =>
    runAction(async () => {
      await approveProjectAcceptance({ acceptanceId, comment });
      setActionDialog(null);
    });

  const rejectAcceptance = (acceptanceId: string, comment: string) => {
    const normalizedComment = comment.trim();
    if (!normalizedComment) {
      setActionDialogError("请填写驳回原因");
      return;
    }

    return runAction(async () => {
      await rejectProjectAcceptance({
        acceptanceId,
        comment: normalizedComment,
      });
      setActionDialog(null);
    });
  };

  const notifyCustomer = (force = false) =>
    runAction(async () => {
      if (!selected) return;
      const data = await notifyProjectAcceptanceCustomer({
        acceptanceId: selected.id,
        force,
      });
      toast.success(data.reused ? "已复用未过期通知" : "客户通知已发送", {
        description: `${data.phone} · ${formatDateTime(data.expire_at)} 过期`,
      });
    });

  const deleteDraftAcceptance = (acceptanceId: string) =>
    runAction(async () => {
      await deleteProjectAcceptanceDraft(acceptanceId);
      setActionDialog(null);
    });

  return {
    loading,
    actionLoading,
    uploadingItemId,
    error,
    acceptances,
    selectedId,
    stageCode,
    actionDialog,
    actionDialogError,
    templateDialogOpen,
    templateLoading,
    templateError,
    finalTemplate,
    editable,
    selected,
    latestCustomerDispute,
    latestRejectAction,
    selectedStats,
    selectedSections,
    summary,
    selectableStageOptions,
    firstAvailableStage,
    selectedStageBlockedReason,
    selectedStageBlocked,
    canCreateByProjectStatus,
    canCreateAcceptance,
    canCreateFinalAcceptance,
    finalAcceptanceBlockedReason,
    loadAcceptances,
    setStageCode,
    setSelectedId: (id: string) => selectAcceptanceId(id, { preferReload: true }),
    setTemplateDialogOpen,
    setFinalTemplate,
    setEditable,
    setActionDialog,
    setActionDialogError,
    openActionDialog,
    closeActionDialog,
    createAcceptance,
    createFinalAcceptance,
    openTemplateDialog,
    saveAcceptance,
    approveAcceptance,
    rejectAcceptance,
    notifyCustomer,
    deleteDraftAcceptance,
    updateEditableItem,
    uploadImages,
  };
}
