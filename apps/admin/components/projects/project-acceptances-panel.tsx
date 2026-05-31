"use client";

import { ChangeEvent, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  PROJECT_CONSTRUCTION_COMPLETION_STAGE_CODE,
  type ProjectLogStageCode,
} from "@gooes/domain";
import { StatusAlert } from "@/components/admin/status-alert";
import { Skeleton } from "@/components/ui/skeleton";
import type { ProjectRecord } from "@/components/projects/project-mutations";
import type {
  AcceptanceDialogState,
  AcceptanceListData,
  AcceptanceTemplate,
  AcceptanceTemplateListData,
  ConstructionStageItem,
  ConstructionStagePayload,
  EditableItem,
  EditableState,
  NotifyCustomerResult,
  ProjectAcceptance,
} from "@/components/projects/project-acceptance-types";
import {
  buildEditable,
  getAcceptanceDisplaySections,
  getAcceptanceDisplayTitle,
  getAcceptanceItemStats,
  getLatestCustomerDispute,
  getLatestRejectAction,
  formatDateTime,
  openAcceptanceStatuses,
  requestBackend,
  stageOptions,
  uploadAcceptanceImageDirect,
} from "@/components/projects/project-acceptance-utils";
import { AcceptanceActionDialog } from "@/components/projects/project-acceptance-action-dialog";
import { ProjectAcceptanceDetail } from "@/components/projects/project-acceptance-detail";
import { ProjectAcceptanceSidebar } from "@/components/projects/project-acceptance-sidebar";
import { FinalAcceptanceTemplateDialog } from "@/components/projects/project-final-acceptance-template-dialog";

