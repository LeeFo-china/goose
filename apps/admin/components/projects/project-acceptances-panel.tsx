"use client";

import { ChangeEvent, useEffect, useMemo, useState } from "react";
import {
  PROJECT_ACCEPTANCE_STAGE_LABELS,
  ProjectAcceptanceStatusConfig,
  PROJECT_LOG_STAGE_CODE_VALUES,
  type ProjectAcceptanceStatus,
  type ProjectLogStageCode,
} from "@gooes/domain";
import {
  CheckCircle2,
  Loader2,
  Plus,
  RefreshCw,
  Send,
  Upload,
  XCircle,
} from "lucide-react";
import { StatusAlert } from "@/components/admin/status-alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
  rectification_remark: string | null;
  rectification_images: string[];
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
  initiator?: { name?: string | null } | null;
  reviewer?: { name?: string | null } | null;
};

type AcceptanceListData = {
  list: ProjectAcceptance[];
  pagination: {
    total: number;
  };
};

type EditableItem = {
  id: string;
  result: AcceptanceItemResult | null;
  remark: string;
  images: string[];
  rectification_remark: string;
  rectification_images: string[];
};

type EditableState = {
  summary: string;
  items: Record<string, EditableItem>;
};

const stageOptions = PROJECT_LOG_STAGE_CODE_VALUES.map((value) => ({
  value,
  label: PROJECT_ACCEPTANCE_STAGE_LABELS[value],
}));

function getPayloadMessage(payload: unknown, fallback: string) {
  if (payload && typeof payload === "object" && "message" in payload) {
    const message = (payload as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) return message;
  }
  return fallback;
}

