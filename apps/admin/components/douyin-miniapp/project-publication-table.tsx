import { Images, Pencil } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import {
  getPublicationReadinessWarnings,
  getProjectDisplayToggleState,
  projectPublicationPhaseDisplay,
  projectProfileDraft,
  type ProjectPublicationRow,
  type PublicationStatus,
} from "./project-publication-logic";

export function ProjectTable({
  rows,
  loading,
  togglingId,
  onEdit,
  onToggleDisplay,
}: {
  rows: ProjectPublicationRow[];
  loading: boolean;
  togglingId: string | null;
  onEdit(row: ProjectPublicationRow): void;
  onToggleDisplay(row: ProjectPublicationRow, checked: boolean): void;
}) {
  if (rows.length === 0) {
    return (
      <Empty className="h-full rounded-none border-0">
        <EmptyHeader>
          <EmptyMedia variant="icon"><Images /></EmptyMedia>
          <EmptyTitle>暂无项目</EmptyTitle>
          <EmptyDescription>当前发布状态下没有可维护的项目。</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }
  return (
    <Table className="min-w-[980px]" containerClassName="h-full">
      <TableHeader className="sticky top-0 bg-muted/60">
        <TableRow>
          <TableHead>项目</TableHead>
          <TableHead className="whitespace-nowrap">项目阶段</TableHead>
          <TableHead className="whitespace-nowrap">发布状态</TableHead>
          <TableHead className="whitespace-nowrap">图片</TableHead>
          <TableHead>完整性</TableHead>
          <TableHead className="whitespace-nowrap text-right">操作</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>{rows.map((row) => {
        const warnings = getPublicationReadinessWarnings(
          row,
          projectProfileDraft(row),
        );
        const phase = projectPublicationPhaseDisplay(row);
        const displayToggle = getProjectDisplayToggleState(row);
        const toggleDisabled = loading || Boolean(togglingId)
          || displayToggle.disabled;
        return <TableRow key={row.id}>
          <TableCell><div className="min-w-[220px]"><p className="font-medium">{row.name?.trim() || "未命名项目"}</p><p className="mt-1 text-xs text-muted-foreground">{row.property?.community || "未填写小区"}{row.property?.layout ? ` · ${row.property.layout}` : ""}</p></div></TableCell>
          <TableCell><Badge className="whitespace-nowrap" variant={phase.variant}>{phase.label}</Badge></TableCell>
          <TableCell><Badge className="whitespace-nowrap" variant={publicationVariant(row.public_profile?.publication_status)}>{publicationLabel(row.public_profile?.publication_status)}</Badge></TableCell>
          <TableCell className="whitespace-nowrap tabular-nums">已选图片 {row.public_profile?.public_image_urls.length ?? 0} 张</TableCell>
          <TableCell>{warnings.length ? <span className="text-sm text-destructive">{warnings.join("；")}</span> : <span className="text-sm text-success">允许发布</span>}</TableCell>
          <TableCell className="whitespace-nowrap text-right"><div className="inline-flex items-center justify-end gap-3"><label className="inline-flex items-center gap-2 whitespace-nowrap text-xs text-muted-foreground" title={displayToggle.reason ?? undefined}><Switch aria-label={`切换项目实景展示状态：${row.name?.trim() || "未命名项目"}`} checked={displayToggle.checked} disabled={toggleDisabled} onCheckedChange={(checked) => onToggleDisplay(row, checked)} /><span>{togglingId === row.id ? "处理中" : displayToggle.label}</span></label><Button size="sm" variant="outline" onClick={() => onEdit(row)} disabled={loading || togglingId === row.id}><Pencil data-icon="inline-start" />编辑公开资料</Button></div></TableCell>
        </TableRow>;
      })}</TableBody>
    </Table>
  );
}

export function ProjectTableSkeleton() {
  return <div className="flex flex-col gap-3 p-5" aria-busy="true" aria-label="项目实景内容加载中">{Array.from({ length: 6 }, (_, index) => <Skeleton className="h-16 w-full" key={index} />)}</div>;
}

function publicationLabel(status?: PublicationStatus): string {
  return status === "published" ? "已发布" : status === "hidden" ? "已隐藏" : "草稿";
}

function publicationVariant(
  status?: PublicationStatus,
): "success" | "secondary" | "warning" {
  return status === "published" ? "success" : status === "hidden" ? "secondary" : "warning";
}
