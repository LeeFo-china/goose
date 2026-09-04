"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type {
  DouyinMaterialNoteTenantDetail,
  DouyinMaterialNoteTenantVersion,
} from "@gooes/domain";
import { ArrowLeft, Loader2 } from "lucide-react";

import { StatusAlert } from "@/components/admin/status-alert";
import { MaterialNoteActionDialog } from "@/components/douyin-miniapp/material-note-actions";
import {
  getMaterialNoteErrorMessage,
  getMaterialNoteVersion,
} from "@/components/douyin-miniapp/material-note-api";
import {
  getMaterialNoteActions,
  materialNoteStatusLabels,
  type MaterialNoteAction,
} from "@/components/douyin-miniapp/material-note-contract";
import {
  MaterialNoteDraftPreview,
  MaterialNoteEditor,
} from "@/components/douyin-miniapp/material-note-editor";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

function formatDate(value: string | null): string {
  if (!value) return "-";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "-" : date.toLocaleString("zh-CN");
}

function statusVariant(status: DouyinMaterialNoteTenantDetail["status"]) {
  if (status === "published") return "success" as const;
  if (status === "archived") return "secondary" as const;
  if (status === "withdrawn") return "danger" as const;
  return "warning" as const;
}

export function resolveCurrentMaterialNoteActions({
  status,
  currentVersionId,
  publishedVersionId,
  canPublish,
}: {
  status: DouyinMaterialNoteTenantDetail["status"];
  currentVersionId: string;
  publishedVersionId: string | null;
  canPublish: boolean;
}): MaterialNoteAction[] {
  const actions = getMaterialNoteActions(status, canPublish);
  if (status !== "published" || publishedVersionId !== currentVersionId) return actions;
  return actions.filter((action) => action !== "publish");
}

export function MaterialNoteDetail({
  detail,
  canManage,
  canPublish,
}: {
  detail: DouyinMaterialNoteTenantDetail;
  canManage: boolean;
  canPublish: boolean;
}) {
  const router = useRouter();
  const [currentVersionId, setCurrentVersionId] = useState(detail.latest_version.id);
  const [currentVersionDetail, setCurrentVersionDetail] =
    useState<DouyinMaterialNoteTenantVersion | null>(null);
  const [previewError, setPreviewError] = useState("");
  const [previewReloadKey, setPreviewReloadKey] = useState(0);
  const actions = currentVersionDetail ? resolveCurrentMaterialNoteActions({
    status: detail.status,
    currentVersionId: currentVersionDetail.id,
    publishedVersionId: detail.published_version_id,
    canPublish,
  }) : [];
  const currentContentLoaded = currentVersionDetail?.content_blocks !== undefined;

  useEffect(() => {
    setCurrentVersionId(detail.latest_version.id);
  }, [detail.latest_version.id]);

  useEffect(() => {
    let active = true;
    setCurrentVersionDetail(null);
    setPreviewError("");
    void getMaterialNoteVersion(detail.id, currentVersionId).then((version) => {
      if (active) setCurrentVersionDetail(version);
    }).catch((error) => {
      if (active) setPreviewError(getMaterialNoteErrorMessage(error, "当前内容加载失败"));
    });
    return () => { active = false; };
  }, [currentVersionId, detail.id, previewReloadKey]);

  function refreshAfterCommand() {
    router.refresh();
    setPreviewReloadKey((current) => current + 1);
  }

  function handleVersionSaved(versionId: string) {
    setCurrentVersionId(versionId);
    router.refresh();
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-5 overflow-y-auto pb-6 pr-1 [scrollbar-gutter:stable]">
      <div className="flex flex-col justify-between gap-3 border-b pb-4 md:flex-row md:items-end">
        <div className="min-w-0">
          <Button asChild variant="ghost" className="mb-2 px-0"><Link href="/douyin-miniapp/materials">
            <ArrowLeft data-icon="inline-start" />返回资料列表
          </Link></Button>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="truncate text-xl font-semibold tracking-normal">{detail.title}</h1>
            <Badge variant={statusVariant(detail.status)}>{materialNoteStatusLabels[detail.status]}</Badge>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            累计领取 {detail.claim_count} 次 · 更新于 {formatDate(detail.updated_at)}
          </p>
        </div>

        <div className="flex flex-wrap gap-2 md:justify-end">
          {currentVersionDetail ? actions.map((action) => (
            <MaterialNoteActionDialog
              key={action}
              noteId={detail.id}
              status={detail.status}
              versionId={currentVersionDetail.id}
              action={action}
              onCompleted={refreshAfterCommand}
            />
          )) : null}
        </div>
      </div>

      {!canPublish ? <StatusAlert tone="warning" title="缺少发布权限">
        发布、归档和撤回需要 douyin_material_note.publish 权限。
      </StatusAlert> : null}

      {detail.status === "withdrawn" ? <StatusAlert tone="warning" title="资料已撤回">
        已撤回资料为终态，不能继续编辑或重新发布。
      </StatusAlert> : null}

      {previewError ? <StatusAlert>{previewError}<Button
        type="button"
        variant="link"
        onClick={() => setPreviewReloadKey((current) => current + 1)}
      >
        重新加载
      </Button></StatusAlert> : null}

      {!currentContentLoaded && !previewError ? <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="animate-spin" data-icon="inline-start" />正在读取当前内容
      </div> : null}

      {currentVersionDetail ? canManage && detail.status !== "withdrawn"
        ? <MaterialNoteEditor
          key={currentVersionDetail.id}
          noteId={detail.id}
          baseVersion={currentVersionDetail}
          canManage
          onSaved={handleVersionSaved}
        />
        : <MaterialNoteDraftPreview draft={currentVersionDetail} />
      : null}
    </div>
  );
}
