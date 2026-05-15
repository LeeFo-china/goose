"use client";

import { ChangeEvent, useEffect, useId, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  PROJECT_ACCEPTANCE_STAGE_LABELS,
  ProjectAcceptanceStatusConfig,
  PROJECT_LOG_STAGE_CODE_VALUES,
  type ProjectAcceptanceStatus,
  type ProjectLogStageCode,
} from "@gooes/domain";
import {
  CheckCircle2,
  CornerDownRight,
  Clock3,
  Image as ImageIcon,
  Loader2,
  MessageSquareText,
  Plus,
  RefreshCw,
  Send,
  Trash2,
  Upload,
  XCircle,
} from "lucide-react";
import { StatusAlert } from "@/components/admin/status-alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { ProjectRecord } from "@/components/projects/project-mutations";

type AcceptanceItemResult = "pass" | "fail" | "not_applicable";

type AcceptanceItem = {
  id: string;
  category: string | null;
  title: string;
  standard: string;
  required: boolean;
  allow_not_applicable: boolean;
  photo_required: boolean;
  photo_min_count: number;
  photo_max_count: number;
  result: AcceptanceItemResult | null;
  remark: string | null;
  images: string[];
  image_items?: AcceptanceImageItem[];
  rectification_remark: string | null;
  rectification_images: string[];
  rectification_image_items?: AcceptanceImageItem[];
};

type AcceptanceImageItem = {
  id?: string | null;
  acceptance_id?: string | null;
  item_id?: string | null;
  item_title?: string | null;
  path?: string | null;
  url?: string | null;
  thumb_url?: string | null;
  source?: "acceptance_item" | "rectification_item" | string | null;
  created_at?: string | null;
};

type AcceptanceAction = {
  id: string;
  action: string;
  operator_type: "employee" | "customer" | "system" | string;
  operator_id: string | null;
  operator?: {
    name?: string | null;
    phone?: string | null;
  } | null;
  from_status?: ProjectAcceptanceStatus | null;
  to_status?: ProjectAcceptanceStatus | null;
  comment: string | null;
  created_at: string | null;
  images?: string[];
  image_items?: AcceptanceImageItem[];
  referenced_images?: AcceptanceImageItem[];
};

type ProjectAcceptance = {
  id: string;
  project_id: string;
  stage_code: ProjectLogStageCode;
  stage_label: string | null;
  title: string;
  status: ProjectAcceptanceStatus;
  status_label: string;
  summary: string | null;
  reject_reason: string | null;
  reject_source: "leader" | "customer" | null;
  created_at: string | null;
  updated_at: string | null;
  submitted_at: string | null;
  items: AcceptanceItem[];
  actions?: AcceptanceAction[];
  initiator?: { name?: string | null } | null;
  reviewer?: { name?: string | null } | null;
  latest_customer_notification?: AcceptanceNotification | null;
};

type AcceptanceNotification = {
  id: string;
  status: "active" | "used" | "expired" | "revoked" | string;
  send_status: "sent" | "failed" | null | string;
  send_error: string | null;
  phone: string;
  link_type: string | null;
  sent_at: string | null;
  expire_at: string;
  used_at: string | null;
  created_at: string;
};

type AcceptanceListData = {
  list: ProjectAcceptance[];
  pagination: {
    total: number;
  };
};

type NotifyCustomerResult = {
  sent: boolean;
  reused?: boolean;
  phone: string;
  link_type: string;
  expire_at: string;
};

type DirectUploadInitResult = {
  provider: "tencent_cos";
  bucket: string;
  region: string | null;
  object_key: string;
  storage_path: string;
  upload_url: string;
  method?: "PUT";
  headers?: Record<string, string>;
  expires_in: number;
  expires_at: string;
};

type DirectUploadCompleteResult = {
  url?: string;
  path?: string;
  provider?: string;
  object_key?: string;
  storage_path?: string;
};

type EditableItem = {
  id: string;
  result: AcceptanceItemResult | null;
  remark: string;
  images: string[];
  imagePreviews: string[];
  rectification_remark: string;
  rectification_images: string[];
  rectificationImagePreviews: string[];
};

type EditableState = {
  summary: string;
  items: Record<string, EditableItem>;
};

type AcceptanceDialogState =
  | {
    type: "approve" | "reject" | "delete";
    acceptanceId: string;
    title: string;
    comment: string;
  }
  | null;

const stageOptions = PROJECT_LOG_STAGE_CODE_VALUES.map((value) => ({
  value,
  label: PROJECT_ACCEPTANCE_STAGE_LABELS[value],
}));

const openAcceptanceStatuses = new Set<ProjectAcceptanceStatus>([
  "draft",
  "submitted",
  "leader_approved",
  "rejected",
]);

function getPayloadMessage(payload: unknown, fallback: string) {
  if (payload && typeof payload === "object" && "message" in payload) {
    const message = (payload as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) return message;
  }
  return fallback;
}