async function requestBackend<T>(
  path: string,
  input?: { method?: "GET" | "POST" | "PATCH"; payload?: unknown },
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
  return {
    summary: acceptance?.summary || "",
    items: Object.fromEntries(
      (acceptance?.items || []).map((item) => [
        item.id,
        {
          id: item.id,
          result: item.result,
          remark: item.remark || "",
          images: item.images || [],
          rectification_remark: item.rectification_remark || "",
          rectification_images: item.rectification_images || [],
        },
      ]),
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
  const [editable, setEditable] = useState<EditableState>(() =>
    buildEditable(null),
  );

  const selected = useMemo(
    () => acceptances.find((item) => item.id === selectedId) || null,
    [acceptances, selectedId],
  );

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
    setEditable(buildEditable(selected));
  }, [selected?.id]);

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

  const createAcceptance = () =>
    runAction(async () => {
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

  const approveAcceptance = () =>
    runAction(async () => {
      if (!selected) return;
      const comment = window.prompt("复核说明", "复核通过");
      await requestBackend(`/project-acceptances/${selected.id}/approve`, {
        method: "POST",
        payload: { comment },
      });
    });

  const rejectAcceptance = () =>
    runAction(async () => {
      if (!selected) return;
      const comment = window.prompt("驳回原因");
      if (!comment?.trim()) return;
      await requestBackend(`/project-acceptances/${selected.id}/reject`, {
        method: "POST",
        payload: { comment },
      });
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
      const formData = new FormData();
      formData.append("scene", "project_acceptance");
      formData.append("project_id", project.id);
      files.forEach((file) => formData.append("files", file));
      const response = await fetch("/api/backend/uploads/images", {
        method: "POST",
        body: formData,
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload.success === false) {
        throw new Error(getPayloadMessage(payload, "图片上传失败"));
      }
      const paths = ((payload.data?.list || []) as Array<{ path?: string }>)
        .map((item) => item.path)
        .filter((item): item is string => Boolean(item));
      const currentItem = editable.items[itemId];
      updateEditableItem(itemId, {
        [target]: [...(currentItem?.[target] || []), ...paths],
      } as Partial<EditableItem>);
    } catch (err) {
      setError(err instanceof Error ? err.message : "图片上传失败");
    } finally {
      setUploadingItemId("");
    }
  };

  return (
    <div className="flex flex-col gap-5">
      {error ? <StatusAlert>{error}</StatusAlert> : null}

      <div className="flex flex-wrap items-end justify-between gap-3 rounded-md border bg-card p-4">
        <div className="min-w-56 space-y-2">
          <Label>发起工序验收</Label>
          <Select
            value={stageCode}
            onValueChange={(value) => setStageCode(value as ProjectLogStageCode)}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {stageOptions.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex gap-2">
          <Button type="button" variant="outline" onClick={loadAcceptances} disabled={loading}>
            <RefreshCw className={loading ? "animate-spin" : ""} />
            刷新
          </Button>
          <Button type="button" onClick={createAcceptance} disabled={actionLoading}>
            {actionLoading ? <Loader2 className="animate-spin" data-icon="inline-start" /> : <Plus />}
            发起验收
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="grid gap-3 md:grid-cols-[260px_1fr]">
          <Skeleton className="h-72" />
          <Skeleton className="h-72" />
        </div>
      ) : acceptances.length === 0 ? (
        <div className="rounded-md border p-8 text-center text-sm text-muted-foreground">
          暂无工序验收
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
          <div className="flex flex-col gap-2">
            {acceptances.map((item) => (
              <button
                key={item.id}
                type="button"
                className={`rounded-md border p-3 text-left transition-colors hover:bg-accent ${
                  item.id === selectedId ? "border-primary bg-accent" : "bg-card"
                }`}
                onClick={() => setSelectedId(item.id)}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="font-medium">{item.stage_label || item.title}</div>
                  <Badge variant={statusVariant(item.status)}>
                    {item.status_label}
                  </Badge>
                </div>
                <div className="mt-2 text-xs text-muted-foreground">
                  {formatDateTime(item.updated_at || item.created_at)}
                </div>
              </button>
            ))}
          </div>

          {selected ? (
            <section className="rounded-md border bg-card">
              <div className="flex flex-wrap items-start justify-between gap-3 border-b p-4">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-semibold">{selected.title}</h3>
                    <Badge variant={statusVariant(selected.status)}>
                      {selected.status_label}
                    </Badge>
                  </div>
                  <div className="mt-1 text-sm text-muted-foreground">
                    发起人：{selected.initiator?.name || "-"} · 复核人：
                    {selected.reviewer?.name || "-"}
                  </div>
                  {selected.reject_reason ? (
                    <div className="mt-2 text-sm text-destructive">
                      {selected.reject_source === "customer" ? "业主疑问" : "驳回原因"}：
                      {selected.reject_reason}
                    </div>
                  ) : null}
                </div>
                <div className="flex flex-wrap gap-2">
                  {canEdit(selected.status) ? (
                    <>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => saveAcceptance(false)}
                        disabled={actionLoading}
                      >
                        保存草稿
                      </Button>
                      <Button
                        type="button"
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
                        onClick={rejectAcceptance}
                        disabled={actionLoading}
                      >
                        <XCircle />
                        驳回
                      </Button>
                      <Button
                        type="button"
                        onClick={approveAcceptance}
                        disabled={actionLoading}
                      >
                        <CheckCircle2 />
                        通过
                      </Button>
                    </>
                  ) : null}
                </div>
              </div>

              <div className="space-y-4 p-4">
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
                      <article key={item.id} className="rounded-md border p-4">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <div className="flex flex-wrap items-center gap-2">
                              {item.category ? (
                                <Badge variant="secondary">{item.category}</Badge>
                              ) : null}
                              {item.required ? <Badge variant="outline">必检</Badge> : null}
                              {item.photo_required ? (
                                <Badge variant="outline">需照片</Badge>
                              ) : null}
                            </div>
                            <h4 className="mt-2 font-medium">{item.title}</h4>
                            <p className="mt-1 text-sm text-muted-foreground">
                              {item.standard}
                            </p>
                          </div>
                          <div className="w-40">
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

                        <div className="mt-3 grid gap-3 md:grid-cols-2">
                          <div className="space-y-2">
                            <Label>备注</Label>
                            <Textarea
                              value={draft?.remark || ""}
                              disabled={!editableNow}
                              onChange={(event) =>
                                updateEditableItem(item.id, {
                                  remark: event.target.value,
                                })}
                              placeholder="填写验收备注"
                            />
                          </div>
                          <div className="space-y-2">
                            <Label>整改说明</Label>
                            <Textarea
                              value={draft?.rectification_remark || ""}
                              disabled={!editableNow}
                              onChange={(event) =>
                                updateEditableItem(item.id, {
                                  rectification_remark: event.target.value,
                                })}
                              placeholder="被驳回后填写整改说明"
                            />
                          </div>
                        </div>

                        <div className="mt-3 grid gap-3 md:grid-cols-2">
                          <ImageUploadBlock
                            label="现场照片"
                            images={draft?.images || []}
                            disabled={!editableNow}
                            uploading={uploadingItemId === `${item.id}:images`}
                            onUpload={(event) => uploadImages(item.id, event, "images")}
                            onRemove={(index) => updateEditableItem(item.id, {
                              images: (draft?.images || []).filter((_, i) => i !== index),
                            })}
                          />
                          <ImageUploadBlock
                            label="整改后照片"
                            images={draft?.rectification_images || []}
                            disabled={!editableNow}
                            uploading={uploadingItemId === `${item.id}:rectification_images`}
                            onUpload={(event) =>
                              uploadImages(item.id, event, "rectification_images")}
                            onRemove={(index) => updateEditableItem(item.id, {
                              rectification_images: (draft?.rectification_images || [])
                                .filter((_, i) => i !== index),
                            })}
                          />
                        </div>
                      </article>
                    );
                  })}
                </div>
              </div>
            </section>
          ) : null}
        </div>
      )}
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
  return (
    <div className="rounded-md border bg-background p-3">
      <div className="flex items-center justify-between gap-2">
        <Label>{label}</Label>
        <Button type="button" variant="outline" size="sm" disabled={disabled || uploading} asChild>
          <label className="cursor-pointer">
            {uploading ? <Loader2 className="animate-spin" /> : <Upload />}
            上传
            <input
              type="file"
              accept="image/*"
              multiple
              className="sr-only"
              onChange={onUpload}
              disabled={disabled || uploading}
            />
          </label>
        </Button>
      </div>
      {images.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {images.map((image, index) => (
            <div key={`${image}-${index}`} className="group relative size-16 overflow-hidden rounded-md border bg-muted">
              <img src={image} alt={label} className="size-full object-cover" />
              {!disabled ? (
                <button
                  type="button"
                  className="absolute inset-x-0 bottom-0 bg-destructive/90 py-0.5 text-[11px] text-destructive-foreground opacity-0 transition-opacity group-hover:opacity-100"
                  onClick={() => onRemove(index)}
                >
                  删除
                </button>
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