export function ProjectAcceptancesPanel({
  project,
  active = true,
}: {
  project: ProjectRecord;
  active?: boolean;
}) {
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [uploadingItemId, setUploadingItemId] = useState("");
  const [error, setError] = useState("");
  const [acceptances, setAcceptances] = useState<ProjectAcceptance[]>([]);
  const [constructionStages, setConstructionStages] = useState<ConstructionStageItem[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [stageCode, setStageCode] = useState<ProjectLogStageCode>(
    "plumbing_electrical",
  );
  const [actionDialog, setActionDialog] = useState<AcceptanceDialogState>(null);
  const [actionDialogError, setActionDialogError] = useState("");
  const [templateDialogOpen, setTemplateDialogOpen] = useState(false);
  const [templateLoading, setTemplateLoading] = useState(false);
  const [templateError, setTemplateError] = useState("");
  const [finalTemplate, setFinalTemplate] = useState<AcceptanceTemplate | null>(null);
  const [editable, setEditable] = useState<EditableState>(() =>
    buildEditable(null),
  );

  const selected = useMemo(
    () => acceptances.find((item) => item.id === selectedId) || null,
    [acceptances, selectedId],
  );
  const latestCustomerDispute = useMemo(
    () => getLatestCustomerDispute(selected),
    [selected],
  );
  const latestRejectAction = useMemo(
    () => getLatestRejectAction(selected),
    [selected],
  );
  const selectedStats = useMemo(
    () => getAcceptanceItemStats(selected),
    [selected],
  );
  const selectedSections = useMemo(
    () => selected ? getAcceptanceDisplaySections(selected) : [],
    [selected],
  );
  const occupiedStages = useMemo(() => {
    return new Map(
      acceptances
        .filter((item) => item.acceptance_type !== "final")
        .filter((item) => openAcceptanceStatuses.has(item.status))
        .map((item) => [item.stage_code, item]),
    );
  }, [acceptances]);
  const openFinalAcceptance = useMemo(
    () => acceptances.find((item) =>
      item.acceptance_type === "final" && openAcceptanceStatuses.has(item.status)
    ) || null,
    [acceptances],
  );
  const constructionStageMap = useMemo(() => {
    return new Map(constructionStages.map((item) => [item.stage_code, item]));
  }, [constructionStages]);
  const selectableStageOptions = useMemo(() => {
    return stageOptions.map((item) => ({
      ...item,
      acceptance: occupiedStages.get(item.value),
      constructionStage: constructionStageMap.get(item.value),
    }));
  }, [constructionStageMap, occupiedStages]);
  const firstAvailableStage = selectableStageOptions.find((item) =>
    !item.acceptance && !item.constructionStage?.blocked_reason
  );
  const selectedStageBlockedReason = occupiedStages.get(stageCode)
    ? "该工序已有进行中的验收单"
    : constructionStageMap.get(stageCode)?.blocked_reason || "";
  const selectedStageBlocked = Boolean(selectedStageBlockedReason);
  const canCreateByProjectStatus = project.status === "constructing" || project.status === "acceptance";
  const canCreateAcceptance = canCreateByProjectStatus &&
    Boolean(firstAvailableStage) &&
    !selectedStageBlocked;
  const canCreateFinalAcceptance = project.status === "constructing" &&
    !openFinalAcceptance &&
    constructionStages.length > 0 &&
    constructionStages.every((stage) =>
      stage.stage_code === PROJECT_CONSTRUCTION_COMPLETION_STAGE_CODE ||
      stage.status === "accepted"
    );
  const finalAcceptanceBlockedReason = openFinalAcceptance
    ? "当前项目已有进行中的竣工交付验收"
    : project.status !== "constructing"
    ? "仅施工中项目可发起竣工交付验收"
    : constructionStages.length === 0
    ? "施工阶段状态加载后才可发起竣工交付验收"
    : canCreateFinalAcceptance
    ? ""
    : "必需施工阶段全部完成后才可发起竣工交付验收";

  const loadAcceptances = async () => {
    setLoading(true);
    setError("");
    try {
      const [data, stageData] = await Promise.all([
        requestBackend<AcceptanceListData>(
          `/project-acceptances?project_id=${project.id}&page=1&pageSize=20`,
        ),
        requestBackend<ConstructionStagePayload>(
          `/projects/${project.id}/construction-stages`,
        ),
      ]);
      const list = data.list || [];
      setAcceptances(list);
      setConstructionStages(stageData.stages || []);
      setSelectedId((current) =>
        current && list.some((item) => item.id === current)
          ? current
          : list[0]?.id || "",
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "验收列表加载失败");
      setAcceptances([]);
      setConstructionStages([]);
      setSelectedId("");
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
    const nextEditable = buildEditable(selected);
    if (selected?.status === "rejected") {
      nextEditable.items = Object.fromEntries(
        Object.entries(nextEditable.items).map(([itemId, item]) => [
          itemId,
          {
            ...item,
            rectification_remark: "",
            rectification_images: [],
            rectificationImagePreviews: [],
          },
        ]),
      );
    }
    setEditable(nextEditable);
  }, [selected?.id, selected?.status]);

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
      const created = await requestBackend<ProjectAcceptance>("/project-acceptances", {
        method: "POST",
        payload: {
          project_id: project.id,
          stage_code: stageCode,
        },
      });
      setSelectedId(created.id);
    });

  const createFinalAcceptance = () =>
    runAction(async () => {
      if (!canCreateFinalAcceptance) {
        throw new Error(finalAcceptanceBlockedReason || "当前不可发起竣工交付验收");
      }
      const created = await requestBackend<ProjectAcceptance>("/project-acceptances", {
        method: "POST",
        payload: {
          project_id: project.id,
          acceptance_type: "final",
          stage_code: PROJECT_CONSTRUCTION_COMPLETION_STAGE_CODE,
        },
      });
      setSelectedId(created.id);
    });

  const openTemplateDialog = async () => {
    setTemplateDialogOpen(true);
    setTemplateError("");
    if (finalTemplate) return;

    setTemplateLoading(true);
    try {
      const data = await requestBackend<AcceptanceTemplateListData>(
        `/project-acceptance-templates?acceptance_type=final&stage_code=${PROJECT_CONSTRUCTION_COMPLETION_STAGE_CODE}&status=active`,
      );
      setFinalTemplate(data.list?.[0] || null);
      if (!data.list?.length) {
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
      const payload = {
        summary: editable.summary,
        items: Object.values(editable.items).map((item) => ({
          id: item.id,
          result: item.result,
          remark: item.remark,
          images: item.images,
          rectification_remark: item.rectification_remark,
          rectification_images: item.rectification_images,
        })),
      };
      if (submit) {
        await requestBackend(`/project-acceptances/${selected.id}/submit`, {
          method: "POST",
          payload,
        });
      } else {
        await requestBackend(`/project-acceptances/${selected.id}`, {
          method: "PATCH",
          payload,
        });
      }
    });

  const approveAcceptance = (acceptanceId: string, comment: string) =>
    runAction(async () => {
      await requestBackend(`/project-acceptances/${acceptanceId}/approve`, {
        method: "POST",
        payload: { comment: comment.trim() || "复核通过" },
      });
      setActionDialog(null);
    });

  const rejectAcceptance = (acceptanceId: string, comment: string) => {
    const normalizedComment = comment.trim();
    if (!normalizedComment) {
      setActionDialogError("请填写驳回原因");
      return;
    }

    return runAction(async () => {
      await requestBackend(`/project-acceptances/${acceptanceId}/reject`, {
        method: "POST",
        payload: { comment: normalizedComment },
      });
      setActionDialog(null);
    });
  };

  const notifyCustomer = (force = false) =>
    runAction(async () => {
      if (!selected) return;
      const data = await requestBackend<NotifyCustomerResult>(
        `/project-acceptances/${selected.id}/notify-customer`,
        {
          method: "POST",
          payload: { scene: "customer_review", force },
        },
      );
      toast.success(data.reused ? "已复用未过期通知" : "客户通知已发送", {
        description: `${data.phone} · ${formatDateTime(data.expire_at)} 过期`,
      });
    });

  const deleteDraftAcceptance = (acceptanceId: string) =>
    runAction(async () => {
      await requestBackend(`/project-acceptances/${acceptanceId}`, {
        method: "DELETE",
      });
      setActionDialog(null);
    });

  const updateEditableItem = (
    itemId: string,
    patch: Partial<EditableItem>,
  ) => {
    setEditable((current) => ({
      ...current,
      items: {
        ...current.items,
        [itemId]: {
          ...current.items[itemId],
          ...patch,
        },
      },
    }));
  };

  const uploadImages = async (
    itemId: string,
    event: ChangeEvent<HTMLInputElement>,
    target: "images" | "rectification_images",
  ) => {
    const files = Array.from(event.target.files || []);
    event.target.value = "";
    if (files.length === 0) return;

    setUploadingItemId(`${itemId}:${target}`);
    setError("");
    try {
      const uploaded = await Promise.all(
        files.map((file) => uploadAcceptanceImageDirect(file, project.id)),
      );
      const currentItem = editable.items[itemId];
      updateEditableItem(itemId, {
        [target]: [
          ...(currentItem?.[target] || []),
          ...uploaded.map((item) => item.path),
        ],
        [target === "images" ? "imagePreviews" : "rectificationImagePreviews"]: [
          ...(target === "images"
            ? currentItem?.imagePreviews || []
            : currentItem?.rectificationImagePreviews || []),
          ...uploaded.map((item) => item.preview),
        ],
      } as Partial<EditableItem>);
    } catch (err) {
      setError(err instanceof Error ? err.message : "图片上传失败");
    } finally {
      setUploadingItemId("");
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      {error ? <StatusAlert>{error}</StatusAlert> : null}

      {loading ? (
        <div className="grid min-h-0 flex-1 gap-3 md:grid-cols-[260px_1fr]">
          <Skeleton className="h-72" />
          <Skeleton className="h-72" />
        </div>
      ) : (
        <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[260px_minmax(0,1fr)]">
          <ProjectAcceptanceSidebar
            loading={loading}
            actionLoading={actionLoading}
            templateLoading={templateLoading}
            acceptances={acceptances}
            selectedId={selectedId}
            stageCode={stageCode}
            selectableStageOptions={selectableStageOptions}
            finalAcceptanceBlockedReason={finalAcceptanceBlockedReason}
            canCreateFinalAcceptance={canCreateFinalAcceptance}
            canCreateAcceptance={canCreateAcceptance}
            canCreateByProjectStatus={canCreateByProjectStatus}
            firstAvailableStage={firstAvailableStage}
            selectedStageBlocked={selectedStageBlocked}
            selectedStageBlockedReason={selectedStageBlockedReason}
            onRefresh={loadAcceptances}
            onCreateFinalAcceptance={createFinalAcceptance}
            onOpenTemplateDialog={openTemplateDialog}
            onStageCodeChange={setStageCode}
            onCreateAcceptance={createAcceptance}
            onSelectedIdChange={setSelectedId}
          />
          <ProjectAcceptanceDetail
            selected={selected}
            selectedStats={selectedStats}
            selectedSections={selectedSections}
            latestCustomerDispute={latestCustomerDispute}
            latestRejectAction={latestRejectAction}
            editable={editable}
            actionLoading={actionLoading}
            uploadingItemId={uploadingItemId}
            setEditable={setEditable}
            openActionDialog={openActionDialog}
            saveAcceptance={saveAcceptance}
            notifyCustomer={notifyCustomer}
            updateEditableItem={updateEditableItem}
            uploadImages={uploadImages}
          />
        </div>
      )}

      <FinalAcceptanceTemplateDialog
        open={templateDialogOpen}
        loading={templateLoading}
        error={templateError}
        template={finalTemplate}
        onSaved={(template) => {
          setFinalTemplate(template);
          toast.success("竣工模板已保存");
        }}
        onOpenChange={setTemplateDialogOpen}
      />

      <AcceptanceActionDialog
        state={actionDialog}
        error={actionDialogError}
        loading={actionLoading}
        onOpenChange={(open) => {
          if (!open) closeActionDialog();
        }}
        onCommentChange={(comment) => {
          setActionDialog((current) => current ? { ...current, comment } : current);
          setActionDialogError("");
        }}
        onConfirm={() => {
          if (!actionDialog) return;
          if (actionDialog.type === "approve") {
            void approveAcceptance(actionDialog.acceptanceId, actionDialog.comment);
            return;
          }
          if (actionDialog.type === "reject") {
            void rejectAcceptance(actionDialog.acceptanceId, actionDialog.comment);
            return;
          }
          void deleteDraftAcceptance(actionDialog.acceptanceId);
        }}
      />
    </div>
  );
}