async function requestBackend<T>(
  path: string,
  input?: { method?: "GET" | "POST" | "PATCH" | "DELETE"; payload?: unknown },
) {
  const response = await fetch(`/api/backend${path}`, {
    method: input?.method || "GET",
    headers: input?.payload ? { "content-type": "application/json" } : undefined,
    body: input?.payload ? JSON.stringify(input.payload) : undefined,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.success === false) {
    throw new Error(getPayloadMessage(payload, "请求失败"));
  }
  return payload.data as T;
}

async function uploadAcceptanceImageDirect(file: File, projectId: string) {
  const mimetype = file.type || "image/jpeg";
  const init = await requestBackend<DirectUploadInitResult>("/uploads/cos/direct-init", {
    method: "POST",
    payload: {
      scene: "project_acceptance",
      project_id: projectId,
      filename: file.name,
      mimetype,
      size_bytes: file.size,
    },
  });

  const uploadResponse = await fetch(init.upload_url, {
    method: init.method || "PUT",
    headers: init.headers || { "content-type": mimetype },
    body: file,
  });
  if (!uploadResponse.ok) {
    const detail = await uploadResponse.text().catch(() => "");
    throw new Error(
      `上传验收图片到 COS 失败(${uploadResponse.status})${
        detail.trim() ? `：${detail.trim().slice(0, 120)}` : ""
      }`,
    );
  }

  const completed = await requestBackend<DirectUploadCompleteResult>("/uploads/cos/direct-complete", {
    method: "POST",
    payload: {
      scene: "project_acceptance",
      project_id: projectId,
      filename: file.name,
      mimetype,
      size_bytes: file.size,
      object_key: init.object_key,
      etag: uploadResponse.headers.get("etag") || undefined,
    },
  });

  const storageValue = completed.storage_path || completed.object_key || init.storage_path ||
    init.object_key;
  if (!storageValue) {
    throw new Error("验收图片上传成功但未返回图片地址");
  }

  return {
    path: storageValue,
    preview: completed.url || storageValue,
  };
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function buildEditable(acceptance: ProjectAcceptance | null): EditableState {
  const normalizeStoredImages = (
    values: string[],
    imageItems: AcceptanceImageItem[] | undefined,
  ) => {
    if (imageItems?.length) {
      return {
        paths: imageItems.map((item) => item.path || item.url || "").filter(Boolean),
        previews: imageItems.map((item) => item.thumb_url || item.url || item.path || "").filter(Boolean),
      };
    }

    return {
      paths: values || [],
      previews: values || [],
    };
  };

  return {
    summary: acceptance?.summary || "",
    items: Object.fromEntries(
      (acceptance?.items || []).map((item) => {
        const images = normalizeStoredImages(item.images || [], item.image_items);
        const rectificationImages = normalizeStoredImages(
          item.rectification_images || [],
          item.rectification_image_items,
        );

        return [
          item.id,
          {
          id: item.id,
          result: item.result,
          remark: item.remark || "",
          images: images.paths,
          imagePreviews: images.previews,
          rectification_remark: item.rectification_remark || "",
          rectification_images: rectificationImages.paths,
          rectificationImagePreviews: rectificationImages.previews,
        },
        ];
      }),
    ),
  };
}

function canEdit(status: ProjectAcceptanceStatus) {
  return status === "draft" || status === "rejected";
}

function statusVariant(status: ProjectAcceptanceStatus) {
  return ProjectAcceptanceStatusConfig[status]?.type === "danger"
    ? "danger"
    : ProjectAcceptanceStatusConfig[status]?.type === "success"
    ? "success"
    : ProjectAcceptanceStatusConfig[status]?.type === "warning"
    ? "warning"
    : ProjectAcceptanceStatusConfig[status]?.type === "primary"
    ? "default"
    : "secondary";
}

function resultLabel(result: AcceptanceItemResult | null | undefined) {
  if (result === "pass") return "通过";
  if (result === "fail") return "不通过";
  if (result === "not_applicable") return "不适用";
  return "未填写";
}

function resultVariant(result: AcceptanceItemResult | null | undefined) {
  if (result === "pass") return "success";
  if (result === "fail") return "danger";
  if (result === "not_applicable") return "secondary";
  return "outline";
}

function getAcceptanceItemStats(acceptance: ProjectAcceptance | null) {
  const items = acceptance?.items || [];
  return {
    total: items.length,
    pass: items.filter((item) => item.result === "pass").length,
    fail: items.filter((item) => item.result === "fail").length,
    pending: items.filter((item) => !item.result).length,
  };
}

function notificationVariant(notification: AcceptanceNotification | null | undefined) {
  if (!notification) return "secondary";
  if (notification.send_status === "failed") return "danger";
  if (notification.status === "revoked" || notification.status === "expired") return "secondary";
  if (new Date(notification.expire_at).getTime() <= Date.now()) return "secondary";
  return notification.send_status === "sent" ? "success" : "warning";
}

function notificationLabel(notification: AcceptanceNotification | null | undefined) {
  if (!notification) return "未发送";
  if (notification.send_status === "failed") return "发送失败";
  if (notification.status === "revoked") return "已撤销";
  if (notification.status === "expired") return "已过期";
  if (new Date(notification.expire_at).getTime() <= Date.now()) return "已过期";
  if (notification.send_status === "sent") return "已发送";
  return "待发送";
}

function getPreviewImageSrc(image: string) {
  if (!image) return "";
  if (/^https?:\/\//i.test(image) || image.startsWith("data:") || image.startsWith("blob:")) {
    return image;
  }
  return `/api/backend/uploads/public-url?path=${encodeURIComponent(image)}`;
}

function getImageItemSrc(image: AcceptanceImageItem) {
  return getPreviewImageSrc(image.thumb_url || image.url || image.path || "");
}

function getImageItemHref(image: AcceptanceImageItem) {
  return getPreviewImageSrc(image.url || image.path || image.thumb_url || "");
}

function getActionLabel(action: string) {
  const labels: Record<string, string> = {
    create: "创建验收",
    update: "保存草稿",
    submit: "提交验收",
    leader_approve: "领导复核通过",
    leader_reject: "领导驳回",
    customer_confirm: "业主确认通过",
    customer_dispute: "业主提出疑问",
    cancel: "作废验收",
  };
  return labels[action] || action;
}

function getActionVariant(action: string) {
  if (action === "customer_dispute" || action === "leader_reject") return "warning";
  if (action === "leader_approve" || action === "customer_confirm") return "success";
  if (action === "submit") return "default";
  return "secondary";
}

function getActionOperator(action: AcceptanceAction) {
  if (action.operator?.name) return action.operator.name;
  if (action.operator?.phone) return action.operator.phone;
  if (action.operator_type === "customer") return "业主";
  if (action.operator_type === "employee") return "员工";
  return "系统";
}

function getLatestCustomerDispute(acceptance: ProjectAcceptance | null) {
  return (acceptance?.actions || [])
    .filter((item) => item.action === "customer_dispute")
    .slice()
    .sort((left, right) =>
      new Date(right.created_at || 0).getTime() -
      new Date(left.created_at || 0).getTime()
    )[0] || null;
}

function getCustomerDisputeItemIds(action: AcceptanceAction | null) {
  return new Set(
    (action?.referenced_images || [])
      .map((image) => image.item_id)
      .filter((item): item is string => Boolean(item)),
  );
}

function isRejectAction(action: AcceptanceAction) {
  return action.action === "customer_dispute" || action.action === "leader_reject";
}

function getLatestRejectAction(acceptance: ProjectAcceptance | null) {
  return (acceptance?.actions || [])
    .filter(isRejectAction)
    .slice()
    .sort((left, right) =>
      new Date(right.created_at || 0).getTime() -
      new Date(left.created_at || 0).getTime()
    )[0] || null;
}

function getRectificationItemsForAction(
  acceptance: ProjectAcceptance,
  action: AcceptanceAction,
) {
  if (action.action === "customer_dispute") {
    const disputedItemIds = getCustomerDisputeItemIds(action);
    if (disputedItemIds.size > 0) {
      const matchedItems = acceptance.items.filter((item) =>
        disputedItemIds.has(item.id)
      );
      return matchedItems.length ? matchedItems : acceptance.items;
    }
    return acceptance.items;
  }

  if (action.action === "leader_reject") {
    const failedItems = acceptance.items.filter((item) => item.result === "fail");
    return failedItems.length ? failedItems : acceptance.items;
  }

  return [] as AcceptanceItem[];
}

function hasRectificationContent(items: AcceptanceItem[]) {
  return items.some((item) =>
    Boolean(
      item.rectification_remark?.trim() ||
        item.rectification_images?.length ||
        item.rectification_image_items?.length,
    )
  );
}

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
  const [selectedId, setSelectedId] = useState("");
  const [stageCode, setStageCode] = useState<ProjectLogStageCode>(
    "plumbing_electrical",
  );
  const [actionDialog, setActionDialog] = useState<AcceptanceDialogState>(null);
  const [actionDialogError, setActionDialogError] = useState("");
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
  const occupiedStages = useMemo(() => {
    return new Map(
      acceptances
        .filter((item) => openAcceptanceStatuses.has(item.status))
        .map((item) => [item.stage_code, item]),
    );
  }, [acceptances]);
  const selectableStageOptions = useMemo(() => {
    return stageOptions.map((item) => ({
      ...item,
      acceptance: occupiedStages.get(item.value),
    }));
  }, [occupiedStages]);
  const firstAvailableStage = selectableStageOptions.find((item) => !item.acceptance);
  const selectedStageBlocked = Boolean(occupiedStages.get(stageCode));
  const canCreateAcceptance = Boolean(firstAvailableStage) && !selectedStageBlocked;

  const loadAcceptances = async () => {
    setLoading(true);
    setError("");
    try {
      const data = await requestBackend<AcceptanceListData>(
        `/project-acceptances?project_id=${project.id}&page=1&pageSize=20`,
      );
      const list = data.list || [];
      setAcceptances(list);
      setSelectedId((current) =>
        current && list.some((item) => item.id === current)
          ? current
          : list[0]?.id || "",
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "验收列表加载失败");
      setAcceptances([]);
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
      title: selected.title,
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
          <aside className="min-h-0">
            <div className="flex h-full min-h-0 flex-col rounded-md border bg-card">
              <div className="border-b p-3">
                <div className="flex items-center justify-between gap-3">
                  <Label>发起工序验收</Label>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-8"
                    onClick={loadAcceptances}
                    disabled={loading}
                    aria-label="刷新验收列表"
                  >
                    <RefreshCw className={loading ? "animate-spin" : ""} />
                  </Button>
                </div>
                <div className="mt-2 space-y-2">
                  <Select
                    value={stageCode}
                    onValueChange={(value) => setStageCode(value as ProjectLogStageCode)}
                  >
                    <SelectTrigger className="h-8">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {selectableStageOptions.map((item) => (
                        <SelectItem
                          key={item.value}
                          value={item.value}
                          disabled={Boolean(item.acceptance)}
                        >
                          {item.acceptance
                            ? `${item.label}（${item.acceptance.status_label}）`
                            : item.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    type="button"
                    size="sm"
                    className="w-full"
                    onClick={createAcceptance}
                    disabled={actionLoading || !canCreateAcceptance}
                  >
                    {actionLoading
                      ? <Loader2 className="animate-spin" data-icon="inline-start" />
                      : <Plus />}
                    发起验收
                  </Button>
                </div>
                {!firstAvailableStage ? (
                  <p className="mt-2 text-xs text-muted-foreground">
                    当前无可发起的工序验收
                  </p>
                ) : selectedStageBlocked ? (
                  <p className="mt-2 text-xs text-muted-foreground">
                    该工序已有进行中的验收单
                  </p>
                ) : null}
              </div>

              <div className="flex items-center justify-between gap-2 border-b px-3 py-2 text-xs text-muted-foreground">
                <span>验收项目</span>
                <span>{acceptances.length} 个记录</span>
              </div>

              <div className="p-1">
                {acceptances.length === 0 ? (
                  <div className="rounded-md border border-dashed p-4 text-center text-xs text-muted-foreground">
                    暂无工序验收
                  </div>
                ) : (
                  <div className="flex flex-col gap-1">
                    {acceptances.map((item) => (
                      <Button
                        key={item.id}
                        type="button"
                        variant="ghost"
                        className={cn(
                          "h-auto w-full justify-start rounded-md px-3 py-2.5 text-left font-normal transition-colors hover:bg-accent",
                          item.id === selectedId ? "bg-accent" : "bg-transparent",
                        )}
                        onClick={() => setSelectedId(item.id)}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="min-w-0 truncate text-sm font-medium">
                            {item.stage_label || item.title}
                          </div>
                          <Badge variant={statusVariant(item.status)}>
                            {item.status_label}
                          </Badge>
                        </div>
                        <div className="mt-1 flex items-center justify-between gap-2 text-xs text-muted-foreground">
                          <span>{formatDateTime(item.updated_at || item.created_at)}</span>
                          <span>{item.items.length} 项</span>
                        </div>
                      </Button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </aside>

          {selected ? (
            <section className="flex min-h-0 flex-col rounded-md border bg-card">
              <div className="h-[86px] shrink-0 overflow-hidden border-b bg-card px-4 py-3">
                <div className="flex h-8 items-center justify-between gap-3 overflow-hidden">
                  <div className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden">
                    <h3 className="min-w-0 truncate text-base font-semibold">
                      {selected.title}
                    </h3>
                    <Badge variant={statusVariant(selected.status)} className="shrink-0">
                      {selected.status_label}
                    </Badge>
                    <div className="ml-0 hidden shrink-0 overflow-hidden rounded-md border bg-background text-xs md:flex lg:ml-2">
                      <span className="px-2 py-1 text-muted-foreground">
                        全部 <b className="font-semibold text-foreground">{selectedStats.total}</b>
                      </span>
                      <span className="border-l px-2 py-1 text-muted-foreground">
                        通过 <b className="font-semibold text-success">{selectedStats.pass}</b>
                      </span>
                      <span className="border-l px-2 py-1 text-muted-foreground">
                        问题 <b className="font-semibold text-destructive">{selectedStats.fail}</b>
                      </span>
                      <span className="border-l px-2 py-1 text-muted-foreground">
                        待填 <b className="font-semibold text-foreground">{selectedStats.pending}</b>
                      </span>
                    </div>
                  </div>
                  <div className="flex shrink-0 justify-end gap-2">
                  {canEdit(selected.status) ? (
                    <>
                      {selected.status === "draft" ? (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => openActionDialog("delete")}
                          disabled={actionLoading}
                        >
                          <Trash2 />
                          删除草稿
                        </Button>
                      ) : null}
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => saveAcceptance(false)}
                        disabled={actionLoading}
                      >
                        保存草稿
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => saveAcceptance(true)}
                        disabled={actionLoading}
                      >
                        <Send />
                        提交验收
                      </Button>
                    </>
                  ) : null}
                  {selected.status === "submitted" ? (
                    <>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => openActionDialog("reject")}
                        disabled={actionLoading}
                      >
                        <XCircle />
                        驳回
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => openActionDialog("approve")}
                        disabled={actionLoading}
                      >
                        <CheckCircle2 />
                        通过
                      </Button>
                    </>
                  ) : null}
                  {selected.status === "leader_approved" ? (
                    <Button
                      type="button"
                      size="sm"
                      variant={selected.latest_customer_notification ? "outline" : "default"}
                      onClick={() => notifyCustomer(Boolean(selected.latest_customer_notification))}
                      disabled={actionLoading}
                    >
                      {actionLoading
                        ? <Loader2 className="animate-spin" data-icon="inline-start" />
                        : <MessageSquareText data-icon="inline-start" />}
                      {selected.latest_customer_notification ? "重发客户通知" : "发送客户通知"}
                    </Button>
                  ) : null}
                  </div>
                </div>

                <div className="mt-2 flex h-5 min-w-0 items-center gap-x-3 overflow-hidden whitespace-nowrap text-xs text-muted-foreground">
                  <span className="shrink-0">发起：{selected.initiator?.name || "-"}</span>
                  <span className="shrink-0">复核：{selected.reviewer?.name || "-"}</span>
                  <span className="shrink-0">更新：{formatDateTime(selected.updated_at || selected.created_at)}</span>
                  {selected.reject_reason ? (
                    <span className="min-w-0 flex-1 truncate text-destructive">
                      {selected.reject_source === "customer" ? "业主疑问" : "驳回原因"}：
                      {selected.reject_reason}
                    </span>
                  ) : null}
                  {selected.reject_source === "customer" && latestCustomerDispute ? (
                    <span className="flex min-w-0 flex-1 items-center gap-1 truncate">
                      <Clock3 data-icon="inline-start" />
                      <span className="truncate">
                        最近疑问：{formatDateTime(latestCustomerDispute.created_at)}
                        {latestCustomerDispute.comment ? ` · ${latestCustomerDispute.comment}` : ""}
                      </span>
                    </span>
                  ) : null}
                </div>
              </div>

              <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4 [scrollbar-gutter:stable]">
                {selected.status === "leader_approved" || selected.latest_customer_notification ? (
                  <CustomerNotificationPanel
                    notification={selected.latest_customer_notification || null}
                    onSend={() => notifyCustomer(false)}
                    onResend={() => notifyCustomer(true)}
                    disabled={actionLoading || selected.status !== "leader_approved"}
                  />
                ) : null}

                <AcceptanceTimeline
                  acceptance={selected}
                  actions={selected.actions || []}
                  editable={editable}
                  latestRejectActionId={latestRejectAction?.id || null}
                  actionLoading={actionLoading}
                  uploadingItemId={uploadingItemId}
                  onSave={saveAcceptance}
                  onUpdateItem={updateEditableItem}
                  onUploadImages={uploadImages}
                />

                <div className="space-y-2">
                  <Label>整体验收说明</Label>
                  <Textarea
                    value={editable.summary}
                    onChange={(event) =>
                      setEditable((current) => ({
                        ...current,
                        summary: event.target.value,
                      }))}
                    disabled={!canEdit(selected.status)}
                    placeholder="填写现场整体情况"
                  />
                </div>

                <div className="space-y-3">
                  {selected.items.map((item) => {
                    const draft = editable.items[item.id];
                    const editableNow = canEdit(selected.status);
                    return (
                      <article key={item.id} className="rounded-md border bg-background">
                        <div className="flex flex-wrap items-start justify-between gap-3 border-b px-4 py-3">
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <h4 className="font-medium">{item.title}</h4>
                              <Badge variant={resultVariant(draft?.result)}>
                                {resultLabel(draft?.result)}
                              </Badge>
                            </div>
                            <div className="mt-2 flex flex-wrap items-center gap-2">
                              {item.category ? (
                                <Badge variant="secondary">{item.category}</Badge>
                              ) : null}
                              {item.required ? <Badge variant="outline">必检</Badge> : null}
                              {item.photo_required ? (
                                <Badge variant="outline">
                                  需 {Math.max(item.photo_min_count || 1, 1)} 张照片
                                </Badge>
                              ) : null}
                            </div>
                            <p className="mt-2 text-sm leading-6 text-muted-foreground">
                              {item.standard}
                            </p>
                          </div>
                          <div className="w-full sm:w-40">
                            <Select
                              value={draft?.result || "unset"}
                              disabled={!editableNow}
                              onValueChange={(value) =>
                                updateEditableItem(item.id, {
                                  result: value === "unset"
                                    ? null
                                    : value as AcceptanceItemResult,
                                })}
                            >
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="unset">未填写</SelectItem>
                                <SelectItem value="pass">通过</SelectItem>
                                <SelectItem value="fail">不通过</SelectItem>
                                {item.allow_not_applicable ? (
                                  <SelectItem value="not_applicable">不适用</SelectItem>
                                ) : null}
                              </SelectContent>
                            </Select>
                          </div>
                        </div>

                        <div className="grid gap-3 p-4 md:grid-cols-[minmax(0,1fr)_240px]">
                          <div className="space-y-2">
                            <Label>备注</Label>
                            <Textarea
                              className="min-h-24"
                              value={draft?.remark || ""}
                              disabled={!editableNow}
                              onChange={(event) =>
                                updateEditableItem(item.id, {
                                  remark: event.target.value,
                                })}
                              placeholder="填写验收备注"
                            />
                          </div>

                          <ImageUploadBlock
                            label="现场照片"
                            images={draft?.imagePreviews || draft?.images || []}
                            disabled={!editableNow}
                            uploading={uploadingItemId === `${item.id}:images`}
                            onUpload={(event) => uploadImages(item.id, event, "images")}
                            onRemove={(index) => updateEditableItem(item.id, {
                              images: (draft?.images || []).filter((_, i) => i !== index),
                              imagePreviews: (draft?.imagePreviews || []).filter((_, i) => i !== index),
                            })}
                          />
                        </div>
                      </article>
                    );
                  })}
                </div>
              </div>
            </section>
          ) : (
            <section className="flex min-h-0 items-center justify-center rounded-md border bg-card p-8 text-center text-sm text-muted-foreground">
              从左侧发起一个工序验收后，在这里填写验收内容。
            </section>
          )}
        </div>
      )}

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

function AcceptanceActionDialog({
  state,
  error,
  loading,
  onOpenChange,
  onCommentChange,
  onConfirm,
}: {
  state: AcceptanceDialogState;
  error: string;
  loading: boolean;
  onOpenChange: (open: boolean) => void;
  onCommentChange: (comment: string) => void;
  onConfirm: () => void;
}) {
  const isOpen = Boolean(state);
  const isApprove = state?.type === "approve";
  const isReject = state?.type === "reject";
  const isDelete = state?.type === "delete";

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {isApprove ? "复核通过" : isReject ? "驳回验收" : "删除草稿"}
          </DialogTitle>
          <DialogDescription>
            {isDelete
              ? `确认删除「${state?.title || "当前验收单"}」草稿？删除后可重新发起该工序验收。`
              : `当前验收单：${state?.title || "-"}`}
          </DialogDescription>
        </DialogHeader>

        {isApprove || isReject ? (
          <div className="flex flex-col gap-2">
            <Label htmlFor="acceptance-action-comment">
              {isApprove ? "复核说明" : "驳回原因"}
            </Label>
            <Textarea
              id="acceptance-action-comment"
              value={state?.comment || ""}
              placeholder={isApprove ? "填写复核说明" : "请填写驳回原因"}
              disabled={loading}
              aria-invalid={Boolean(error)}
              onChange={(event) => onCommentChange(event.target.value)}
            />
            {error ? <div className="text-sm text-destructive">{error}</div> : null}
          </div>
        ) : null}

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            disabled={loading}
            onClick={() => onOpenChange(false)}
          >
            取消
          </Button>
          <Button
            type="button"
            variant={isDelete || isReject ? "destructive" : "default"}
            disabled={loading}
            onClick={onConfirm}
          >
            {loading ? <Loader2 className="animate-spin" data-icon="inline-start" /> : null}
            {isApprove ? "确认通过" : isReject ? "确认驳回" : "确认删除"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AcceptanceTimeline({
  acceptance,
  actions,
  editable,
  latestRejectActionId,
  actionLoading,
  uploadingItemId,
  onSave,
  onUpdateItem,
  onUploadImages,
}: {
  acceptance: ProjectAcceptance;
  actions: AcceptanceAction[];
  editable: EditableState;
  latestRejectActionId: string | null;
  actionLoading: boolean;
  uploadingItemId: string;
  onSave: (submit?: boolean) => Promise<void>;
  onUpdateItem: (itemId: string, patch: Partial<EditableItem>) => void;
  onUploadImages: (
    itemId: string,
    event: ChangeEvent<HTMLInputElement>,
    target: "images" | "rectification_images",
  ) => void;
}) {
  if (!actions.length) {
    return null;
  }

  const orderedActions = actions
    .slice()
    .sort((left, right) =>
      new Date(right.created_at || 0).getTime() -
      new Date(left.created_at || 0).getTime()
    );

  return (
    <div className="rounded-md border bg-background p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="font-medium">流程记录</div>
        <Badge variant="secondary">最新在前 · {actions.length} 条</Badge>
      </div>
      <div className="mt-4 flex flex-col gap-3">
        {orderedActions.map((action, index) => {
          const isLatest = index === 0;
          const referencedImages = action.referenced_images || [];
          const imageItems = action.image_items?.length
            ? action.image_items
            : (action.images || []).map((image) => ({
              path: image,
              url: image,
              thumb_url: image,
          }));
          const showRectificationReply = acceptance.status === "rejected" &&
            action.id === latestRejectActionId;
          const rectificationItems = action.id === latestRejectActionId
            ? getRectificationItemsForAction(acceptance, action)
            : [];
          const showRectificationSummary = !showRectificationReply &&
            isRejectAction(action) &&
            hasRectificationContent(rectificationItems);

          return (
            <div
              key={action.id}
              className={`rounded-md border p-3 ${
                isLatest ? "bg-muted/40" : "bg-card"
              }`}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex min-w-0 flex-col gap-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={getActionVariant(action.action)}>
                      {getActionLabel(action.action)}
                    </Badge>
                    {isLatest ? <Badge variant="outline">最新</Badge> : null}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {getActionOperator(action)} · {formatDateTime(action.created_at)}
                  </div>
                </div>
                {action.action === "customer_confirm" ? (
                  <Badge variant="success">已确认</Badge>
                ) : null}
              </div>

              {action.comment ? (
                <div className="mt-3 rounded-md bg-muted/40 p-3 text-sm">
                  {action.comment}
                </div>
              ) : null}

              {action.action === "customer_dispute" ? (
                <div className="mt-3 flex flex-col gap-3">
                  {referencedImages.length ? (
                    <ActionImageGallery
                      title="客户引用的验收图片"
                      emptyText="未引用验收图片"
                      images={referencedImages}
                      showItemTitle
                    />
                  ) : null}
                  <CustomerSupplementImages images={imageItems} />
                </div>
              ) : null}

              {showRectificationReply ? (
                <RectificationReplyPanel
                  action={action}
                  items={rectificationItems}
                  editable={editable}
                  actionLoading={actionLoading}
                  uploadingItemId={uploadingItemId}
                  onSave={onSave}
                  onUpdateItem={onUpdateItem}
                  onUploadImages={onUploadImages}
                />
              ) : null}
              {showRectificationSummary ? (
                <RectificationSummaryPanel items={rectificationItems} />
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function RectificationReplyPanel({
  action,
  items,
  editable,
  actionLoading,
  uploadingItemId,
  onSave,
  onUpdateItem,
  onUploadImages,
}: {
  action: AcceptanceAction;
  items: AcceptanceItem[];
  editable: EditableState;
  actionLoading: boolean;
  uploadingItemId: string;
  onSave: (submit?: boolean) => Promise<void>;
  onUpdateItem: (itemId: string, patch: Partial<EditableItem>) => void;
  onUploadImages: (
    itemId: string,
    event: ChangeEvent<HTMLInputElement>,
    target: "images" | "rectification_images",
  ) => void;
}) {
  const replyTarget = action.action === "customer_dispute" ? "业主疑问" : "领导驳回";
  const targetItem = items[0];
  const targetDraft = targetItem ? editable.items[targetItem.id] : null;

  if (!targetItem) {
    return null;
  }

  return (
    <div className="mt-3 border-l-2 border-warning pl-3">
      <div className="rounded-md border bg-background">
        <div className="border-b px-3 py-2">
          <div className="flex min-w-0 items-center gap-2">
            <CornerDownRight data-icon="inline-start" />
            <div className="min-w-0">
              <div className="text-sm font-medium">回复{replyTarget}</div>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-3 p-3">
          <Textarea
            className="min-h-24 bg-card"
            value={targetDraft?.rectification_remark || ""}
            disabled={actionLoading}
            aria-label="整改说明"
            onChange={(event) =>
              onUpdateItem(targetItem.id, {
                rectification_remark: event.target.value,
              })}
            placeholder="填写整改说明"
          />
          <ImageUploadBlock
            label="上传整改图片"
            images={targetDraft?.rectificationImagePreviews || targetDraft?.rectification_images || []}
            disabled={actionLoading}
            uploading={uploadingItemId === `${targetItem.id}:rectification_images`}
            onUpload={(event) =>
              onUploadImages(targetItem.id, event, "rectification_images")}
            onRemove={(index) => onUpdateItem(targetItem.id, {
              rectification_images: (targetDraft?.rectification_images || [])
                .filter((_, i) => i !== index),
              rectificationImagePreviews: (targetDraft?.rectificationImagePreviews || [])
                .filter((_, i) => i !== index),
            })}
          />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t px-3 py-2">
          <div className="text-xs text-muted-foreground">保存草稿或提交整改复核</div>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={actionLoading}
              onClick={() => void onSave(false)}
            >
              保存草稿
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={actionLoading}
              onClick={() => void onSave(true)}
            >
              {actionLoading
                ? <Loader2 className="animate-spin" data-icon="inline-start" />
                : <Send data-icon="inline-start" />}
              提交整改
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function RectificationSummaryPanel({ items }: { items: AcceptanceItem[] }) {
  const contentItems = items.filter((item) =>
    item.rectification_remark?.trim() ||
    item.rectification_images?.length ||
    item.rectification_image_items?.length
  );

  if (contentItems.length === 0) {
    return null;
  }

  return (
    <div className="mt-3 border-l-2 border-success pl-3">
      <div className="rounded-md border bg-background p-3">
        <div className="flex items-center gap-2 text-sm font-medium">
          <CornerDownRight data-icon="inline-start" />
          员工整改回复
        </div>
        <div className="mt-3 flex flex-col gap-3">
          {contentItems.map((item) => {
            const imageItems = item.rectification_image_items?.length
              ? item.rectification_image_items
              : (item.rectification_images || []).map((image) => ({
                path: image,
                url: image,
                thumb_url: image,
                source: "rectification_item",
                item_title: item.title,
              }));

            return (
              <div key={item.id} className="flex flex-col gap-2">
                {item.rectification_remark?.trim() ? (
                  <div className="rounded-md bg-muted/40 p-3 text-sm">
                    {item.rectification_remark}
                  </div>
                ) : null}
                {imageItems.length ? (
                  <ActionImageGallery
                    title="整改图片"
                    emptyText="暂无整改图片"
                    images={imageItems}
                  />
                ) : null}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function ActionImageGallery({
  title,
  emptyText,
  images,
  showItemTitle = false,
}: {
  title: string;
  emptyText: string;
  images: AcceptanceImageItem[];
  showItemTitle?: boolean;
}) {
  return (
    <div className="rounded-md border bg-background p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-medium">
          <ImageIcon data-icon="inline-start" />
          {title}
        </div>
        <Badge variant="secondary">{images.length}</Badge>
      </div>
      {images.length ? (
        <div className="mt-3 grid grid-cols-[repeat(auto-fill,minmax(88px,1fr))] gap-3">
          {images.map((image, index) => {
            const src = getImageItemSrc(image);
            const href = getImageItemHref(image);
            const sourceLabel = image.source === "rectification_item"
              ? "整改图"
              : image.source === "acceptance_item"
              ? "验收图"
              : "图片";
            return (
              <a
                key={image.id || image.path || image.url || index}
                href={href || undefined}
                target="_blank"
                rel="noreferrer"
                className="group min-w-0 rounded-md border bg-card p-2 transition-colors hover:bg-accent"
              >
                <div className="aspect-square overflow-hidden rounded-md bg-muted">
                  {src ? (
                    <img
                      src={src}
                      alt={title}
                      className="size-full object-cover transition-transform group-hover:scale-105"
                    />
                  ) : (
                    <div className="flex size-full items-center justify-center text-xs text-muted-foreground">
                      无图片
                    </div>
                  )}
                </div>
                <div className="mt-2 flex min-w-0 flex-col gap-1">
                  {showItemTitle ? (
                    <div className="truncate text-xs font-medium">
                      {image.item_title || "未关联验收项"}
                    </div>
                  ) : null}
                  <div className="text-xs text-muted-foreground">
                    {sourceLabel}
                  </div>
                </div>
              </a>
            );
          })}
        </div>
      ) : (
        <div className="mt-3 rounded-md border border-dashed p-3 text-center text-xs text-muted-foreground">
          {emptyText}
        </div>
      )}
    </div>
  );
}

function CustomerSupplementImages({ images }: { images: AcceptanceImageItem[] }) {
  if (images.length === 0) {
    return null;
  }

  return (
    <div className="rounded-md border bg-muted/20 px-3 py-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
          <ImageIcon data-icon="inline-start" />
          <span>客户补充了 {images.length} 张现场图片</span>
        </div>
        <div className="flex flex-wrap gap-2">
          {images.map((image, index) => {
            const src = getImageItemSrc(image);
            const href = getImageItemHref(image);
            return (
              <a
                key={image.id || image.path || image.url || index}
                href={href || undefined}
                target="_blank"
                rel="noreferrer"
                className="block size-12 overflow-hidden rounded-md border bg-card"
                aria-label={`查看客户补充图片 ${index + 1}`}
              >
                {src ? (
                  <img
                    src={src}
                    alt="客户补充图片"
                    className="size-full object-cover"
                  />
                ) : (
                  <div className="flex size-full items-center justify-center text-[10px] text-muted-foreground">
                    无图
                  </div>
                )}
              </a>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function CustomerNotificationPanel({
  notification,
  disabled,
  onSend,
  onResend,
}: {
  notification: AcceptanceNotification | null;
  disabled: boolean;
  onSend: () => void;
  onResend: () => void;
}) {
  return (
    <div className="border-b bg-muted/30 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium">客户短信通知</span>
            <Badge variant={notificationVariant(notification)}>
              {notificationLabel(notification)}
            </Badge>
          </div>
          {notification ? (
            <div className="text-sm text-muted-foreground">
              手机：{notification.phone} · 链接：{notification.link_type || "-"} · 过期：
              {formatDateTime(notification.expire_at)}
            </div>
          ) : (
            <div className="text-sm text-muted-foreground">
              复核通过后可短信通知业主打开小程序确认验收
            </div>
          )}
          {notification?.send_error ? (
            <div className="text-sm text-destructive">
              失败原因：{notification.send_error}
            </div>
          ) : null}
          {notification?.sent_at ? (
            <div className="text-xs text-muted-foreground">
              发送时间：{formatDateTime(notification.sent_at)}
              {notification.used_at ? ` · 最近打开：${formatDateTime(notification.used_at)}` : ""}
            </div>
          ) : null}
        </div>
        <div className="flex gap-2">
          {notification ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onResend}
              disabled={disabled}
            >
              <RefreshCw data-icon="inline-start" />
              重新发送
            </Button>
          ) : (
            <Button type="button" size="sm" onClick={onSend} disabled={disabled}>
              <MessageSquareText data-icon="inline-start" />
              发送通知
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

function ImageUploadBlock({
  label,
  images,
  disabled,
  uploading,
  onUpload,
  onRemove,
}: {
  label: string;
  images: string[];
  disabled: boolean;
  uploading: boolean;
  onUpload: (event: ChangeEvent<HTMLInputElement>) => void;
  onRemove: (index: number) => void;
}) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="min-w-0 rounded-md border bg-background p-3">
      <div className="flex items-center justify-between gap-2">
        <Label htmlFor={inputId}>{label}</Label>
        <input
          ref={inputRef}
          id={inputId}
          type="file"
          accept="image/*"
          multiple
          className="sr-only"
          tabIndex={-1}
          onChange={onUpload}
          disabled={disabled || uploading}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled || uploading}
          onClick={() => inputRef.current?.click()}
        >
          {uploading ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <Upload data-icon="inline-start" />}
          上传
        </Button>
      </div>
      {images.length > 0 ? (
        <div className="mt-3 grid grid-cols-[repeat(auto-fill,minmax(64px,64px))] gap-2">
          {images.map((image, index) => (
            <div
              key={`${image}-${index}`}
              className="group relative size-16 overflow-hidden rounded-md border bg-muted"
            >
              <img src={getPreviewImageSrc(image)} alt={label} className="size-full object-cover" />
              {!disabled ? (
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  className="absolute inset-x-1 bottom-1 h-6 px-2 text-[11px] opacity-0 transition-opacity group-hover:opacity-100"
                  onClick={() => onRemove(index)}
                >
                  删除
                </Button>
              ) : null}
            </div>
          ))}
        </div>
      ) : (
        <div className="mt-3 rounded-md border border-dashed p-3 text-center text-xs text-muted-foreground">
          暂无图片
        </div>
      )}
    </div>
  );
}
