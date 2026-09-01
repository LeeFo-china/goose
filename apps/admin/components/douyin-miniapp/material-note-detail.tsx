"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type {
  DouyinMaterialNoteTenantDetail,
  DouyinMaterialNoteTenantVersion,
  DouyinMaterialNoteTenantVersionList,
  DouyinMaterialNoteTenantVersionSummary,
} from "@gooes/domain";
import { ArrowLeft, ChevronLeft, ChevronRight, Eye, Loader2 } from "lucide-react";

import { StatusAlert } from "@/components/admin/status-alert";
import { MaterialNoteActions } from "@/components/douyin-miniapp/material-note-actions";
import {
  getMaterialNoteErrorMessage,
  getMaterialNoteVersion,
  listMaterialNoteVersions,
} from "@/components/douyin-miniapp/material-note-api";
import {
  materialNoteStatusLabels,
} from "@/components/douyin-miniapp/material-note-contract";
import {
  MaterialNoteDraftPreview,
  MaterialNoteEditor,
} from "@/components/douyin-miniapp/material-note-editor";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

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

export function selectMaterialVersionAfterPageLoad<Version extends { id: string }>(
  versions: readonly Version[],
  previous: Version,
  preferredVersionId?: string,
): Version {
  if (preferredVersionId) {
    const preferred = versions.find((version) => version.id === preferredVersionId);
    if (preferred) return preferred;
  }
  return versions[0] ?? previous;
}

export function resolveSelectedMaterialVersionDetail<Version extends { id: string }>(
  selectedVersionId: string,
  loadedVersion: Version | null,
): Version | null {
  return loadedVersion?.id === selectedVersionId ? loadedVersion : null;
}

