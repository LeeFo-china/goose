import { MapPinned } from "lucide-react";

import { ServiceProviderPublicationActions } from "@/components/tenant-onboarding/tenant-onboarding-actions";
import {
  formatDateTime,
  formatRegion,
  publicationStatusMeta,
  type ServiceProviderPublicationListRecord,
} from "@/components/tenant-onboarding/tenant-onboarding-types";
import { Badge } from "@/components/ui/badge";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PLATFORM_LIST_TABLE_ROW_HEIGHT_CLASS_NAME } from "@/components/platform/platform-list-page-size";

export function ServiceProviderPublicationTable({
  publications,
}: {
  publications: ServiceProviderPublicationListRecord[];
}) {
  return (
    <Table containerClassName="min-w-[860px] overflow-visible">
      <TableHeader className="sticky top-0 bg-card">
        <TableRow>
          <TableHead className="min-w-[240px]">公司与公开名称</TableHead>
          <TableHead className="w-[160px]">服务区域</TableHead>
          <TableHead className="w-[180px]">提交时间</TableHead>
          <TableHead className="w-[120px]">发布状态</TableHead>
          <TableHead className="w-[170px]">更新时间</TableHead>
          <TableHead className="sticky right-0 w-[112px] bg-card text-right">操作</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {publications.length ? publications.map((publication) => {
          const meta = publicationStatusMeta[publication.status];
          return (
            <TableRow key={publication.tenant_id} className={`group ${PLATFORM_LIST_TABLE_ROW_HEIGHT_CLASS_NAME}`}>
              <TableCell>
                <div className="max-w-[300px] truncate font-semibold">{publication.tenant_name}</div>
                <div className="mt-1 text-xs text-muted-foreground">
                  公开名称：{publication.public_name || "待完善"}
                </div>
              </TableCell>
              <TableCell>
                <div>{formatRegion(publication)}</div>
                <div className="mt-1 text-xs text-muted-foreground tabular-nums">
                  {publication.area_count} 个服务区域
                </div>
              </TableCell>
              <TableCell className="text-muted-foreground tabular-nums">
                {formatDateTime(publication.submitted_at)}
              </TableCell>
              <TableCell><Badge variant={meta.variant}>{meta.label}</Badge></TableCell>
              <TableCell className="text-muted-foreground tabular-nums">
                {formatDateTime(publication.updated_at)}
              </TableCell>
              <TableCell className="sticky right-0 bg-card text-right group-hover:bg-muted/40">
                <ServiceProviderPublicationActions publication={publication} />
              </TableCell>
            </TableRow>
          );
        }) : (
          <TableRow>
            <TableCell colSpan={6} className="p-0">
              <Empty className="min-h-52 border-0">
                <EmptyHeader>
                  <EmptyMedia variant="icon"><MapPinned /></EmptyMedia>
                  <EmptyTitle>暂无发布资料</EmptyTitle>
                  <EmptyDescription>装修公司完成公开资料并提交后，会进入此列表。</EmptyDescription>
                </EmptyHeader>
              </Empty>
            </TableCell>
          </TableRow>
        )}
      </TableBody>
    </Table>
  );
}
