"use client";

import { useState } from "react";
import { Edit3, Plus } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ServiceProviderAreaDialog } from "./service-provider-area-dialog";
import {
  areaStatusMeta,
  formatAreaRegion,
  type ListData,
  type ServiceProviderArea,
  type ServiceProviderMutationResult,
} from "./service-provider-types";

type RequestError = Error & { code?: string; status?: number };

export function ServiceProviderAreaSection({
  areas,
  profileVersion,
  canManage,
  pending,
  onMutated,
  onError,
  onMessage,
  onLoadPage,
}: {
  areas: ListData<ServiceProviderArea>;
  profileVersion: number;
  canManage: boolean;
  pending: boolean;
  onMutated: (result: ServiceProviderMutationResult) => void;
  onError: (error: RequestError | null) => void;
  onMessage: (message: string) => void;
  onLoadPage: (page: number) => Promise<void>;
}) {
  const [editing, setEditing] = useState<ServiceProviderArea | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const currentPage = areas.pagination.page || 1;
  const totalPages = areas.pagination.totalPages || 0;

  function openDialog(area: ServiceProviderArea | null) {
    setEditing(area);
    setDialogOpen(true);
    onError(null);
    onMessage("");
  }

  return (
    <section className="flex flex-col gap-4" aria-label="服务区域">
      <div className="flex justify-end">
        <Button type="button" disabled={!canManage || pending || !profileVersion} onClick={() => openDialog(null)}>
          <Plus data-icon="inline-start" />
          新增区域
        </Button>
      </div>
      <div className="overflow-hidden rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>区域</TableHead>
              <TableHead>行政区划代码</TableHead>
              <TableHead>优先级</TableHead>
              <TableHead>展示状态</TableHead>
              <TableHead className="w-24 text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {areas.list.length ? areas.list.map((area) => {
              const meta = areaStatusMeta[area.status];
              return (
                <TableRow key={area.id}>
                  <TableCell className="font-medium">{formatAreaRegion(area) || "-"}</TableCell>
                  <TableCell className="tabular-nums">{area.adcode}</TableCell>
                  <TableCell className="tabular-nums">{area.priority}</TableCell>
                  <TableCell><Badge variant={meta.variant}>{meta.label}</Badge></TableCell>
                  <TableCell className="text-right">
                    <Button type="button" size="sm" variant="ghost" disabled={!canManage || pending} onClick={() => openDialog(area)}>
                      <Edit3 data-icon="inline-start" />
                      编辑
                    </Button>
                  </TableCell>
                </TableRow>
              );
            }) : (
              <TableRow>
                <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                  暂无服务区域
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      <div className="flex flex-col justify-between gap-2 text-sm text-muted-foreground sm:flex-row sm:items-center">
        <span className="tabular-nums">当前显示 {areas.list.length} 个，共 {areas.pagination.total} 个</span>
        <div className="flex gap-2">
          <Button type="button" size="sm" variant="outline" disabled={pending || currentPage <= 1} onClick={() => void onLoadPage(currentPage - 1)}>上一页</Button>
          <Badge variant="outline" className="tabular-nums">第 {currentPage} / {Math.max(totalPages, 1)} 页</Badge>
          <Button type="button" size="sm" variant="outline" disabled={pending || !totalPages || currentPage >= totalPages} onClick={() => void onLoadPage(currentPage + 1)}>下一页</Button>
        </div>
      </div>
      <ServiceProviderAreaDialog
        open={dialogOpen}
        editing={editing}
        profileVersion={profileVersion}
        onOpenChange={setDialogOpen}
        onMutated={onMutated}
        onError={onError}
        onMessage={onMessage}
      />
    </section>
  );
}