export function MaterialNoteDetail({
  detail,
  initialVersionPage,
  initialVersionError,
  canManage,
  canPublish,
}: {
  detail: DouyinMaterialNoteTenantDetail;
  initialVersionPage: DouyinMaterialNoteTenantVersionList;
  initialVersionError?: string | null;
  canManage: boolean;
  canPublish: boolean;
}) {
  const router = useRouter();
  const [versions, setVersions] = useState(initialVersionPage);
  const [versionError, setVersionError] = useState(initialVersionError ?? "");
  const [historyPending, setHistoryPending] = useState(false);
  const [selectedVersion, setSelectedVersion] = useState<DouyinMaterialNoteTenantVersionSummary>(
    initialVersionPage.list.find((version) => version.id === detail.latest_version.id)
      ?? detail.latest_version,
  );
  const [selectedVersionDetail, setSelectedVersionDetail] = useState<DouyinMaterialNoteTenantVersion | null>(null);
  const [previewError, setPreviewError] = useState("");
  const [previewReloadKey, setPreviewReloadKey] = useState(0);
  const resolvedVersionDetail = resolveSelectedMaterialVersionDetail(
    selectedVersion.id,
    selectedVersionDetail,
  );
  const hasLoadedBody = resolvedVersionDetail?.content_blocks !== undefined;

  useEffect(() => {
    setVersions(initialVersionPage);
    setVersionError(initialVersionError ?? "");
  }, [initialVersionError, initialVersionPage]);

  useEffect(() => {
    let active = true;
    setSelectedVersionDetail(null);
    setPreviewError("");
    void getMaterialNoteVersion(detail.id, selectedVersion.id).then((version) => {
      if (active) setSelectedVersionDetail(version);
    }).catch((error) => {
      if (active) setPreviewError(getMaterialNoteErrorMessage(error, "版本正文加载失败"));
    });
    return () => { active = false; };
  }, [detail.id, previewReloadKey, selectedVersion.id]);

  async function loadVersionPage(page: number, preferredVersionId?: string) {
    setHistoryPending(true);
    setVersionError("");
    try {
      const next = await listMaterialNoteVersions(detail.id, { page, pageSize: 20 });
      setVersions(next);
      setSelectedVersion((current) => selectMaterialVersionAfterPageLoad(
        next.list,
        current,
        preferredVersionId,
      ));
    } catch (error) {
      setVersionError(getMaterialNoteErrorMessage(error, "版本历史加载失败"));
    } finally {
      setHistoryPending(false);
    }
  }

  function refreshAfterCommand() {
    router.refresh();
    setPreviewReloadKey((current) => current + 1);
    void loadVersionPage(versions.pagination.page, selectedVersion.id);
  }

  function handleVersionSaved(versionId: string) {
    router.refresh();
    void loadVersionPage(1, versionId);
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
            当前最新 v{detail.current_version} · 累计领取 {detail.claim_count} 次 · 更新于 {formatDate(detail.updated_at)}
          </p>
        </div>
        {resolvedVersionDetail && hasLoadedBody ? <MaterialNoteActions
          key={`${detail.status}:${selectedVersion.id}`}
          noteId={detail.id}
          status={detail.status}
          versionId={selectedVersion.id}
          versionNumber={selectedVersion.version}
          canPublish={canPublish}
          onCompleted={refreshAfterCommand}
        /> : null}
      </div>

      <Card className="shadow-none">
        <CardHeader><CardTitle>不可变版本</CardTitle>
          <CardDescription>历史列表不加载正文；选择版本后才通过独立详情接口读取正文并用于预览或发布确认。</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {versionError ? <StatusAlert>{versionError}</StatusAlert> : null}
          {historyPending ? <div className="flex flex-col gap-3" aria-label="正在加载版本历史">
            <Skeleton className="h-10 w-full" /><Skeleton className="h-16 w-full" />
          </div> : versions.list.length > 0 ? <Table>
            <TableHeader><TableRow><TableHead>版本</TableHead><TableHead>标题</TableHead><TableHead>分类</TableHead><TableHead>创建时间</TableHead><TableHead className="text-right">预览</TableHead></TableRow></TableHeader>
            <TableBody>{versions.list.map((version) => <TableRow key={version.id}>
              <TableCell className="whitespace-nowrap tabular-nums">v{version.version} {version.id === detail.published_version_id ? <Badge variant="success">当前发布</Badge> : null}</TableCell>
              <TableCell><span className="block max-w-[36ch] truncate font-medium">{version.title}</span></TableCell>
              <TableCell><Badge variant="outline">{version.category}</Badge></TableCell>
              <TableCell className="whitespace-nowrap text-muted-foreground tabular-nums">{formatDate(version.created_at)}</TableCell>
              <TableCell className="text-right"><Button type="button" variant={selectedVersion.id === version.id ? "secondary" : "ghost"} size="sm" onClick={() => setSelectedVersion(version)}>
                <Eye data-icon="inline-start" />{selectedVersion.id === version.id ? "预览中" : "预览"}
              </Button></TableCell>
            </TableRow>)}</TableBody>
          </Table> : <Empty className="border"><EmptyHeader><EmptyTitle>暂无版本记录</EmptyTitle>
            <EmptyDescription>资料创建成功后至少应有版本 1，请刷新或联系管理员核查。</EmptyDescription>
          </EmptyHeader></Empty>}
          <div className="flex flex-col gap-3 border-t pt-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-muted-foreground tabular-nums">第 {versions.pagination.page} / {Math.max(1, versions.pagination.totalPages)} 页，共 {versions.pagination.total} 个版本</p>
            <div className="flex gap-2">
              <Button type="button" variant="outline" disabled={historyPending || versions.pagination.page <= 1} onClick={() => void loadVersionPage(versions.pagination.page - 1)}>
                <ChevronLeft data-icon="inline-start" />上一页
              </Button>
              <Button type="button" variant="outline" disabled={historyPending || versions.pagination.page >= Math.max(1, versions.pagination.totalPages)} onClick={() => void loadVersionPage(versions.pagination.page + 1)}>
                下一页<ChevronRight data-icon="inline-end" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {previewError ? <StatusAlert>{previewError}<Button type="button" variant="link" onClick={() => setPreviewReloadKey((current) => current + 1)}>重新加载</Button></StatusAlert> : null}
      {!resolvedVersionDetail && !previewError ? <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="animate-spin" data-icon="inline-start" />正在读取所选版本正文
      </div> : null}
      {resolvedVersionDetail ? canManage && detail.status !== "withdrawn"
        ? <MaterialNoteEditor
          key={resolvedVersionDetail.id}
          noteId={detail.id}
          baseVersion={resolvedVersionDetail}
          canManage
          onSaved={handleVersionSaved}
        />
        : <MaterialNoteDraftPreview draft={resolvedVersionDetail} />
      : null}
    </div>
  );
}
