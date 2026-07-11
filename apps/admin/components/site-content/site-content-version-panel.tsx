"use client";

import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";

import { StatusAlert } from "@/components/admin/status-alert";
import { getSiteContentErrorMessage, listSiteContentVersions } from "@/components/site-content/site-content-api";
import { SiteContentRollbackAction } from "@/components/site-content/site-content-actions";
import type { SiteContentVersionListData } from "@/components/site-content/site-content-types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "-" : date.toLocaleString("zh-CN");
}

export function SiteContentVersionPanel({
  id,
  publishedVersionId,
  canPublish,
  onWarning,
}: {
  id: string;
  publishedVersionId: string | null;
  canPublish: boolean;
  onWarning: (message: string) => void;
}) {
  const [page, setPage] = useState(1);
  const [data, setData] = useState<SiteContentVersionListData | null>(null);
  const [error, setError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const versionQuery = { page, pageSize: 20 };

  useEffect(() => {
    let active = true;
    setError("");
    void listSiteContentVersions(id, versionQuery.page).then((nextData) => {
      if (active) setData(nextData);
    }).catch((loadError) => {
      if (active) setError(getSiteContentErrorMessage(loadError, "版本历史加载失败"));
    });
    return () => { active = false; };
  }, [id, reloadKey, versionQuery.page]);

  if (!data && !error) {
    return <div className="flex flex-col gap-3" aria-label="正在加载版本历史"><Skeleton className="h-10 w-full" /><Skeleton className="h-20 w-full" /><Skeleton className="h-20 w-full" /></div>;
  }

  return (
    <div className="flex flex-col gap-4">
      {error ? <StatusAlert>{error}</StatusAlert> : null}
      {!canPublish ? <p className="text-xs text-muted-foreground">回滚需要 platform.site_content.publish 权限，版本记录仍可查看。</p> : null}
      {data?.list.length ? (
        <Table>
          <TableHeader>
            <TableRow><TableHead>版本</TableHead><TableHead>标题</TableHead><TableHead>创建时间</TableHead><TableHead className="text-right">操作</TableHead></TableRow>
          </TableHeader>
          <TableBody>
            {data.list.map((version) => (
              <TableRow key={version.id}>
                <TableCell className="whitespace-nowrap tabular-nums">
                  v{version.version_no} {version.id === publishedVersionId ? <Badge variant="success">当前公开</Badge> : null}
                </TableCell>
                <TableCell><span className="block max-w-[42ch] truncate font-medium">{version.title}</span></TableCell>
                <TableCell className="whitespace-nowrap text-muted-foreground tabular-nums">{formatDate(version.created_at)}</TableCell>
                <TableCell className="text-right">
                  {version.id === publishedVersionId ? <span className="text-xs text-muted-foreground">无需回滚</span> : (
                    <SiteContentRollbackAction id={id} versionId={version.id} canPublish={canPublish} onWarning={onWarning} />
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : (
        <Empty className="border"><EmptyHeader><EmptyTitle>暂无版本记录</EmptyTitle><EmptyDescription>保存草稿后会在此形成不可覆盖的版本记录。</EmptyDescription></EmptyHeader></Empty>
      )}
      {data ? (
        <div className="flex flex-col gap-3 border-t pt-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-muted-foreground tabular-nums">第 {data.pagination.page} / {Math.max(1, data.pagination.totalPages)} 页，共 {data.pagination.total} 个版本</p>
          <div className="flex gap-2">
            <Button type="button" variant="outline" disabled={page <= 1} onClick={() => { setData(null); setPage((current) => Math.max(1, current - 1)); }}><ChevronLeft data-icon="inline-start" />上一页</Button>
            <Button type="button" variant="outline" disabled={page >= Math.max(1, data.pagination.totalPages)} onClick={() => { setData(null); setPage((current) => current + 1); }}>下一页<ChevronRight data-icon="inline-end" /></Button>
          </div>
        </div>
      ) : error ? <Button type="button" variant="outline" onClick={() => { setError(""); setData(null); setReloadKey((current) => current + 1); }}><Loader2 data-icon="inline-start" />重新加载</Button> : null}
    </div>
  );
}
